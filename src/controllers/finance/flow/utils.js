const _ = require('lodash');
const moment = require('moment');

const { PayoutType, CASH_FLOW_OBJECT, Currency } = require('@utils/const');
const { getArray } = require('@utils/query');
const models = require('@models');
const { DETAIL_GROUP_KEY } = require('./const');

async function parseQuery({ blockId, period, excludeBlockId, showExpense, ...q }, user) {
	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: getArray(blockId), excludeBlockId });
	const parsedPeriod = period && moment(period, 'Y-MM').isValid() ? period : moment().format('Y-MM');

	const validBlocks = await models.Block.find({ _id: blockIds, active: true, isProperty: true }).select(
		'_id manageFee reportConfig'
	);

	return {
		blockIds: _.map(validBlocks, '_id'),
		blocks: _.keyBy(validBlocks, '_id'),
		period: parsedPeriod,
		showExpense: showExpense === 'true' || showExpense === true,
		...q,
	};
}

function sumData(data, key = 'total') {
	return _.sumBy(data, key) || 0;
}

async function mapDataToResponse(flowDocs, { isViewRemaining, groupType, groupValue }) {
	let mapData = {};
	let payouts = {};

	const bookingIds = _.chain(flowDocs).map('bookingId').compact().uniqBy(_.toString).value();
	if (bookingIds.length) {
		const bfilter = { _id: bookingIds };
		if (groupValue && groupType === DETAIL_GROUP_KEY.OTA) {
			bfilter.otaName = groupValue;
		}

		const bookings = await models.Booking.find(bfilter)
			.select(
				'price roomPrice otaFee paid otaName otaBookingId currency guestId blockId from to reservateRooms createdAt'
			)
			.lean();
		mapData.bookings = _.keyBy(bookings, '_id');
	}

	if (groupValue && groupType === DETAIL_GROUP_KEY.OTA) {
		flowDocs = flowDocs.filter(p => _.has(mapData.bookings, p.bookingId));
	}

	const payoutIds = _.chain(flowDocs).map('payoutId').compact().uniqBy(_.toString).value();
	if (payoutIds.length) {
		const pfilter = { _id: payoutIds };
		if (groupType === DETAIL_GROUP_KEY.PAYMENT_COLLECTOR) {
			pfilter.$or = [
				{
					collectorCustomName: new RegExp(_.escapeRegExp(groupValue), 'i'),
				},
				{
					source: groupValue,
				},
			];
		}

		const pDocs = await models.Payout.find(pfilter)
			.select('-logs')
			.populate('export', 'noId name createdBy -payouts')
			.lean();
		payouts = _.keyBy(pDocs, '_id');
	}

	if (groupValue && groupType === DETAIL_GROUP_KEY.PAYMENT_COLLECTOR) {
		flowDocs = flowDocs.filter(p => _.has(payouts, p.payoutId));
	}

	if (groupValue && groupType === DETAIL_GROUP_KEY.USER_COLLECT) {
		flowDocs = flowDocs.filter(f => {
			const p = _.get(payouts, f.payoutId);
			return p && _.toString(_.get(p.export, 'createdBy') || p.collector || p.createdBy) === groupValue;
		});
	}

	const blockKeys = {};
	const dataKey = isViewRemaining ? 'remaining' : 'total';

	let data = flowDocs.map(f => {
		blockKeys[f.blockId] = true;

		const booking = _.get(mapData.bookings, f.bookingId);
		const payout = payouts[f.payoutId] || null;
		const payoutType = _.get(payout, 'payoutType') || PayoutType.RESERVATION;

		return {
			...payout,
			_id: payoutType === PayoutType.PAY ? payout._id : f._id,
			currencyAmount: {
				amount: f[dataKey],
				currency: Currency.VND,
				exchangedAmount: f[dataKey],
			},
			payoutType,
			bookingId: f.bookingId,
			blockIds: [f.blockId],
			roomIds: _.get(booking, 'reservateRooms') || _.get(payout, 'roomIds'),
			otaName: _.get(booking, 'otaName'),
			paidAt: _.get(payout, 'paidAt') || _.get(booking, 'createdAt') || f.createdAt,
			createdAt: _.get(payout, 'createdAt') || _.get(booking, 'createdAt') || f.createdAt,
		};
	});

	const blocks = await models.Block.find({ _id: _.keys(blockKeys) }).select('info.name info.shortName');
	mapData.blocks = _.keyBy(blocks, '_id');

	const roomIds = _.chain(data).map('roomIds').flatten().uniqBy(_.toString).value();
	const rooms = roomIds.length ? await models.Room.find({ _id: roomIds }).select('info.roomNo').lean() : [];
	mapData.rooms = _.keyBy(rooms, '_id');

	const userIds = _.compact(_.uniqBy([..._.map(data, 'collector'), ..._.map(data, 'createdBy')], _.toString));
	const users = userIds.length ? await models.User.find({ _id: userIds }).select('name username').lean() : [];
	mapData.users = _.keyBy(users, '_id');

	const categoryIds = _.chain(data).map('categoryId').compact().uniqBy(_.toString).value();
	const categories = categoryIds.length ? await models.PayoutCategory.find({ _id: categoryIds }).lean() : [];
	mapData.categories = _.keyBy(categories, '_id');

	const rs = {
		data,
		mapData,
	};

	if (data[0] && data[0].payoutType === PayoutType.PAY) {
		rs.dataType = PayoutType.PAY;
	} else {
		rs.dataType = PayoutType.RESERVATION;
	}

	rs.amount = _.round(_.sumBy(data, 'currencyAmount.exchangedAmount'));

	return rs;
}

function calcRevenue(flows) {
	const revenueKeys = [CASH_FLOW_OBJECT.GUEST, CASH_FLOW_OBJECT.UNPAID];
	const revenues = flows.filter(f => revenueKeys.includes(f._id.destination));
	const refunded = flows.filter(f => f._id.destination === CASH_FLOW_OBJECT.REFUND);
	const backupIncome = flows.filter(f => f._id.destination === CASH_FLOW_OBJECT.BACKUP_CASH_FUND);
	const backupToRefunded = refunded.filter(f => f._id.source === CASH_FLOW_OBJECT.BACKUP_CASH_FUND);

	const des = [
		CASH_FLOW_OBJECT.CASH_FUND,
		CASH_FLOW_OBJECT.HOST_CASH_FUND,
		CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
		CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
	];
	const backupOut = flows.filter(
		f => f._id.source === CASH_FLOW_OBJECT.BACKUP_CASH_FUND && des.includes(f._id.destination)
	);

	return {
		total:
			sumData(backupOut) +
			sumData(revenues) -
			sumData(backupIncome) -
			(sumData(refunded) - sumData(backupToRefunded)),
	};
}

module.exports = {
	parseQuery,
	mapDataToResponse,
	calcRevenue,
	sumData,
};
