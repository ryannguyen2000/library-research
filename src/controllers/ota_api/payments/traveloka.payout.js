const _ = require('lodash');
const moment = require('moment');
const parseCsv = require('csv-parse/lib/sync');

// const fetchRetry = require('@utils/fetchRetry');
const { OTAs, PayoutStates, PayoutType } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
// const { changeHotelSession } = require('@controllers/ota_api/headers/traveloka');
const { requestToTera } = require('@controllers/ota_api/utils');

const OTAName = OTAs.Traveloka;
const LIMIT = 50;
const MAX_PAGE = 20;
const HOST = 'https://astcnt-public.ast.traveloka.com';

async function getTransactions(otaConfig, propertyId, from, to, page = 1) {
	const uri = `${HOST}/v1/public/finance/getPaymentListView`;

	const body = {
		// auth: otaConfig.other.auth,
		// context: otaConfig.other.context,
		data: {
			skip: (page - 1) * LIMIT,
			count: LIMIT * page,
			dueDateInvoiceStart: moment(from).format('DD-MM-Y'),
			dueDateInvoiceEnd: moment(to).format('DD-MM-Y'),
		},
		fields: [],
	};

	try {
		// const data = await fetchRetry(uri, { method: 'POST', body: JSON.stringify(body) }, otaConfig).then(res =>
		// 	res.json()
		// );
		const data = await requestToTera({
			url: uri,
			hotelId: propertyId,
			otaConfig,
			body,
			options: {
				method: 'POST',
			},
		}).then(res => res.json());

		if (data.status !== 'SUCCESS') {
			throw new Error(data);
		}

		const { dataCount, _hotelDistPaymentListSummaries: list } = data.data;

		if (parseInt(dataCount) / LIMIT > page && page <= MAX_PAGE) {
			return [...list, ...(await getTransactions(otaConfig, propertyId, from, to, page + 1))];
		}

		return list;
	} catch (e) {
		logger.error(`${OTAName} getTransactions error`, propertyId, e);
		return [];
	}
}

async function getInvoiceCsv(otaConfig, propertyId, invoice) {
	const json = await requestToTera({
		url: `${HOST}/v1/public/hotel/getPayableInvoiceBreakdownCsv`,
		hotelId: propertyId,
		otaConfig,
		body: {
			data: {
				invoiceId: invoice.id,
			},
		},
		options: {
			method: 'POST',
		},
	}).then(res => res.json());

	if (json.status !== 'SUCCESS') {
		logger.error(`${OTAName} getPayableInvoiceBreakdownCsv`, invoice);
		return [];
	}

	const csv = parseCsv(Buffer.from(json.data.bytes, 'base64'));
	const items = csv.filter(r => r.every(c => c) && r[0] !== 'Reservation ID');

	const data = await items.asyncMap(async item => {
		const booking = await models.Booking.findOne({
			otaBookingId: item[0],
			otaName: OTAName,
		}).select('_id blockId');
		if (!booking) return null;

		const [currency, amountStr] = item[6].split(' ');
		const amount = Number(amountStr.replace(/,/g, ''));
		if (!amount) return null;

		const payoutData = {
			otaName: OTAName,
			otaId: `${item[0]}_deposit`,
			currencyAmount: {
				amount: -amount,
				currency,
			},
			collectorCustomName: OTAName,
			description: `Invoice ID ${invoice.id}`,
			paidAt: new Date(invoice.paymentTime),
			blockIds: [booking.blockId],
			bookingId: booking._id,
			fromOTA: true,
		};

		return models.Payout.createOTAPayout(payoutData).catch(e => logger.error(e));
	});

	return _.compact(data);
}

