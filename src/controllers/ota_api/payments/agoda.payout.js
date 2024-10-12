const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
// const fetchRetry = require('@utils/fetchRetry');
const { OTAs, PayoutStates, OTA_PAYMENT_METHODS } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const { getAgodaHeader } = require('@controllers/ota_api/header_helper');
const { sendExtRequest } = require('@controllers/ota_helper');

const OTAName = OTAs.Agoda;
const MAX_PAGE = 5;
const PER_PAGE = 1000;
const HOST = 'https://ycs.agoda.com/en-us/Finance';

async function request(otaConfig, uri, options = null) {
	const fetchOpts = {
		method: 'POST',
		// mode: 'cors',
		// credentials: 'include',
		headers: {
			Accept: 'application/json, text/javascript, */*; q=0.01',
			'Content-Type': 'application/json; charset=UTF-8',
			Origin: 'https://ycs.agoda.com',
		},
		timeout: 30000,
		...options,
	};

	const extRes = await sendExtRequest(otaConfig, uri, fetchOpts);

	if (extRes.error) {
		logger.error('Agoda payout', uri, options, extRes.rawData);
		return Promise.reject(extRes.rawData);
	}

	const json = JSON.parse(extRes.rawData);

	// if (res.status !== 200) {
	// 	const raw = await res.text();
	// 	logger.error('Booking syncAccelerator', uri, body, res.status, raw);
	// 	return Promise.reject(raw);
	// }

	// const json = await res.json();

	if (!json.IsSuccess) {
		logger.error('Agoda payout', uri, options);
		// return Promise.reject(json.ResponseMessage);
		throw new ThrowReturn(json.ResponseMessage);
	}

	return json.ResponseData;
}

// async function request(otaConfig, url, options = null) {
// 	const result = await fetchRetry(url, { method: 'POST', ...options }, otaConfig);

// 	if (!result.ok) {
// 		const raw = await result.text();
// 		logger.error('Agoda request', url, raw);
// 		return Promise.reject(raw);
// 	}

// 	const json = await result.json();
// 	if (!json.IsSuccess) {
// 		logger.error(`Agoda request`, url, json);
// 		throw new ThrowReturn(json.ResponseMessage);
// 	}

// 	return json.ResponseData;
// }

async function getTransactions(otaConfig, propertyId, from, to, page = 1) {
	const uri = `${HOST}/AllTransactionsSearch/${propertyId}`;
	const body = {
		HotelId: Number(propertyId),
		PageIndex: page - 1,
		PageSize: PER_PAGE,
		From: from.toISOString(),
		To: to.toISOString(),
		// Based: 'Booking',
		Based: 'CheckOut',
		Transaction: '0',
		IncludeManual: false,
		DmcId: null,
		IsDmc: false,
	};

	try {
		const result = await request(otaConfig, uri, { body: JSON.stringify(body) });

		if (result.TotalPages > page && page < MAX_PAGE && result.Items.length === PER_PAGE) {
			return [...result.Items, ...(await getTransactions(otaConfig, propertyId, from, to, page + 1))];
		}

		return result.Items;
	} catch (e) {
		logger.error('Agoda getTransactions', body, e);
		return [];
	}
}

async function getCollector(trans, checkin) {
	if (trans.CollectionAmount <= 0) return;

	const date = moment(checkin).format('Y-MM-DD');

	const paymentCollector = await models.PaymentCollector.findOne({
		active: true,
		conds: {
			$elemMatch: {
				ota: OTAName,
				key: 'PaymentMethod',
				value: trans.PaymentMethod,
			},
		},
	});
	if (!paymentCollector) return;

	const cond =
		paymentCollector.conds.find(c => (!c.fromDate || c.fromDate <= date) && (!c.toDate || c.toDate >= date)) ||
		_.last(paymentCollector.conds);
	if (!cond) return;

	return {
		transactionFee: _.round(trans.CollectionAmount * cond.fee),
		collectorCustomName: paymentCollector.tag,
	};
}

