const _ = require('lodash');
const moment = require('moment');

const {
	PayoutStates,
	BookingStatus,
	TaskTags,
	PayoutType,
	PayoutSources,
	RateType,
	OTAs,
	Services,
	EXTRA_FEE,
} = require('@utils/const');
const models = require('@models');

const PAY_METHOD = {
	OTA: 'OTA',
	NH: 'NH',
	CT: 'CT',
	TM: 'TM',
	MOMO: 'MOMO',
	VNPAY: 'VNPAY',
	APPOTAPAY: 'APPOTAPAY',
	CNT: 'CNT',
	VOUCHER: 'VOUCHER',
	DEFAULT: '',
};
const HAS_TAX_METHOD = [
	PAY_METHOD.OTA,
	PAY_METHOD.NH,
	PAY_METHOD.CT,
	PAY_METHOD.MOMO,
	PAY_METHOD.VNPAY,
	PAY_METHOD.APPOTAPAY,
];

const PAYOUT_NH_METHOD = [OTAs.Traveloka, OTAs.Airbnb, OTAs.Mytour];

function hasTax(payType) {
	return HAS_TAX_METHOD.includes(payType);
}

function getPayType(booking, payout) {
	const isPaid = booking && booking.rateType === RateType.PAY_NOW;

	if (!payout && isPaid && booking.otaName === OTAs.Agoda) return PAY_METHOD.OTA;

	if (!payout && isPaid && PAYOUT_NH_METHOD.includes(booking.otaName)) return PAY_METHOD.NH;

	if (!payout) return PAY_METHOD.DEFAULT;

	switch (payout.source) {
		case PayoutSources.CASH:
		case PayoutSources.PERSONAL_BANKING:
			return PAY_METHOD.TM;
		case PayoutSources.BANKING:
			return payout.otaId && payout.otaName === OTAs.Agoda ? PAY_METHOD.OTA : PAY_METHOD.NH;
		case PayoutSources.ONLINE_WALLET:
		case PayoutSources.THIRD_PARTY:
			return payout.collectorCustomName;
		case PayoutSources.SWIPE_CARD:
			return PAY_METHOD.CT;
		case PayoutSources.VOUCHER:
			return PAY_METHOD.VOUCHER;
		default:
			return PAY_METHOD.DEFAULT;
	}
}

