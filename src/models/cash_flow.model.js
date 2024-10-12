/* eslint-disable no-lonely-if */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const {
	BookingStatus,
	PayoutStates,
	OTAsHavePrePaid,
	PayoutType,
	BookingPaymentStatus,
	CASH_FLOW_OBJECT,
	RateType,
	PayoutSources,
	PayoutCollectStatus,
	Services,
	EXTRA_FEE,
	OTAsListingConfig,
	// OTAs,
} = require('@utils/const');
const { CashFlowLock } = require('@utils/lock');
const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');

const { Schema } = mongoose;

const CashFlowSchema = new Schema(
	{
		period: { type: String, required: true }, // YYYY-MM
		blockId: { type: Schema.Types.ObjectId, ref: 'Block', required: true },
		bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
		payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
		from: String,
		to: String,
		serviceType: Number,
		payoutSource: String,
		otaBookingId: String,
		otaName: String,
		flows: [
			{
				source: String,
				destination: String,
				payoutSource: String,
				total: Number,
				remaining: Number,
				payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
			},
		],
	},
	{
		timestamps: {
			updatedAt: false,
		},
	}
);

const MIXS = 3;

const utils = {
	isFromTP(p) {
		return p.source === PayoutSources.ONLINE_WALLET || p.source === PayoutSources.THIRD_PARTY;
	},
	isFromBackup(p) {
		return p.source === PayoutSources.BACKUP_CASH;
	},
	isConfirmed(p) {
		return p.state === PayoutStates.CONFIRMED;
	},
	isToCompanyBank(p) {
		return p.source === PayoutSources.BANKING || p.source === PayoutSources.SWIPE_CARD;
	},
	isToPersonalBank(p) {
		return p.source === PayoutSources.PERSONAL_BANKING;
	},
	isVoucher(p) {
		return p.source === PayoutSources.VOUCHER;
	},
	isPaidFromOTA(b) {
		return b.rateType === RateType.PAY_NOW && OTAsHavePrePaid.includes(b.otaName);
	},
	isB2bBooking(b) {
		return b.paymentStatus === BookingPaymentStatus.Loan;
	},
	isFromUser(p) {
		return !!p.createdBy;
	},
	isUserConfirmed(p) {
		return !p.collectStatus || p.collectStatus === PayoutCollectStatus.Confirmed;
	},
	needUserConfirmed(p) {
		return !!p.collectStatus;
	},
	isAdvSalary(p) {
		return p.collectSAStatus === PayoutCollectStatus.Confirmed;
	},
	isIgnoreFinance(b) {
		return b.ignoreFinance;
	},
	isHandover(p) {
		return !!p.handoverId;
	},
	isRefund(p) {
		return p.payoutType === PayoutType.REFUND;
	},
	isProcessing(payments) {
		return !payments.length || payments.some(p => !utils.isConfirmed(p));
	},
	getConfirmedSource(payment) {
		if (payment.isOwnerCollect) {
			return utils.isToCompanyBank(payment) || utils.isToPersonalBank(payment)
				? CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT
				: CASH_FLOW_OBJECT.HOST_CASH_FUND;
		}

		return utils.isToCompanyBank(payment) || utils.isFromTP(payment)
			? CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT
			: CASH_FLOW_OBJECT.CASH_FUND;
	},
	filterPayments(payouts) {
		const roomPricePayments = [];
		const servicePayments = [];
		const depositPayments = [];
		const refundPayments = [];
		const otaPayments = [];
		const vatPayments = [];

		payouts.forEach(p => {
			if (p.fromOTA) {
				otaPayments.push(p);
				return;
			}
			if (p.payoutType === PayoutType.VAT) {
				vatPayments.push(p);
				return;
			}
			if (p.payoutType === PayoutType.DEPOSIT) {
				depositPayments.push(p);
				return;
			}
			if (p.payoutType === PayoutType.RESERVATION) {
				roomPricePayments.push(p);
				return;
			}
			if (p.payoutType === PayoutType.REFUND) {
				refundPayments.push(p);
				return;
			}
			servicePayments.push(p);
		});

		return {
			roomPricePayments,
			servicePayments,
			depositPayments,
			refundPayments,
			otaPayments,
			vatPayments,
		};
	},
	sortPayments(payments) {
		const sorterType = {
			[PayoutType.VAT]: 3,
			[PayoutType.SERVICE]: 2,
			[PayoutType.RESERVATION]: 1,
			[PayoutType.DEPOSIT]: -1,
			[PayoutType.REFUND]: -2,
		};
		const sorterSource = {
			[PayoutSources.BANKING]: 1,
			[PayoutSources.SWIPE_CARD]: 1,
			[PayoutSources.ONLINE_WALLET]: 1,
			[PayoutSources.THIRD_PARTY]: 1,
			[PayoutSources.BACKUP_CASH]: -1,
		};

		return payments.sort((a, b) => {
			return (
				(sorterType[b.payoutType] || 0) - (sorterType[a.payoutType] || 0) ||
				(sorterSource[b.source] || 0) - (sorterSource[a.source] || 0) ||
				a.currencyAmount.exchangedAmount - b.currencyAmount.exchangedAmount
			);
		});
	},
	calcRemaining(objs) {
		objs.forEach(obj => {
			if (obj.remaining === undefined) {
				const transferred = objs.filter(o => o !== obj && o.source === obj.destination);
				obj.remaining = obj.total - (_.sumBy(transferred, 'total') || 0);

				if (obj.remaining && Math.abs(obj.remaining) <= MIXS) {
					const line = objs.find(o => o.source === obj.destination);
					if (line) {
						line.total += obj.remaining;
						obj.remaining = 0;
					}
				}
			}
		});

		return objs;
	},
	syncRemainingFlows(flows) {
		flows
			.filter(f => f.length && _.isArray(f))
			.forEach((flow, i, fflows) => {
				if (i === 0) return;

				const prevFlow = _.last(fflows[i - 1]);
				const currentFlow = _.first(flow);

				if (prevFlow.remaining && currentFlow.total && currentFlow.source === prevFlow.destination) {
					prevFlow.remaining -= currentFlow.total;
				}
			});

		return _.flatten(flows);
	},
	calcTransactionFee(currentFee, dtAmount, totalAmount) {
		const rrate = Math.min(1, dtAmount / totalAmount);
		return _.round(currentFee * rrate);
	},
};