async function addPayments(transactions, property) {
	const updated = {};

	const bookings = await models.Booking.find({
		otaName: OTAName,
		otaBookingId: { $in: _.uniq(_.map(transactions, t => t.ReferenceNumber.toString().trim())) },
	})
		.select('_id from otaBookingId')
		.lean();

	const bookingsObj = _.keyBy(_.uniqBy(bookings, 'otaBookingId'), 'otaBookingId');

	await transactions.asyncMap(async trans => {
		const bookingId = trans.ReferenceNumber.toString().trim();
		const booking = bookingsObj[bookingId];

		if (!booking) {
			if (trans.CollectionAmount) {
				logger.warn('agoda.payout not found booking', property, trans);
				await models.JobCrawler.create({
					otaName: OTAName,
					reservationId: bookingId,
					propertyId: property.propertyId,
				});
			}
			return;
		}

		const currencyAmount = {
			amount: trans.CollectionAmount,
			currency: trans.CurrencyCode,
			exchangedAmount: trans.CollectionAmount,
		};

		const otaId = trans.Id.toString();

		const data = {
			otaName: OTAName,
			otaId,
			currencyAmount,
			collectorCustomName: OTAName,
			description: trans.Adjustment ? trans.Status : `Booking Paid By: ${trans.PaymentMethod}`,
			paidAt: new Date(trans.Created),
			blockIds: [property.blockId],
			bookingId: booking._id,
			fromOTA: true,
		};

		const collector = await getCollector(trans, booking.from);
		if (collector) {
			_.assign(data, collector);
		}

		const payout = await models.Payout.createOTAPayout(data);

		if (!updated[booking.otaBookingId]) updated[booking.otaBookingId] = [];
		updated[booking.otaBookingId].push({ bookingId: booking._id, payoutId: payout && payout._id, otaId });
	});

	await _.entries(updated).asyncMap(async ([otaBookingId, arr]) => {
		const otaIds = _.map(arr, 'otaId');

		const payouts = await models.Payout.find({
			otaName: OTAName,
			state: { $in: [PayoutStates.PROCESSING, PayoutStates.TRANSFERRED] },
			fromOTA: true,
			inReport: false,
			$or: [
				{
					bookingId: { $in: _.map(arr, 'bookingId') },
					otaId: { $nin: otaIds },
				},
				{
					otaId: { $in: otaIds },
					_id: { $nin: _.compact(_.map(arr, 'payoutId')) },
				},
			],
		});

		if (!payouts.length) return;

		logger.warn('Agoda delete payout', otaBookingId, _.map(payouts, '_id'));

		await payouts.asyncMap(payout => {
			payout.state = PayoutStates.DELETED;
			return payout.save().catch(e => logger.error(e));
		});
	});
}

function getPaymentMethod({ paymentMethod, paymentMethodName }) {
	return paymentMethod === 1 ? 'Agoda - Telex Transfer' : `Agoda - ${_.replace(paymentMethodName, /^TT - /, '')}`;
}

async function mapPaymentCollections({ transactions, paymentMethod, paymentMethodName, propertyId, blockId }) {
	const Ttransactions = transactions.map(t => {
		return {
			ReferenceNumber: t.otaBookingId,
			CollectionAmount: t.amount,
			CurrencyCode: t.currency,
			Id: t.id,
			Created: t.createdAt,
			PaymentMethod: getPaymentMethod({ paymentMethod, paymentMethodName }),
			Adjustment: t.adjustment,
			Status: t.status,
		};
	});

	await addPayments(Ttransactions, { propertyId, blockId });
}

async function fetchAll(from, to, blockId) {
	const otas = await models.OTAManager.findByName(OTAName);
	from = from || moment().add(-15, 'day').toDate();
	to = to || moment().add(30, 'day').toDate();

	await otas.asyncForEach(async ota => {
		const properties = await models.Block.getPropertiesId(OTAName, ota.account, true, blockId);

		logger.info('Agoda fetch payments', from, to, blockId, ota.account, properties);

		return properties.asyncForEach(async property => {
			const transactions = await getTransactions(ota, property.propertyId, from, to);
			return addPayments(transactions, property);
		});
	});
}