async function earningStats({
	blockId,
	filters,
	from,
	to,
	dateKey = 'createdAt',
	findCanceled = false,
	isExportReservations = false,
	byDays = false,
	populatePayoutUser = true,
}) {
	const isDtb = dateKey === 'distribute';
	const bookingStatus = findCanceled ? [BookingStatus.CANCELED] : [BookingStatus.CONFIRMED, BookingStatus.NOSHOW];
	const query = {
		error: 0,
		status: bookingStatus,
		ignoreFinance: false,
	};
	if (isDtb) {
		query.from = { $lte: to };
		query.to = { $gt: from };
	} else {
		query[dateKey] = { $gte: from, $lt: to };
	}
	if (filters) {
		query.$and = [typeof filters === 'string' ? JSON.parse(filters) : filters];
	}

	const { filter: blockFilters } = await models.Block.getStartRunningFilters(blockId);
	_.assign(query, blockFilters);

	const pineline = models.Booking.find(query).select({
		from: 1,
		to: 1,
		otaName: 1,
		guestId: 1,
		otaBookingId: 1,
		otaFee: 1,
		blockId: 1,
		currency: 1,
		currencyExchange: 1,
		price: 1,
		roomPrice: 1,
		status: 1,
		hosting: 1,
		relativeBookings: 1,
		rateType: 1,
		serviceType: 1,
		reservateRooms: 1,
		..._.values(EXTRA_FEE).reduce((acc, cur) => ({ ...acc, [cur]: 1 }), {}),
	});

	const populateFields = [
		{
			path: 'relativeBookings',
			select: `price ${EXTRA_FEE.VAT_FEE} otaFee status roomPrice blockId currency currencyExchange`,
			options: {
				lean: true,
			},
		},
		{
			path: 'blockId',
			select: '_id info.name manageFee startRunning',
			options: {
				lean: true,
			},
		},
	];

	if (isExportReservations) {
		populateFields.push(
			{
				path: 'guestId',
				select: 'fullName',
				options: {
					lean: true,
				},
			},
			{
				path: 'hosting',
				select: 'username name',
				options: {
					lean: true,
				},
			},
			{
				path: 'reservateRooms',
				select: 'info.roomNo',
				options: {
					lean: true,
				},
			}
		);
	}

	const bookings = await pineline.populate(populateFields).lean();
	const taxRate = await models.Setting.getReportTax(moment(from).format('Y-MM-DD'), moment(to).format('Y-MM-DD'));

	const earning = { amount: 0, otas: {} };
	const reservations = { amount: 0, otas: {} };
	const revenues = { amount: 0, otas: {} };
	const transactionFees = {};
	let unpaidOTAFeeAmount = 0;
	let actuallyAmount = 0;
	let advancePaymentAmount = 0;
	let refundAmount = 0;
	let tbRevenue = 0;
	let revenueAmount = 0;
	let taxFeeAmount = 0;

	const bookingIds = _.chain(bookings)
		.map(b => [b._id, ..._.map(b.relativeBookings, '_id')])
		.flatten()
		.uniqBy(_.toString)
		.value();

	const _payouts = await models.Payout.getBookingPayouts(bookingIds, populatePayoutUser, true, true);

	_payouts.forEach(payout => {
		if (payout.payoutType === PayoutType.REFUND) {
			payout.currencyAmount.exchangedAmount = -Math.abs(payout.currencyAmount.exchangedAmount);
		}
	});

	const payouts = _.groupBy(_payouts, 'bookingId');
	const bookingsVAT = {};

	if (isExportReservations) {
		const taskVAT = await models.TaskCategory.findOne({ tag: TaskTags.VAT }).select('_id').lean();
		if (taskVAT) {
			const taskList = await models.Task.find({
				category: taskVAT._id,
				bookingId: { $in: bookingIds },
			})
				.select('bookingId')
				.lean();
			taskList.forEach(task => {
				_.forEach(task.bookingId, bId => {
					bookingsVAT[bId] = true;
				});
			});
		}
	}

	let exportReservations = [];
	to.setDate(to.getDate() + 1);
	const totalValues = {};

	bookings.forEach(booking => {
		const { startRunning, manageFee } = booking.blockId;

		const distribute = models.Booking.distribute(
			booking.from,
			booking.to,
			startRunning ? _.max([from, new Date(startRunning).zeroHours()]) : from,
			to
		);
		const exchangeCurrency = models.Booking.exchangeCurrency(booking.currencyExchange, booking.currency);

		let totalPrice = _.get(totalValues, [booking.otaBookingId, 'price']);
		let totalOtaFee = _.get(totalValues, [booking.otaBookingId, 'otaFee']);

		if (!totalPrice || !totalOtaFee) {
			const relBookings = booking.relativeBookings;
			if (!totalPrice) {
				totalPrice = exchangeCurrency(booking.price) + _.sumBy(relBookings, rb => exchangeCurrency(rb.price));
				_.set(totalValues, [booking.otaBookingId, 'price'], totalPrice);
			}
			if (!totalOtaFee) {
				totalOtaFee = booking.otaFee + _.sumBy(relBookings, 'otaFee');
				_.set(totalValues, [booking.otaBookingId, 'otaFee'], totalOtaFee);
			}
		}

		let _price = 0;
		let _fee = 0;
		let feeStatus;
		const checkin = booking.from;
		const checkout = booking.to;
		const diffCheckOutWithFrom = checkout.diffDays(from);
		if (!byDays && diffCheckOutWithFrom <= 0) return;

		const _id = booking._id.toString();
		const feeConfig = models.Block.getFeeConfig(manageFee, from);
		const revenueKeys = models.Block.getRevenueKeys(feeConfig);

		const __price = booking.roomPrice + _.sum(revenueKeys.map(k => booking[k] || 0));

		const price = isDtb ? distribute(exchangeCurrency(__price)) : exchangeCurrency(__price);
		const roomPrice = isDtb ? distribute(exchangeCurrency(booking.roomPrice)) : exchangeCurrency(booking.roomPrice);
		const rate = totalPrice > 0 ? price / totalPrice : 0;

		let realPrice = [];
		advancePaymentAmount += price;
		if (!earning.otas[booking.otaName]) earning.otas[booking.otaName] = 0;

		const { shortTerm, longTerm, hasTax: isBlockHasTax } = booking.blockId.manageFee;
		const czRate = booking.serviceType === Services.Month ? longTerm : shortTerm;

		earning.amount += price;
		earning.otas[booking.otaName] += price;
		tbRevenue += price * czRate;

		const bookingPayouts = _.compact(
			_.flatten([payouts[_id], ..._.map(booking.relativeBookings, rbid => payouts[rbid._id])])
		);

		_.forEach(bookingPayouts, pay => {
			const isBookingsHaveInvalidBlock = !_.includes(blockId, _.toString(booking.blockId._id));
			const isStateEqConfirmed = pay.state === PayoutStates.CONFIRMED;
			const payType = getPayType(null, pay);

			let exAmount = pay.currencyAmount.exchangedAmount;
			if (totalPrice < exAmount && isBookingsHaveInvalidBlock && pay.payoutType === PayoutType.RESERVATION) {
				exAmount = totalPrice;
			}
			const exchangePrice = isDtb ? distribute(exAmount) : exAmount;

			let _transactionFee = 0;
			if (pay.transactionFee) {
				_transactionFee = pay.transactionFee * rate;
				transactionFees[_id] = transactionFees[_id] || 0;
				transactionFees[_id] += _transactionFee;
			}

			if (
				exchangePrice < 0 &&
				pay.payoutType === PayoutType.RESERVATION &&
				pay.source === PayoutSources.BANKING &&
				!pay.createdBy
			) {
				_fee += Math.abs(exchangePrice);

				if (isStateEqConfirmed) {
					advancePaymentAmount += _fee;
					feeStatus = PayoutStates.PAID;
				} else if (pay.state === PayoutStates.PROCESSING) {
					feeStatus = PayoutStates.PROCESSING;
				}
			} else {
				if (
					isBlockHasTax &&
					[PayoutType.REFUND, PayoutType.RESERVATION].includes(pay.payoutType) &&
					hasTax(payType)
				) {
					taxFeeAmount += (exchangePrice - _transactionFee) * taxRate;
				}

				_price += exchangePrice;
				realPrice.push({
					exchangePrice,
					source: pay.source,
					payoutType: pay.payoutType,
					state: pay.state,
					ota: pay.source === PayoutSources.BANKING && !pay.createdBy,
				});
			}
		});

		let fee = booking.otaFee ? booking.otaFee * rate : _fee;

		if (booking.relativeBookings && booking.relativeBookings.length) {
			fee = _.round(totalOtaFee * rate);
			const reservationPayouts = [];
			const _allPayouts = _.compact(
				_.flattenDeep([payouts[booking._id], ...booking.relativeBookings.map(rb => payouts[rb._id])])
			);

			_.forEach(_allPayouts, pay => {
				if (PayoutType.RESERVATION === pay.payoutType || PayoutType.REFUND === pay.payoutType) {
					reservationPayouts.push({
						exchangePrice: pay.currencyAmount.exchangedAmount * rate,
						source: pay.source,
						payoutType: pay.payoutType,
						state: pay.state,
						ota: pay.source === PayoutSources.BANKING && !pay.createdBy,
					});
				}
			});

			if (reservationPayouts.length) {
				realPrice = [
					...reservationPayouts,
					..._.filter(realPrice, rp => rp.payoutType !== PayoutType.RESERVATION),
				];
			}
		}

		let resPayoutAmount = 0;

		_.forEach(realPrice, rp => {
			const isStateEqConfirmed = rp.state === PayoutStates.CONFIRMED;
			if (rp.payoutType === PayoutType.REFUND) {
				const refund = Math.abs(rp.exchangePrice);
				tbRevenue -= czRate * refund;
				refundAmount += refund;

				if (isStateEqConfirmed) {
					advancePaymentAmount += refund;
				}
			}

			const { RESERVATION, SERVICE, OTHER, VAT } = PayoutType;
			if (isStateEqConfirmed && [RESERVATION, SERVICE, OTHER, VAT].includes(rp.payoutType)) {
				if (rp.payoutType === RESERVATION) resPayoutAmount += rp.exchangePrice;
				advancePaymentAmount -= rp.exchangePrice;
			}
		});

		if (_.ceil(resPayoutAmount, -3) === _.ceil(price, -3) && !feeStatus && booking.otaFee > 0) {
			advancePaymentAmount += fee;
		}

		revenueAmount += price;

		if (!revenues.otas[booking.otaName]) revenues.otas[booking.otaName] = 0;
		revenues.otas[booking.otaName] += _price;
		revenues.amount += _price;

		if (isBlockHasTax && _.isEmpty(payouts[_id])) {
			taxFeeAmount += hasTax(getPayType(booking)) ? (price - booking.otaFee * rate) * taxRate : 0;
		}

		tbRevenue -= czRate * fee;
		unpaidOTAFeeAmount += fee;
		advancePaymentAmount -= fee;

		if (isExportReservations) {
			const night = Math.min(
				diffCheckOutWithFrom,
				checkout.diffDays(checkin),
				to.diffDays(checkin),
				to.diffDays(from)
			);

			if (booking.hosting && booking.hosting._id) {
				booking.hosting._id = booking.hosting._id.toString();
			}

			const rs = {
				name: booking.guestId && booking.guestId.fullName,
				otaName: booking.otaName,
				otaBookingId: booking.otaBookingId,
				night,
				rooms: _.map(booking.reservateRooms, 'info.roomNo').join(', '),
				price,
				fee,
				feeStatus,
				roomPrice,
				checkin: checkin.toDateMysqlFormat(),
				checkout: checkout.toDateMysqlFormat(),
				house: _.get(booking.blockId, 'info.name'),
				hosting: booking.hosting ? [booking.hosting] : [],
				realPrice,
				VAT: bookingsVAT[_id],
				transactionFee: transactionFees[_id],
				rate,
			};

			_.values(EXTRA_FEE).forEach(feeKey => {
				rs[feeKey] = isDtb ? distribute(booking[feeKey]) : booking[feeKey];
			});

			exportReservations.push(rs);
		}

		if (!reservations.otas[booking.otaName]) reservations.otas[booking.otaName] = 0;
		reservations.otas[booking.otaName]++;
	});

	if (isExportReservations) {
		exportReservations = _.sortBy(exportReservations, ['otaBookingId']);
	}

	reservations.amount = _.sum(_.values(reservations.otas));
	const transactionFeeAmount = _.sum(_.values(transactionFees));
	const feeAmount = transactionFeeAmount + unpaidOTAFeeAmount + refundAmount;
	const receiableAmount = revenueAmount;
	const czTaxFeeAmount = taxFeeAmount * (tbRevenue / (revenueAmount - feeAmount));

	revenueAmount -= feeAmount + taxFeeAmount;
	tbRevenue -= czTaxFeeAmount;

	const revenueChart = {
		tbRevenue: _.round(tbRevenue),
		hostRevenue: _.round(revenueAmount - tbRevenue),
		otaFeeAmount: _.round(unpaidOTAFeeAmount),
		transactionFeeAmount: _.round(transactionFeeAmount),
		refundAmount: _.round(refundAmount),
		taxFeeAmount: _.round(taxFeeAmount),
	};

	actuallyAmount = receiableAmount - (unpaidOTAFeeAmount + refundAmount + advancePaymentAmount);
	const receivableChart = {
		actuallyAmount: _.round(actuallyAmount),
		advancePaymentAmount: Math.abs(advancePaymentAmount) > 1000 ? _.round(advancePaymentAmount) : 0,
	};

	const charts = { revenueChart, receivableChart };
	return { earning, reservations, revenues, charts, exportReservations };
}

module.exports = {
	earningStats,
};