async function getDeposits(otaConfig, propertyId, from, hasRetry) {
	try {
		const data = await requestToTera({
			url: `${HOST}/v1/public/hotel/getPayableInvoice`,
			hotelId: propertyId,
			otaConfig,
			body: {
				data: {
					year: new Date(from).getFullYear(),
				},
			},
			options: {
				method: 'POST',
			},
		}).then(res => res.json());

		if (data.status !== 'SUCCESS') {
			logger.error(`${OTAName} getPayableInvoice`, propertyId, data);
			return [];
		}

		if (!data.data.summaries.length && !hasRetry) {
			return getDeposits(otaConfig, propertyId, moment(from).subtract(1, 'year').toDate(), true);
		}

		const startDate = moment('2023-02-08').startOf('day').toDate();

		const depositPayouts = await data.data.summaries
			.filter(s => s.paymentTime && new Date(s.paymentTime) >= startDate)
			.asyncMap(async invoice => {
				return {
					invoice,
					payouts: await getInvoiceCsv(otaConfig, propertyId, invoice),
				};
			});

		return depositPayouts;
	} catch (e) {
		logger.error(e);
		return [];
	}
}

async function getHistoryDeposits(otaConfig, propertyId, from, to, checkpoint = null) {
	const count = 100;

	const json = await requestToTera({
		url: `${HOST}/v1/public/finance/getHotelAccountReceivableList`,
		hotelId: propertyId,
		otaConfig,
		body: {
			data: {
				checkpoint,
				count,
				startDate: moment(from).format('DD-MM-Y'),
				endDate: moment(to).format('DD-MM-Y'),
			},
		},
		options: {
			method: 'POST',
		},
	}).then(res => res.json());

	if (json.status !== 'SUCCESS') {
		logger.error(`${OTAName} getPayableInvoiceBreakdownCsv`, propertyId);
		return [];
	}

	const list = json.data.hotelAccountReceivableHistorySummaries;

	if (list.length >= count) {
		return _.uniqBy(
			[
				...list,
				...(await getHistoryDeposits(otaConfig, propertyId, from, to, _.last(list).accountReceivableHistoryId)),
			],
			'accountReceivableHistoryId'
		);
	}

	return list;
}

async function parseHistoryDeposits(histories) {
	const items = histories.filter(h => h.note.startsWith('CANCELLED'));

	const payouts = await items.asyncMap(async item => {
		const mreg = item.note.match(/Itinerary ID : (\d*);/);
		if (!mreg) return;

		const otaBookingId = mreg[1];
		if (!otaBookingId) return;

		const booking = await models.Booking.findOne({
			otaBookingId,
			otaName: OTAName,
		}).select('_id blockId');
		if (!booking) return null;

		const amount = Number(item.amount);
		if (!amount) return null;

		const payoutData = {
			otaName: OTAName,
			otaId: `${item.accountReceivableHistoryId}`,
			currencyAmount: {
				amount: -amount,
			},
			collectorCustomName: OTAName,
			description: `Invoice ID ${item.invoiceId}\n${item.note}`,
			paidAt: new Date(Number(item.dateTime.timestamp)),
			blockIds: [booking.blockId],
			bookingId: booking._id,
			fromOTA: true,
		};

		return models.Payout.createOTAPayout(payoutData).catch(e => logger.error(e));
	});

	return _.compact(payouts);
}

async function addTransactions(otaConfig, property, from, to) {
	try {
		const transactions = await getTransactions(otaConfig, property.propertyId, from, to);
		const depositPayouts = await getDeposits(otaConfig, property.propertyId, from);
		const depositHistories = await getHistoryDeposits(otaConfig, property.propertyId, from, to);

		await addPayments(property, transactions, depositPayouts, await parseHistoryDeposits(depositHistories));
	} catch (e) {
		logger.error(`${OTAName} addTransactions`, e);
	}
}

