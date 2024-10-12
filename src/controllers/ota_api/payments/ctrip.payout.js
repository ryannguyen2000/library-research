const _ = require('lodash');
const moment = require('moment');

// const fetch = require('@utils/fetch');
const { OTAs, PayoutStates, OTA_PAYMENT_METHODS, PayoutType } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
// const headerHelper = require('@controllers/ota_api/header_helper');
const { requestToCtrip } = require('@controllers/ota_api/utils');

const OTAName = OTAs.Ctrip;
const PER_PAGE = 1000;
// const MAX_PAGE = 5;
const HOST = 'https://ebooking.trip.com';

async function getTransactions({ otaConfig, hotelId, from, to, tabType = 1, page = 1 }) {
	try {
		const { reqHead } = otaConfig.other;

		const clientId = _.get(reqHead, 'client.clientId');
		const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
		const uri = `${HOST}/restapi/soa2/29140/getPrepayOrders?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

		const body = JSON.stringify({
			tabType,
			pageIndex: page,
			pageSize: PER_PAGE,
			orderId: '',
			hotelId: Number(hotelId),
			startETA: '',
			endETA: '',
			startETD: '',
			endETD: moment().format('YYYY-MM-DD'),
			startFinishTime: tabType === 1 ? '' : moment(from).format('YYYY-MM-DD'),
			endFinishTime: tabType === 1 ? '' : moment(to).format('YYYY-MM-DD'),
			startInputTime: '',
			endInputTime: '',
			isShortRent: false,
		});

		const res = await requestToCtrip({
			url: uri,
			options: {
				method: 'POST',
				body,
			},
			otaConfig,
			hotelId,
		});

		const results = await res.json();

		const dataList = _.get(results, 'data.dataList');

		if (!dataList) {
			throw new Error(results);
		}

		// if (results && results.data && results.data.totalRecord > page * PER_PAGE && page <= MAX_PAGE) {
		// 	return [...dataList, ...(await getTransactions({ otaConfig, hotelId, from, to, tabType, page: page + 1 }))];
		// }

		return dataList;
	} catch (e) {
		logger.error('Ctrip getTransactions', hotelId, e);
		return [];
	}
}

// async function getPrepayOrders({ otaConfig, hotelId }) {
// 	try {
// 		const headers = await headerHelper.getCtripHeader(otaConfig, {
// 			hotelId,
// 		});
// 		const { reqHead } = otaConfig.other;

// 		const clientId = _.get(reqHead, 'client.clientId');
// 		const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
// 		const uri = `${HOST}/restapi/soa2/29140/getPrepayOrders?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

// 		const json = await fetch(uri, {
// 			headers,
// 			method: 'POST',
// 			body: JSON.stringify({
// 				hotelId,
// 				orderId: '',
// 				beginETA: '',
// 				endETA: '',
// 				beginETD: '9',
// 				endETD: '',
// 				queryCancelOrder: true,
// 				pageIndex: 1,
// 				pageSize: 10000,
// 			}),
// 		}).then(res => res.json());

// 		if (!json.resStatus || json.resStatus.rcode !== 200) {
// 			throw json;
// 		}

// 		return json.data.dataList;
// 	} catch (e) {
// 		logger.error('Ctrip getTransactions', hotelId, e);
// 		return [];
// 	}
// }

async function getPrepayTransactions({ otaConfig, hotelId }) {
	try {
		const { reqHead } = otaConfig.other;

		const clientId = _.get(reqHead, 'client.clientId');
		const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
		const uri = `${HOST}/restapi/soa2/29140/getPrepayUncollectedOrders?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;
		const body = JSON.stringify({
			hotelId: Number(hotelId),
			orderId: '',
			beginETA: '',
			endETA: '',
			beginETD: '',
			endETD: '',
			queryCancelOrder: true,
			pageIndex: 1,
			pageSize: 10000,
		});

		const res = await requestToCtrip({
			url: uri,
			options: {
				method: 'POST',
				body,
			},
			otaConfig,
			hotelId,
		});

		const json = await res.json();

		if (!json.resStatus || json.resStatus.rcode !== 200) {
			throw json;
		}

		return json.data.dataList;
	} catch (e) {
		logger.error('Ctrip getPrepayTransactions', hotelId, e);
		return [];
	}
}

async function addPayments(transactions, property) {
	const updated = {};

	const bookings = await models.Booking.find({
		otaName: OTAName,
		otaBookingId: { $in: _.uniq(_.map(transactions, t => t.orderId.toString())) },
	})
		.select('_id blockId otaBookingId')
		.lean();

	const bookingsObj = _.keyBy(_.uniqBy(bookings, 'otaBookingId'), 'otaBookingId');

	await transactions.asyncMap(async transaction => {
		const booking = bookingsObj[transaction.orderId];
		if (!booking) return;

		const currencyAmount = {
			amount: transaction.settlementPrice,
			currency: transaction.currency,
			exchange: transaction.exchange,
		};
		const otaId = _.toString(transaction.settlementIds);

		await models.Payout.createOTAPayout({
			otaName: OTAName,
			otaId,
			currencyAmount,
			collectorCustomName: OTAName,
			blockIds: [property.blockId || booking.blockId],
			bookingId: booking._id,
			fromOTA: true,
		});

		const bId = booking._id.toString();

		if (!updated[bId]) updated[bId] = [];
		updated[bId].push(otaId);

		// if (!updated[booking.otaBookingId]) updated[booking.otaBookingId] = [];
		// updated[booking.otaBookingId].push({ bookingId: booking._id, otaId, payoutId: payout && payout._id });
	});

	await _.entries(updated).asyncForEach(async ([bookingId, otaIds]) => {
		const bookingPayouts = await models.Payout.find({
			bookingId,
			state: { $in: [PayoutStates.PROCESSING, PayoutStates.TRANSFERRED] },
			fromOTA: true,
			otaId: { $nin: otaIds },
		});

		if (!bookingPayouts.length) return;

		logger.warn('Ctrip delete payout', bookingId, _.map(bookingPayouts, '_id'));

		await bookingPayouts.asyncMap(payout => {
			payout.state = PayoutStates.DELETED;
			return payout.save().catch(e => logger.error('Ctrip delete payout', e));
		});
	});
}

async function addExports(property, allTransactions) {
	allTransactions = allTransactions.filter(t => Number(t.paymentStatus) !== 3 && t.submitType === 'AUTO');

	await _.values(_.groupBy(allTransactions, 'billId')).asyncMap(async transactions => {
		const allBookings = await models.Booking.find({
			otaBookingId: { $in: _.map(transactions, 'orderId') },
			otaName: OTAName,
		})
			.select('_id otaBookingId blockId')
			.lean();

		const bookingGroups = _.groupBy(allBookings, 'otaBookingId');

		const payouts = _.compact(
			await transactions.asyncMap(async transaction => {
				const bookings = bookingGroups[transaction.orderId];
				if (!bookings) return;

				const otaId = `${transaction.billId}_${transaction.orderId}`;
				const currencyAmount = {
					amount: transaction.settlementPrice,
					currency: transaction.currency,
					exchange: transaction.exchange,
				};

				const payout = await models.Payout.findOne({
					bookingId: { $in: _.map(bookings, '_id') },
					$or: [
						{
							otaId,
						},
						{
							payoutType: PayoutType.RESERVATION,
							createdBy: { $ne: null },
							'currencyAmount.amount': currencyAmount.amount,
						},
						{
							fromOTA: true,
							'currencyAmount.amount': currencyAmount.amount,
						},
					],
				}).select('_id');

				if (payout) {
					return payout;
				}

				const booking = bookings[0];

				return models.Payout.createOTAPayout({
					otaName: OTAName,
					otaId,
					currencyAmount,
					collectorCustomName: OTAName,
					blockIds: [property.blockId || booking.blockId],
					bookingId: booking._id,
					fromOTA: true,
				});
			})
		);

		// const payouts = await models.Payout.find({
		// 	bookingId: { $in: _.map(bookings, '_id') },
		// 	state: { $in: [PayoutStates.PROCESSING, PayoutStates.TRANSFERRED] },
		// 	fromOTA: true,
		// 	// inReport: false,
		// })
		// 	.select('_id bookingId currencyAmount')
		// 	.lean();

		// const bookingObjs = _.groupBy(bookings, 'otaBookingId');
		// const payoutObjs = _.groupBy(payouts, 'bookingId');

		// const currentPayouts = transactions
		// 	.map(transaction => {
		// 		const pays = _.flatten(_.map(bookingObjs[transaction.orderId], b => payoutObjs[b._id] || []));
		// 		return pays.find(p => p.currencyAmount.exchangedAmount === transaction.settlementPrice);
		// 	})
		// 	.filter(p => p);

		if (payouts.length) {
			const total = _.sumBy(payouts, 'currencyAmount.exchangedAmount');
			const payoutIds = _.map(payouts, '_id');

			let report = await models.PayoutExport.findOne({
				source: OTAName,
				payouts: { $in: payoutIds },
			});
			if (report) {
				return report;
				// report.payouts = _.uniqBy([...report.payouts, ...payoutIds], _.toString);
				// await report.save();
			}

			return await models.PayoutExport.createExport({
				payoutType: PayoutType.RESERVATION,
				name: `Ctrip Payment ${moment(transactions[0].payTime || new Date()).format('DD/MM/Y')} (${
					property.propertyName
				})`,
				payouts: payoutIds,
				currencyAmount: {
					VND: total,
				},
				description: `Application No: ${transactions[0].billId}`,
				groupIds: property.groupIds,
				source: OTAName,
			});
		}
	});
}

async function fetchAll(from, to, blockId) {
	const otas = await models.OTAManager.findByName(OTAName);

	from = from || moment().add(-30, 'day').toDate();
	to = to || moment().toDate();

	await otas.asyncForEach(async otaConfig => {
		const properties = await models.Block.getPropertiesId(OTAName, otaConfig.account, true, blockId);

		await properties.asyncForEach(async property => {
			try {
				const transactions = await getTransactions({
					otaConfig,
					hotelId: property.propertyId,
					from,
					to,
					tabType: 2,
				});

				await addExports(property, transactions);
			} catch (e) {
				logger.error(`${OTAName} fetch payments error`, property, e);
			}
		});
	});
}

async function getPaymentCard(otaConfig, hotelId) {
	const rs = await requestToCtrip({
		url: `${HOST}/ebkfinance/repay/getSettlementPaymentCardInfo`,
		options: {
			method: 'POST',
			body: JSON.stringify({ hotelId }),
		},
		otaConfig,
		hotelId,
	}).then(res => res.json());

	return rs.code === 200 ? rs.data : null;
}

async function getAwaitingCollections({ otaConfig, property }) {
	const resTransactions = await getPrepayTransactions({
		otaConfig,
		hotelId: property.propertyId,
	});

	const transactions = _.map(resTransactions, transaction => {
		const amount = transaction.settlementCurrencyPrice || 0;

		return {
			otaId: _.toString(transaction.settlementIds),
			amountToSale: amount,
			amountFromOTA: amount,
			amountToOTA: 0,
			amount,
			otaBookingId: transaction.orderId,
			otaName: OTAName,
			booked: '',
			checkIn: transaction.etaStr,
			checkOut: transaction.etdStr,
			guestName: transaction.clientName,
			id: transaction.settlementIds,
			currency: transaction.settlementCurrency,
		};
	});

	const card = await getPaymentCard(otaConfig, property.propertyId);

	return {
		transactions,
		totalAmount: _.sumBy(transactions, 'amount'),
		currency: _.get(transactions[0], 'currency'),
		paymentMethod: OTA_PAYMENT_METHODS.BANK_TRANSFER,
		paymentMethodName: 'Bank Transfer',
		bankAccountInfo: card
			? {
					bankName: card.bankName,
					cardNo: card.cardNo,
					accountName: card.accountName,
			  }
			: null,
		date: new Date().toDateMysqlFormat(),
		// status: 'awaiting',
	};
}

async function confirmAwaitingCollections({ otaConfig, propertyId, transactions, paymentMethod, paymentMethodName }) {
	const result = await requestToCtrip({
		url: `${HOST}/ebkfinance/repay/applyWithDraw`,
		options: {
			method: 'POST',
			body: JSON.stringify({
				hotelId: propertyId,
				settlementIdList: _.flatten(_.map(transactions, t => t.id.split(',').map(id => id.trim()))),
				deductList: [],
				deductionImprestList: [],
			}),
		},
		otaConfig,
		hotelId: propertyId,
	}).then(res => res.json());

	if (result.code !== 200 && result.code !== 0) {
		return Promise.reject(result);
	}

	return {
		paymentMethod,
		paymentMethodName,
		...result,
	};
}

async function mapPaymentCollections({ transactions, propertyId, blockId }) {
	const rTransactions = transactions.map(t => {
		return {
			orderId: t.otaBookingId,
			settlementPrice: t.amount,
			currency: t.currency,
			settlementIds: t.id,
		};
	});

	await addPayments(rTransactions, { propertyId, blockId });
}

module.exports = {
	fetchAll,
	getAwaitingCollections,
	confirmAwaitingCollections,
	mapPaymentCollections,
};
