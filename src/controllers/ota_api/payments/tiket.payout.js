const _ = require('lodash');
const moment = require('moment');

// const fetch = require('@utils/fetch');
const createUri = require('@utils/uri');
const { OTAs, PayoutStates, PayoutType } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const { getTiketHeaders, changeHotelSession, browserRequest } = require('@controllers/ota_api/headers/tiket');

const OTAName = OTAs.Tiket;
const LIMIT = 10;
const MAX_PAGE = 10;
const HOST = 'https://tix.tiket.com';
const START_DATE = '2024-05-24';

async function getTransactions(otaConfig, propertyId, from, to, page = 0) {
	from = _.max([from, START_DATE]);
	to = _.max([from, to, START_DATE]);

	if (from > new Date().toDateMysqlFormat()) {
		return [];
	}

	const uri = createUri(
		`${HOST}/tix-api-gateway-dashboard-hotel/tix-hotel-native-core/hotels/${propertyId}/finance/hotel-payment`,
		{
			paymentDateFrom: from,
			paymentDateTo: to,
			page,
			sort: 'paymentDate',
			sortDirection: 'DESC',
		}
	);

	try {
		const json = await browserRequest(otaConfig, uri, { headers: getTiketHeaders(otaConfig) });

		// const json = await fetch(uri, { method: 'GET', headers: getTiketHeaders(otaConfig) }).then(res => res.json());
		if (json.code !== 'SUCCESS') {
			throw new Error(JSON.stringify(json));
		}

		const { size = LIMIT, content } = json.data;

		if (content.length >= size && page <= MAX_PAGE) {
			return [...content, ...(await getTransactions(otaConfig, propertyId, from, to, page + 1))];
		}

		return content;
	} catch (e) {
		logger.error(`${OTAName} getTransactions error`, propertyId, e);
		return [];
	}
}

async function addTransactions(otaConfig, property, from, to) {
	try {
		const transactions = await getTransactions(otaConfig, property.propertyId, from, to);

		return await addPayments(property, transactions);
	} catch (e) {
		logger.error(`tiket.payout addTransactions`, e);
	}
}

async function addPayments(property, transactions) {
	const bookings = await models.Booking.find({
		otaBookingId: _.map(transactions, t => t.itineraryId.toString()),
		otaName: OTAName,
	})
		.select('_id blockId otaBookingId')
		.lean();
	const bookingsObj = _.keyBy(_.uniqBy(bookings, 'otaBookingId'), 'otaBookingId');

	const dates = {};

	await transactions.asyncMap(async transaction => {
		const booking = bookingsObj[transaction.itineraryId];
		if (!booking) {
			logger.warn('tiket.payout not found booking', property, transaction);
			return null;
		}
		const currencyAmount = {
			amount: Number(transaction.amountPaid),
			currency: transaction.currency,
			exchangedAmount: Number(transaction.amountPaid),
		};

		dates[transaction.paymentDate] = true;

		const payoutData = {
			otaName: OTAName,
			otaId: `${OTAName}_${transaction.id}`,
			currencyAmount,
			collectorCustomName: OTAName,
			description: `${transaction.paymentMethod}`,
			paidAt: new Date(transaction.paymentDate),
			blockIds: [property.blockId || booking.blockId],
			bookingId: booking._id,
			fromOTA: true,
		};

		await models.Payout.createOTAPayout(payoutData).catch(e => logger.error(`tiket.payout createOTAPayout`, e));
	});

	return dates;
}

async function addPayoutReports(dates, otaConfig) {
	await dates.asyncForEach(async date => {
		const payouts = await models.Payout.find({
			fromOTA: true,
			otaName: OTAName,
			paidAt: new Date(date),
			state: { $ne: PayoutStates.DELETED },
		}).select('_id');

		if (!payouts.length) return;

		const payoutIds = _.map(payouts, '_id');

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

		await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `Tiket Payment ${moment(date).format('DD/MM/Y')} (${_.upperFirst(otaConfig.account)})`,
			payouts: payoutIds,
			groupIds: otaConfig.groupIds,
			source: OTAName,
		});
	});
}

async function fetchAll(from, to, blockId) {
	const otas = await models.OTAManager.findByName(OTAName);

	from = moment(from || moment().add(-30, 'day'))
		.startOf('month')
		.format('Y-MM-DD');
	to = to ? moment(to).format('Y-MM-DD') : moment(to).add(1, 'day').format('Y-MM-DD');

	await _.uniqBy(otas, 'username').asyncForEach(async otaConfig => {
		const properties = await models.Block.getPropertiesId(OTAName, otaConfig.account, true, blockId);
		const dates = {};

		for (const property of properties) {
			await changeHotelSession(otaConfig, property.propertyId);
			const pdates = await addTransactions(otaConfig, property, from, to);
			_.assign(dates, pdates);
		}

		await addPayoutReports(_.keys(dates), otaConfig);
	});
}

module.exports = {
	fetchAll,
};