function addPayments(property, transactions, depositPayouts, depositHistories) {
	return (
		transactions
			// .sort((a, b) => Number(a.inputTimeStamp.timestamp) - Number(b.inputTimeStamp.timestamp))
			// .filter(t => t.paymentListDetail && t.paymentListDetail.length)
			.asyncForEach(async trans => {
				const payments = [];
				const transDate = new Date(Number(trans.inputTimeStamp.timestamp));

				const bookings = await models.Booking.find({
					otaBookingId: _.map(trans.paymentListDetail, t => t.reservationId.toString()),
					otaName: OTAName,
				})
					.select('_id blockId otaBookingId')
					.lean();
				const bookingsObj = _.keyBy(_.uniqBy(bookings, 'otaBookingId'), 'otaBookingId');

				await trans.paymentListDetail.asyncMap(async payout => {
					const booking = bookingsObj[payout.reservationId];
					if (!booking) return null;

					const currencyAmount = {
						amount: Number(payout.invoiceAmount),
						currency: trans.currency,
						exchangedAmount: Number(payout.invoiceAmount),
					};

					const payoutData = {
						otaName: OTAName,
						otaId: trans._id.toString(),
						currencyAmount,
						collectorCustomName: OTAName,
						description: `Payment ID ${trans._id}.\nReference No ${trans.referenceNo}`,
						paidAt: transDate,
						blockIds: [property.blockId || booking.blockId],
						bookingId: booking._id,
						fromOTA: true,
					};

					const p1 = await models.Payout.createOTAPayout(payoutData).catch(e => logger.error(e));
					if (p1) payments.push(p1);

					const refundedAmount = Number(payout.refundedAmount);
					if (refundedAmount) {
						const currencyAmountRefunded = {
							...currencyAmount,
							amount: -refundedAmount,
							exchangedAmount: -refundedAmount,
						};
						const p2 = await models.Payout.createOTAPayout({
							...payoutData,
							currencyAmount: currencyAmountRefunded,
							description: `Refunded.\n ${payoutData.description}`,
							productId: `${trans._id}_refunded`,
							bookingId: booking._id,
						}).catch(e => logger.error(e));
						if (p2) payments.push(p2);
					}
				});

				const totalUsedAccountReceivableAmount = _.sumBy(trans.paymentListDetail, p =>
					Number(p.usedAccountReceivableAmount)
				);

				if (totalUsedAccountReceivableAmount) {
					let hasDeposit = false;

					const deposit = depositPayouts.find(
						d => !d.marked && moment(d.invoice.billingPeriod).isSame(transDate, 'month')
					);
					if (deposit) {
						deposit.marked = true;
						hasDeposit = true;
						payments.push(...deposit.payouts);
					}

					const currentDepositHistories = depositHistories.filter(p =>
						moment(p.paidAt).isSame(transDate, 'month')
					);
					if (currentDepositHistories.length) {
						hasDeposit = true;
						payments.push(...currentDepositHistories);
					}

					if (!hasDeposit) {
						const depDeposit = depositPayouts.find(
							d => !d.marked && Number(d.invoice.amount) === totalUsedAccountReceivableAmount
						);
						if (depDeposit) {
							depDeposit.marked = true;
							payments.push(...depDeposit.payouts);
						}
					}
				}

				if (payments.length) {
					const payoutIds = _.map(payments, '_id');

					const payoutExport = await models.PayoutExport.findOne({
						payoutType: PayoutType.RESERVATION,
						payouts: { $in: payoutIds },
						state: { $ne: PayoutStates.DELETED },
					});

					if (payoutExport) {
						if (!payoutExport.confirmedDate) {
							payoutExport.payouts = _.uniqBy([...payoutExport.payouts, ...payoutIds], _.toString);
							await payoutExport.save();
						}

						return;
					}

					const total = _.sumBy(payments, 'currencyAmount.exchangedAmount');

					await models.PayoutExport.createExport({
						payoutType: PayoutType.RESERVATION,
						name: `Traveloka Payment ${moment(Number(trans.inputTimeStamp.timestamp)).format('DD/MM/Y')} (${
							trans.paymentListDetail[0].hotelName
						})`,
						payouts: payoutIds,
						currencyAmount: {
							VND: total,
						},
						description: `ID: ${trans._id}\nReference No: ${trans.referenceNo}`,
						groupIds: property.groupIds,
						source: OTAName,
					});
				}
			})
	);
}

async function fetchAll(from, to, blockId) {
	const otas = await models.OTAManager.findByName(OTAName);
	from = moment(from || moment().add(-30, 'day'))
		.startOf('month')
		.toDate();
	to = to || moment().add(1, 'day').toDate();

	await _.uniqBy(otas, 'username').asyncForEach(async otaConfig => {
		const properties = await models.Block.getPropertiesId(OTAName, otaConfig.account, true, blockId);
		for (const property of properties) {
			// await changeHotelSession(otaConfig, property.propertyId);
			await addTransactions(otaConfig, property, from, to);
		}
	});
}

module.exports = {
	fetchAll,
};