// async function getSumAwaitingCollection({ otaConfig, property }) {
// 	const uri = `${HOST}/GetPayments/${property.propertyId}`;
// 	const data = await request(otaConfig, uri);

// 	return _.map(data, item => ({
// 		bookingAmount: item.BookingAmount,
// 		collectionAmount: item.CollectionAmount,
// 		collectionId: item.ApprovalNumber,
// 	}));
// }

async function getAwaitingCollections({ otaConfig, property }) {
	const url = `${HOST}/GetCurrentTransactions/${property.propertyId}`;

	const currentTransaction = await request(otaConfig, url).catch(() => null);

	let transactions = _.map(currentTransaction && currentTransaction.Bookings, booking => {
		return {
			amountToSale: booking.RefSaleInAmount || 0,
			amountFromOTA: booking.FromAgodaAmount || 0,
			amountToOTA: booking.ToAgodaAmount || 0,
			amount: booking.Amount || 0,
			otaBookingId: booking.BookingId.toString(),
			otaName: OTAName,
			booked: booking.Booked,
			checkIn: booking.CheckIn,
			checkOut: booking.CheckOut,
			guestName: booking.GuestName,
			id: booking.Id,
			otaId: booking.Id,
			status: booking.StatusName,
			currency: booking.CurrencyCode,
			createdAt: booking.CreatedWhen,
			updatedAt: booking.ModifiedWhen,
		};
	});

	const hotelInfo = await request(otaConfig, `${HOST}/GetHotelInfo/${property.propertyId}`);

	// if (hotelInfo.PaymentMethod === 1) {
	// 	const bankInfo = await request(otaConfig, `${HOST}/BankAccountFetch/${property.propertyId}`, {
	// 		body: `accountId=${hotelInfo.}`,
	// 		headers: {
	// 			'Content-Type': 'application/x-www-form-urlencoded'
	// 		}
	// 	});
	// }

	const adjustmentTransactions = _.map(currentTransaction && currentTransaction.Adjustments, adjustment => {
		return {
			amountToSale: adjustment.RefSaleInAmount || 0,
			amountFromOTA: adjustment.FromAgodaAmount || 0,
			amountToOTA: adjustment.ToAgodaAmount || 0,
			amount: adjustment.Amount || 0,
			otaBookingId: _.split(adjustment.Reference, '-')[0],
			otaName: OTAName,
			id: adjustment.Id,
			otaId: adjustment.Id,
			status: `Adjustment (${adjustment.ReasonName})`,
			currency: adjustment.CurrencyCode,
			createdAt: adjustment.CreatedWhen,
			updatedAt: adjustment.ModifiedWhen,
			adjustment: true,
		};
	});

	transactions = [...adjustmentTransactions, ...transactions];

	return {
		transactions,
		totalAmount: _.sumBy(transactions, 'amount') || 0,
		currency: _.get(transactions[0], 'currency'),
		paymentMethod: hotelInfo.PaymentMethod,
		paymentMethodName: hotelInfo.PaymentMethodName,
		date: new Date().toDateMysqlFormat(),
		// status: 'awaiting',
	};
}