CashFlowSchema.statics = {
	getPaymentOTAFlow({
		total,
		otaFee,
		transactionFee,
		isConfirmed,
		isBk,
		payoutId,
		payoutSource,
		totalConfirmed,
		inReport,
	}) {
		const mflows = [];

		if (isBk && Math.abs(total) < MIXS) {
			return mflows;
		}

		if (isBk && !isConfirmed) {
			mflows.push({
				destination: CASH_FLOW_OBJECT.IGNORE_PRICE,
				total,
				remaining: total,
				payoutId,
				payoutSource,
			});
			return mflows;
		}

		if (total) {
			mflows.push(
				{
					destination: CASH_FLOW_OBJECT.GUEST,
					total,
				},
				{
					source: CASH_FLOW_OBJECT.GUEST,
					destination: CASH_FLOW_OBJECT.OTA_COLLECT,
					total,
				}
			);
		}

		let currentSource = CASH_FLOW_OBJECT.OTA_COLLECT;

		if (otaFee) {
			total -= otaFee;
			mflows.push({
				source: currentSource,
				destination: CASH_FLOW_OBJECT.COMMISSION_OTA,
				total: otaFee,
			});
		}

		totalConfirmed = totalConfirmed || total;

		if (transactionFee) {
			if (inReport) {
				mflows.push({
					source: currentSource,
					destination: CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
					total: totalConfirmed,
				});
				currentSource = CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT;
			}

			if (!isBk) {
				mflows.push({
					source: currentSource,
					destination: CASH_FLOW_OBJECT.TRANSACTION_FEE,
					total: transactionFee,
				});
				total -= transactionFee;
				totalConfirmed -= transactionFee;
			}
		}
		if (isConfirmed) {
			mflows.push({
				source: currentSource,
				destination: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
				total: totalConfirmed,
			});
			if (isBk) {
				mflows.push({
					source: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
					destination: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
					total: totalConfirmed,
				});
				if (transactionFee) {
					mflows.push({
						source: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
						destination: CASH_FLOW_OBJECT.TRANSACTION_FEE,
						total: transactionFee,
					});
				}
			} else if (totalConfirmed > total) {
				const diff = totalConfirmed - total;

				mflows.forEach(flow => {
					if (flow.source === CASH_FLOW_OBJECT.GUEST || flow.destination === CASH_FLOW_OBJECT.GUEST) {
						flow.total += diff;
					}
				});
				mflows.push({
					source: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
					destination: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
					total: diff,
				});
			}
		}

		return utils.calcRemaining(mflows.map(f => ({ ...f, payoutId, payoutSource })));
	},

	getFlowFromOTA({ roomPrice, otaFee, payments, distribute, rate, isCharged, isCanceled, isPrePaid }) {
		let mflows = [];
		let paid = 0;
		let addedFee = false;

		if (isPrePaid && payments.length > 1) {
			payments = _.cloneDeep(payments);
			const positive = payments.find(p => p.currencyAmount.exchangedAmount > 0);
			if (positive) {
				const negatives = payments.filter(p => p.currencyAmount.exchangedAmount < 0);
				if (negatives.length) {
					positive.currencyAmount.exchangedAmount += _.sumBy(negatives, 'currencyAmount.exchangedAmount');
					positive.currencyAmount.transactionFee += _.sumBy(negatives, 'transactionFee');

					payments = payments.filter(p => p.currencyAmount.exchangedAmount > 0);
				}
			}
		}

		payments.forEach((payment, index) => {
			let payoutId = payment._id;
			let totalPayment = payment.currencyAmount.exchangedAmount;
			let isConfirmed = utils.isConfirmed(payment);
			let totaldt = distribute(totalPayment * rate);

			if (totalPayment > 0) {
				let isBk = false;
				let total;
				let totalConfirmed;
				let mfee = 0;

				if (isCanceled || isCharged) {
					isBk = true;
					total = totaldt;
				} else {
					if (index !== 0) {
						total = undefined;
						totalConfirmed = totaldt;
					} else if (paid > roomPrice) {
						total = Math.min(paid - roomPrice, totaldt);
						isBk = true;
					} else {
						total = roomPrice;
						totalConfirmed = roomPrice > totaldt ? totaldt : undefined;
						if (totaldt > roomPrice) {
							const t = totaldt - roomPrice;
							const fee = utils.calcTransactionFee(payment.transactionFee, t, totalPayment);
							mfee += fee;
							const pflows = this.getPaymentOTAFlow({
								total: t,
								transactionFee: utils.calcTransactionFee(payment.transactionFee, t, totalPayment),
								isConfirmed,
								isBk: true,
								payoutId,
								payoutSource: payment.source,
								inReport: payment.inReport,
							});
							mflows.push(...pflows);
						}
					}
				}

				paid += total === undefined ? totalConfirmed : total;

				const tf = utils.calcTransactionFee(payment.transactionFee, totaldt, totalPayment);
				const transactionFee = tf - mfee;

				const params = {
					total,
					totalConfirmed,
					transactionFee,
					isConfirmed,
					isBk,
					payoutId,
					payoutSource: payment.source,
					inReport: payment.inReport,
				};
				if (!isBk && !addedFee) {
					params.otaFee = otaFee;
					addedFee = true;
				}
				const pflows = this.getPaymentOTAFlow(params);
				mflows.push(...pflows);
			} else if (payment.fromOTA && (isCanceled || isCharged)) {
				mflows.push({
					source: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
					destination: CASH_FLOW_OBJECT.COMMISSION_OTA,
					total: Math.abs(totaldt),
					payoutId,
					payoutSource: payment.source,
				});
			}
		});

		if (!paid && !isCanceled) {
			const pflows = this.getPaymentOTAFlow({
				total: roomPrice,
				otaFee,
				isBk: isCharged,
			});
			mflows.push(...pflows);
		}

		return mflows;
	},

	getRefundFlows({ payment, ref, isCanceled, isCharged, isProcessing }) {
		const flows = [];

		const isConfirmed = utils.isConfirmed(payment);
		if ((isCanceled || isCharged) && !isConfirmed) {
			return flows;
		}

		const source =
			isCanceled || isCharged || utils.isFromBackup(payment)
				? CASH_FLOW_OBJECT.BACKUP_CASH_FUND
				: utils.getConfirmedSource(payment);

		flows.push({
			source,
			destination: CASH_FLOW_OBJECT.REFUND,
			total: Math.abs(ref.amount),
		});
		if (isConfirmed && !isProcessing) {
			flows.push({
				source: CASH_FLOW_OBJECT.REFUND,
				destination: CASH_FLOW_OBJECT.GUEST_REFUNDED,
				total: Math.abs(ref.amount),
			});
			if (payment.transactionFee) {
				const fee = utils.calcTransactionFee(
					Math.abs(payment.transactionFee),
					Math.abs(ref.amount),
					Math.abs(payment.currencyAmount.exchangedAmount)
				);
				flows.push({
					source,
					destination: CASH_FLOW_OBJECT.TRANSACTION_FEE,
					total: fee,
				});
			}
		}

		return flows.map(f => ({ ...f, payoutId: payment._id, payoutSource: payment.source }));
	},

	getFlowByPayment({
		payment,
		ref,
		isB2b,
		isCanceled,
		isCharged,
		paid,
		total,
		isProcessing,
		isCalcDeposit,
		isLast,
		flows,
	}) {
		if (utils.isRefund(payment)) {
			return this.getRefundFlows({ payment, isLast, ref, isCanceled, isCharged, isProcessing });
		}

		let sourceConfirmed = null;
		let newFlows = [];
		let isConfirmed = utils.isConfirmed(payment);
		let isFromBackup = utils.isFromBackup(payment);
		let diffPay = ref.amount + paid - total;
		let currentAmount = ref.amount;
		let currentFee = null;

		if (diffPay > MIXS && !isCalcDeposit && !isConfirmed) {
			const diffTotal = Math.min(diffPay, ref.amount);

			newFlows.push({
				destination: CASH_FLOW_OBJECT.IGNORE_PRICE,
				total: diffTotal,
				payoutId: payment._id,
				payoutSource: payment.source,
			});

			currentAmount -= diffTotal;
			if (currentAmount <= 0) {
				return newFlows;
			}
		}
		if (!isB2b && !isFromBackup) {
			newFlows.push({
				destination: CASH_FLOW_OBJECT.GUEST,
				total: currentAmount,
			});
		}
		if (isB2b) {
			sourceConfirmed = CASH_FLOW_OBJECT.B2B;
		} else if (isFromBackup) {
			sourceConfirmed = null;

			flows.forEach(flow => {
				const needFill = Math.min(ref.amount, flow.remaining);

				if (flow.destination === CASH_FLOW_OBJECT.OTA_COLLECT && needFill > MIXS) {
					newFlows.push({
						source: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
						destination: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
						total: needFill,
					});
					flow.remaining -= needFill;
					flow.total -= needFill;

					ref.amount = needFill;

					currentFee = utils.calcTransactionFee(
						payment.transactionFee,
						ref.amount,
						payment.currencyAmount.exchangedAmount
					);
					currentAmount = 0;

					const guestSource = flows.find(f => f.destination === CASH_FLOW_OBJECT.GUEST);
					if (guestSource) {
						guestSource.total -= needFill;
					}
				}
			});
			if (currentAmount) {
				if (isConfirmed) {
					ref.amount = currentAmount;
					sourceConfirmed = CASH_FLOW_OBJECT.BACKUP_CASH_FUND;
				} else {
					ref.amount = 0;
				}
			}
		} else if (utils.isFromUser(payment)) {
			if (utils.isToPersonalBank(payment) || utils.isToCompanyBank(payment) || utils.isVoucher(payment)) {
				newFlows.push({
					source: CASH_FLOW_OBJECT.GUEST,
					destination: CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
					total: currentAmount,
				});
				sourceConfirmed = CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM;
			} else {
				const needUserConfirmed = utils.needUserConfirmed(payment);
				if (needUserConfirmed) {
					newFlows.push({
						source: CASH_FLOW_OBJECT.GUEST,
						destination: CASH_FLOW_OBJECT.USER_UNCONFIRMED,
						total: currentAmount,
					});
				}
				if (utils.isUserConfirmed(payment) || isConfirmed) {
					newFlows.push({
						source: needUserConfirmed ? CASH_FLOW_OBJECT.USER_UNCONFIRMED : CASH_FLOW_OBJECT.GUEST,
						destination: CASH_FLOW_OBJECT.USER_CONFIRMED,
						total: currentAmount,
					});
					sourceConfirmed = CASH_FLOW_OBJECT.USER_CONFIRMED;
					if (utils.isAdvSalary(payment)) {
						newFlows.push({
							source: CASH_FLOW_OBJECT.USER_CONFIRMED,
							destination: CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
							total: currentAmount,
						});
						sourceConfirmed = CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND;
					}
				}
				if (utils.isHandover(payment) && !utils.isAdvSalary(payment)) {
					newFlows.push({
						source: CASH_FLOW_OBJECT.USER_CONFIRMED,
						destination: CASH_FLOW_OBJECT.CASHIER,
						total: currentAmount,
					});
					sourceConfirmed = CASH_FLOW_OBJECT.CASHIER;
				}
			}
		} else if (utils.isFromTP(payment)) {
			newFlows.push({
				source: CASH_FLOW_OBJECT.GUEST,
				destination: CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
				total: currentAmount,
			});

			if (payment.transactionFee && !isCharged && !isCanceled) {
				currentFee = utils.calcTransactionFee(
					payment.transactionFee,
					ref.amount,
					payment.currencyAmount.exchangedAmount
				);
				newFlows.push({
					source: CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
					destination: CASH_FLOW_OBJECT.TRANSACTION_FEE,
					total: currentFee,
				});
				currentAmount -= currentFee;
				currentFee = 0;
			}
			sourceConfirmed = CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT;
		}

		let destination =
			flows && flows.length && isFromBackup ? _.last(flows).destination : utils.getConfirmedSource(payment);

		if (currentAmount && sourceConfirmed && isConfirmed) {
			newFlows.push({
				source: sourceConfirmed,
				destination,
				total: currentAmount,
			});
			if (!isCalcDeposit && !isFromBackup) {
				if (isCharged || isCanceled) {
					const source = destination;
					destination = CASH_FLOW_OBJECT.BACKUP_CASH_FUND;

					newFlows.push({
						source,
						destination,
						total: currentAmount,
					});
				} else if (currentAmount + paid - MIXS > total) {
					const amount = Math.min(currentAmount + paid - total, ref.amount);
					newFlows.push({
						source: destination,
						destination: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
						total: amount,
					});
				}
			}
		}

		if (currentFee || currentFee === null) {
			const f =
				currentFee ||
				utils.calcTransactionFee(payment.transactionFee, currentAmount, payment.currencyAmount.exchangedAmount);
			if (f)
				newFlows.push({
					source: isFromBackup ? CASH_FLOW_OBJECT.BACKUP_CASH_FUND : destination,
					destination: CASH_FLOW_OBJECT.TRANSACTION_FEE,
					total: f,
				});
		}

		return newFlows.map(f => ({ ...f, payoutId: payment._id, payoutSource: payment.source }));
	},

	async setBookingFlowLock({ payoutId, bookingId, otaName, otaBookingId }) {
		try {
			if (payoutId) {
				const payout = await this.model('Payout').findById(payoutId).select('-logs');
				if (!payout) return;

				if (payout.payoutType === PayoutType.PAY) {
					return await this.setPayoutFlow(payout);
				}

				if (!payout.bookingId) return;

				bookingId = payout.bookingId;
			}

			await CashFlowLock.acquire(bookingId ? _.toString(bookingId) : `${otaName}_${otaBookingId}`, () =>
				this.setBookingFlow({ bookingId, otaName, otaBookingId })
			);
		} catch (e) {
			logger.error(e);
		}
	},

	getConfirmedFlows({ bookings, payouts }) {
		const Booking = this.model('Booking');
		const Block = this.model('Block');
		const totalRoomPrice = _.sumBy(bookings, 'roomPrice') - _.sumBy(bookings, 'otaFee');

		const { refundPayments, roomPricePayments, servicePayments, depositPayments, otaPayments, vatPayments } =
			utils.filterPayments(payouts);

		const adds = [];
		const excepts = {};

		bookings.forEach((booking, bIndex) => {
			const isCharged = booking.status === BookingStatus.CHARGED;
			const isCanceled = booking.status === BookingStatus.CANCELED;
			const isMonth = booking.serviceType === Services.Month;
			const roomRate = totalRoomPrice
				? (booking.roomPrice - booking.otaFee) / totalRoomPrice
				: 1 / bookings.length;
			const isLastBooking = bookings.length - 1 === bIndex;
			const isPrePaid = booking.isRatePaid();

			const isProcessing = utils.isProcessing(payouts);
			const isPaidFromOTA = utils.isPaidFromOTA(booking);
			const isIgnoreFinance = utils.isIgnoreFinance(booking);
			const isB2b = utils.isB2bBooking(booking);
			const exchange = Booking.exchangeCurrency(booking.currencyExchange, booking.currency);

			const price = exchange(booking.price);
			const roomPrice = exchange(booking.roomPrice);
			const otaFee = exchange(booking.otaFee);
			const periods = booking.blockId.getPeriods(booking.from, booking.to);

			periods.forEach((period, index) => {
				const distribute = Booking.distribute(booking.from, booking.to, period.from, period.to);
				const feeKeys = Block.getRevenueKeys(booking.blockId.getManageFee(period.from.toDateMysqlFormat()));

				const flows = [];
				const flow2 = [];
				const payments = [...refundPayments];
				const isLastPeriod = index === periods.length - 1;
				const dtRoomPrice = distribute(roomPrice);
				const dtOtaFee = distribute(otaFee);
				const isLast = isLastPeriod && isLastBooking;

				let total = dtRoomPrice;

				if (!isMonth || isLastPeriod) {
					if (price !== roomPrice || isLast) {
						payments.push(...servicePayments);
					}
					payments.push(...depositPayments);

					const serviceFee = _.sum(feeKeys.map(k => booking[k] || 0));
					if (isMonth) {
						total += exchange(serviceFee);
					} else {
						total += distribute(exchange(serviceFee));
					}

					if (feeKeys.includes(EXTRA_FEE.VAT_FEE)) {
						payments.push(...vatPayments);
					} else if (vatPayments.length) {
						let counter =
							_.sumBy(vatPayments, 'currencyAmount.exchangedAmount') - (booking[EXTRA_FEE.VAT_FEE] || 0);

						if (counter > 0) {
							const extVats = [];

							vatPayments.forEach(vatPayment => {
								if (counter > 0) {
									const currentAmount = vatPayment.currencyAmount.exchangedAmount;
									const newAmount = Math.min(counter, currentAmount);

									const transactionFee = vatPayment.transactionFee
										? _.round(vatPayment.transactionFee * (newAmount / currentAmount))
										: 0;

									extVats.push({
										...vatPayment,
										currencyAmount: {
											...vatPayment.currencyAmount,
											amount: newAmount,
											exchangedAmount: newAmount,
										},
										transactionFee,
									});

									counter -= newAmount;
								}
							});

							payments.push(...extVats);
						}
					}
				}

				if (isIgnoreFinance || (isCharged && isProcessing)) {
					if (!isCanceled) {
						flow2.push({
							destination: CASH_FLOW_OBJECT.IGNORE_PRICE,
							total,
							remaining: total,
						});
					}
				} else {
					if (isPaidFromOTA) {
						const pmts = [];
						if (otaPayments.length) {
							pmts.push(...otaPayments);
							payments.push(...roomPricePayments);
						} else {
							pmts.push(...roomPricePayments.filter(p => utils.isToCompanyBank(p)));
							payments.push(...roomPricePayments.filter(p => !utils.isToCompanyBank(p)));
						}

						flow2.push(
							...this.getFlowFromOTA({
								roomPrice: dtRoomPrice,
								otaFee: dtOtaFee,
								payments: pmts,
								distribute,
								rate: roomRate,
								isCharged,
								isCanceled,
								isPrePaid,
							})
						);
					} else {
						payments.push(...roomPricePayments);
						if (!isCanceled && !isCharged && isB2b) {
							flows.push(
								{
									destination: CASH_FLOW_OBJECT.GUEST,
									total,
								},
								{
									source: CASH_FLOW_OBJECT.GUEST,
									destination: CASH_FLOW_OBJECT.B2B,
									total,
								}
							);
						}
						if (dtOtaFee && !isCanceled) {
							const payment =
								otaPayments[0] ||
								roomPricePayments.find(
									r => Math.abs(r.currencyAmount.exchangedAmount) === Math.abs(otaFee)
								) ||
								_.maxBy(roomPricePayments, 'currencyAmount.exchangedAmount');

							const destination = OTAsListingConfig[booking.otaName]
								? CASH_FLOW_OBJECT.COMMISSION_OTA
								: CASH_FLOW_OBJECT.COMMISSION_COZRUM;

							if (isCharged) {
								flow2.push([
									{
										source: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
										destination,
										total: dtOtaFee,
										remaining: dtOtaFee,
										payoutId: _.get(payment, '_id'),
										payoutSource: _.get(payment, 'source'),
									},
								]);
							} else {
								flow2.push([
									{
										source: payment
											? utils.getConfirmedSource(payment)
											: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
										destination,
										total: dtOtaFee,
										remaining: dtOtaFee,
										payoutId: _.get(payment, '_id'),
										payoutSource: _.get(payment, 'source'),
									},
								]);
							}
						}
					}

					let paid = isPaidFromOTA ? dtRoomPrice : 0;
					let isCalcDeposit = payments.some(p => p.isCalcDeposit);

					utils.sortPayments(payments).forEach(payment => {
						const { exchangedAmount } = payment.currencyAmount;

						payment.transactionFee = payment.transactionFee || 0;
						excepts[payment._id] = excepts[payment._id] || 0;
						const isPositive = exchangedAmount >= 0;

						const vals = [exchangedAmount, exchangedAmount - excepts[payment._id]];
						if (!isLast && !utils.isFromBackup(payment)) {
							if (paid >= 0) {
								vals.push(isPositive ? total : -total);
							}
							vals.push(isPositive ? total - paid : -(total - paid));
						}

						const amount = isPositive ? _.min(vals) : _.max(vals);
						if (!amount) {
							return;
						}

						const ref = { amount };

						if (flows.length) {
							flows.push(
								...this.getFlowByPayment({
									payment,
									ref,
									isCharged,
									isCanceled,
									paid,
									total,
									isLastPeriod,
									isCalcDeposit,
									isB2b,
									isLast,
								})
							);
						} else {
							flow2.push(
								utils.calcRemaining(
									this.getFlowByPayment({
										payment,
										ref,
										isCharged,
										isCanceled,
										paid,
										total,
										isLastPeriod,
										isCalcDeposit,
										isB2b,
										flows: _.flatten(flow2),
										isLast,
									})
								)
							);
						}

						excepts[payment._id] += ref.amount;
						paid += ref.amount;
					});

					if (paid + MIXS < total && !isCanceled) {
						const totalUnpaid = total - paid;
						flow2.push({
							destination: isCharged ? CASH_FLOW_OBJECT.IGNORE_PRICE : CASH_FLOW_OBJECT.UNPAID,
							total: totalUnpaid,
							remaining: totalUnpaid,
						});
					}
				}

				if (flows.length || flow2.length) {
					adds.push({
						period: period.period,
						blockId: booking.blockId._id,
						bookingId: booking._id,
						from: period.from.toDateMysqlFormat(),
						to: period.to.toDateMysqlFormat(),
						serviceType: booking.serviceType,
						otaBookingId: booking.otaBookingId,
						otaName: booking.otaName,
						flows: [...utils.calcRemaining(flows), ...utils.syncRemainingFlows(flow2)],
					});
				}
			});
		});

		return adds;
	},

	getBookingFlows({ bookings, payouts }) {
		const adds = [];

		if (bookings.some(b => b.status === BookingStatus.DECLINED)) return adds;

		const confirmedStatus = [BookingStatus.CONFIRMED, BookingStatus.CHARGED, BookingStatus.NOSHOW];
		bookings.sort((a, b) => confirmedStatus.indexOf(b.status) - confirmedStatus.indexOf(a.status));
		const confirmedBookings = bookings.filter(b => confirmedStatus.includes(b.status));

		if (!confirmedBookings.length && payouts.length) {
			adds.push(...this.getConfirmedFlows({ bookings, payouts, isAllCharged: true }));
		}
		if (confirmedBookings.length) {
			adds.push(...this.getConfirmedFlows({ bookings: confirmedBookings, payouts }));
		}

		return adds;
	},

	async setBookingFlow({ otaName, otaBookingId, bookingId }) {
		const filter = bookingId
			? {
					$or: [
						{
							_id: bookingId,
						},
						{
							relativeBookings: bookingId,
						},
					],
			  }
			: {
					otaName,
					otaBookingId,
			  };

		const bookings = await this.model('Booking')
			.find(filter)
			.select('-histories')
			.populate('blockId', 'reportConfig manageFee startRunning');

		if (!bookings.length) {
			return;
		}

		const payouts = await this.model('Payout')
			.find({
				bookingId: _.map(bookings, '_id'),
				state: { $ne: PayoutStates.DELETED },
				$or: [
					{
						payoutType: { $ne: PayoutType.DEPOSIT },
					},
					{
						payoutType: { $eq: PayoutType.DEPOSIT },
						isCalcDeposit: true,
					},
				],
			})
			.select('-logs')
			.lean();

		payouts.forEach(payout => {
			if (payout.payoutType === PayoutType.REFUND) {
				payout.currencyAmount.exchangedAmount = -Math.abs(payout.currencyAmount.exchangedAmount);
			}
		});

		const fPayouts = _.uniqBy(payouts, p => (p.fromOTA ? p.productId || p.otaId : p._id.toString()));
		const flows = this.getBookingFlows({ bookings, payouts: fPayouts });

		await this.deleteMany({ bookingId: { $in: _.map(bookings, '_id') } });

		if (flows.length) {
			await this.insertMany(flows);
		}
	},

	getPayoutSource(payout) {
		if (utils.isToCompanyBank(payout)) {
			return payout.isInternal ? CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT : CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT;
		}
		if (utils.isToPersonalBank(payout)) {
			return payout.isInternal ? CASH_FLOW_OBJECT.CASH_FUND : CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT;
		}
		return payout.isInternal ? CASH_FLOW_OBJECT.CASH_FUND : CASH_FLOW_OBJECT.HOST_CASH_FUND;
	},

	async getPayoutDes(payout) {
		const ctg = await this.model('PayoutCategory').findById(payout.categoryId).select('flowObject');
		return (ctg && ctg.flowObject) || CASH_FLOW_OBJECT.OTHER_FEE;
	},

	async setPayoutFlow(payout) {
		try {
			await CashFlowLock.acquire(_.toString(payout._id), async () => {
				if (payout.state === PayoutStates.DELETED || payout.ignoreReport) {
					await this.deleteMany({ payoutId: payout._id });

					return;
				}

				const block = await this.model('Block').findById(payout.blockIds[0]).select('manageFee reportConfig');
				const Payout = this.model('Payout');

				const periods = payout.getPeriods();
				const objs = [];

				periods.forEach(period => {
					const amount = Payout.getDistributedAmount(payout, period);
					if (!amount) return;

					const [from] = block.findDatesOfPeriod(period);
					const config = block.getManageFee(from.toDateMysqlFormat());

					if (config.shareExpense) {
						objs.push({
							period,
							source: this.getPayoutSource(payout),
							amount,
						});
					} else if (!payout.isInternal) {
						objs.push({
							period,
							amount,
							source: utils.isToCompanyBank(payout)
								? CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT
								: CASH_FLOW_OBJECT.CASH_FUND,
						});
					}
				});

				if (!objs.length) return;

				const destination = await this.getPayoutDes(payout);

				await this.deleteMany({ payoutId: payout._id });

				await this.insertMany(
					objs.map(obj => ({
						period: obj.period,
						blockId: payout.blockIds[0],
						payoutId: payout._id,
						flows: [
							{
								destination,
								source: obj.source,
								payoutSource: payout.source,
								total: obj.amount,
								remaining: obj.amount,
							},
						],
					}))
				);
			});
		} catch (e) {
			logger.error(e);
		}
	},

	onCreateOrUpdatePayout(payout) {
		if (payout.payoutType !== PayoutType.PAY) return;

		this.setPayoutFlow(payout);
	},
};

eventEmitter.on(EVENTS.UPDATE_CASH_FLOW, args => FlowModel.setBookingFlowLock(args));
eventEmitter.on(EVENTS.CREATE_PAYOUT, args => FlowModel.onCreateOrUpdatePayout(args));
eventEmitter.on(EVENTS.UPDATE_PAYOUT, args => FlowModel.onCreateOrUpdatePayout(args));

const FlowModel = mongoose.model('CashFlow', CashFlowSchema, 'cash_flow2');
module.exports = FlowModel;
