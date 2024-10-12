const _ = require('lodash');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
const { OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');

const OTAName = OTAs.Go2joy;
const MAX_PAGE = 20;
const PER_PAGE = 100;

async function getTransactions(otaConfig, propertyId, from, to, page = 1) {
	const uri = `https://api-ha.go2joy.vn/api/v1/web/ha/user-booking-reports/details?hotelSn=${propertyId}&limit=${PER_PAGE}&page=${page}&startDate=${from.toDateMysqlFormat()}&endDate=${to.toDateMysqlFormat()}`;

	try {
		const result = await fetchRetry(uri, null, otaConfig);
		const json = await result.json();

		if (json.code !== 1) {
			logger.error(`${OTAName} getTransactions`, propertyId, json);
			return [];
		}

		if (json.data.meta.lastPage > page && page < MAX_PAGE) {
			return [
				...json.data.userBookingReportDetails,
				...(await getTransactions(otaConfig, propertyId, from, to, page + 1)),
			];
		}
		return json.data.userBookingReportDetails;
	} catch (e) {
		logger.error(`${OTAName} getTransactions`, propertyId, e);
		return [];
	}
}

async function addPayments(transactions, property) {
	const bookings = await models.Booking.find({
		otaBookingId: { $in: _.map(transactions, trans => trans.bookingNo.toString()) },
		otaName: OTAName,
	}).select('_id blockId otaBookingId rateType');

	const bookingsObj = _.keyBy(_.uniqBy(bookings, 'otaBookingId'), 'otaBookingId');

	await transactions.asyncMap(async trans => {
		const booking = bookingsObj[trans.bookingNo];
		if (!booking) {
			logger.warn(`${OTAName} addPayment not found booking`, trans);
			return;
		}

		// if (booking.isRatePaid()) {
		// 	const payout = await models.Payout.findOne({
		// 		bookingId: booking._id,
		// 		payoutType: PayoutType.RESERVATION,
		// 		state: { $ne: PayoutStates.DELETED },
		// 		fromOTA: { $ne: true },
		// 	}).select('_id');
		// 	// already created by accountant
		// 	if (payout) {
		// 		return;
		// 	}
		// }

		const currencyAmount = {
			amount: trans.balance,
			exchangedAmount: trans.balance,
		};
		const otaId = `${OTAName}_${trans.sn}`;

		return models.Payout.createOTAPayout({
			otaName: OTAName,
			otaId,
			currencyAmount,
			collectorCustomName: OTAName,
			paidAt: moment(trans.createTime, 'YYYY-MM-DD HH:mm:ss').toDate(),
			blockIds: [property.blockId || booking.blockId],
			bookingId: booking._id,
			fromOTA: true,
		}).catch(e => logger.error(e));
	});
}

async function fetchAll(from, to, blockId) {
	const otas = await models.OTAManager.findByName(OTAName);
	from = from || moment().add(-30, 'day').toDate();
	to = to || moment().endOf('month').toDate();

	await otas.asyncForEach(async ota => {
		const properties = await models.Block.getPropertiesId(OTAName, ota.account, true, blockId);
		return properties.asyncForEach(async property => {
			const transactions = await getTransactions(ota, property.propertyId, from, to);
			return addPayments(transactions, property);
		});
	});
}

module.exports = {
	fetchAll,
};