async function confirmAwaitingCollections({ otaConfig, propertyId, transactions, paymentMethod, paymentMethodName }) {
	const savedUrl = `${HOST}/SaveCurrentTransactions/${propertyId}`;

	const hotelInfo = await request(otaConfig, `${HOST}/GetHotelInfo/${propertyId}`);
	if (!hotelInfo) {
		throw new ThrowReturn('Không tìm thấy thông tin khách sạn!');
	}

	const bookingsToSave = transactions
		.filter(t => !t.adjustment)
		.map(t => ({
			Id: t.id,
			Approved: true,
			Disputed: false,
			DisputeReasonId: -1,
			DisputeRemark: '',
		}));

	const adjustmentsToSave = transactions
		.filter(t => t.adjustment)
		.map(t => ({
			Id: t.id,
			Approved: true,
			Disputed: false,
			DisputeReasonId: -1,
			DisputeRemark: '',
		}));

	const paymentAccountPairs = [];

	if (paymentMethod === OTA_PAYMENT_METHODS.BANK_TRANSFER) {
		const block = await models.Block.findOne({
			active: true,
			isProperty: true,
			OTAProperties: {
				$elemMatch: {
					otaName: OTAName,
					propertyId,
				},
			},
		});
		const property = _.find(
			block && block.OTAProperties,
			b => b.otaName === OTAName && b.propertyId === propertyId
		);
		if (property && property.bankAccountId) {
			paymentAccountPairs.push({
				AccountId: Number(property.bankAccountId),
				CurrencyCode: 'VND',
				IsQuantum: false,
				QuantumVersion: null,
			});
		}
	}

	const { ApprovalIds } = await request(otaConfig, savedUrl, {
		body: JSON.stringify({
			bookingsToSave,
			adjustmentsToSave,
			paymentAccountPairs,
			// [
			// {
			// 	AccountId: 824505,
			// 	CurrencyCode: 'VND',
			// 	IsQuantum: false,
			// 	QuantumVersion: null,
			// },
			// ],
		}),
	});

	let cards;

	if (paymentMethod === OTA_PAYMENT_METHODS.VIRTUAL_CARD) {
		// const getCardUri = `${HOST}/GetCurrentTransactionsCards/${propertyId}`;

		// const resCards = await request(otaConfig, getCardUri, {
		// 	body: `remittanceInfoIds=${ApprovalIds.join(',')}`,
		// 	headers: getAgodaHeader(otaConfig, {
		// 		'content-type': 'application/x-www-form-urlencoded',
		// 	}),
		// }).catch(() => null);

		// cards = _.map(resCards, c => ({
		// 	cardHolderName: c.CardHolderName,
		// 	cardNumber: c.CardNumber,
		// 	cardType: c.CardType,
		// 	expiryDate: c.ExpiryDate,
		// 	currency: c.LocalCurrency,
		// 	amount: c.LocalAmount,
		// 	securityCode: c.SecurityCode,
		// 	isSingleSwipe: c.IsSingleSwipe,
		// 	statusPaid: c.StatusPaid,
		// }));

		cards = await getCardsInfo({ otaConfig, propertyId, ApprovalIds }).catch(() => []);
	}

	return {
		paymentMethod,
		paymentMethodName,
		cards,
		collectionIds: _.map(ApprovalIds, id => _.toString(id)),
		collectionKey: 'PaymentMethod',
		collectionValue: getPaymentMethod({
			paymentMethod: hotelInfo.PaymentMethod,
			paymentMethodName: hotelInfo.PaymentMethodName,
		}),
	};
}

async function getCardsInfo({ otaConfig, propertyId, ApprovalIds }) {
	const uri = `https://ycs.agoda.com/en-us/Finance/GetRemittanceCard/${propertyId}`;

	const resCards = await ApprovalIds.asyncMap(id =>
		request(otaConfig, uri, {
			body: `remittanceInfoId=${id}`,
			headers: getAgodaHeader(otaConfig, {
				'content-type': 'application/x-www-form-urlencoded',
			}),
		})
	);

	const cards = _.map(resCards, c => ({
		cardHolderName: c.CardHolderName,
		cardNumber: c.CardNumber,
		cardType: c.CardType,
		expiryDate: c.ExpiryDate,
		currency: c.LocalCurrency,
		amount: c.LocalAmount,
		securityCode: c.SecurityCode,
		isSingleSwipe: c.IsSingleSwipe,
		statusPaid: c.StatusPaid,
	}));

	return cards;
}

module.exports = {
	fetchAll,
	// getSumAwaitingCollection,
	getAwaitingCollections,
	confirmAwaitingCollections,
	mapPaymentCollections,
	getCardsInfo,
};
