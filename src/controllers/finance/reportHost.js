const _ = require('lodash');
const moment = require('moment');

const models = require('@models');
const { OPERATION_REPORT_TYPE } = require('@utils/const');
const { getHostRevenues, getRevenues } = require('./report_host/revenue');
const { getOverview } = require('./report_host/overview');
const OverviewV2 = require('./report_host/overviewV2');
const { getFees, getOTAsAndOtherFees, getOTAsAndOtherFeesV2 } = require('./report_host/fee');
const { getReportNotesRevenueTemplateHtml } = require('../report/categories/reportRevenue');

async function findBlock(blockId, roomIds, userId) {
	let block = await models.Block.findById(blockId)
		.select('info.name info.shortName manageFee reportConfig.overviewKeys startRunning OTAProperties')
		.lean();
	if (!block) {
		return Promise.reject('Home not found!');
	}

	block.OTAs = _.keyBy(block.OTAProperties, 'otaName');

	delete block.OTAProperties;

	if (userId) {
		const blockUser = await models.HostBlock.findOne({ blockId, userId }).lean();
		if (blockUser && blockUser.roomIds && blockUser.roomIds.length) {
			roomIds = roomIds ? _.intersectionBy(blockUser.roomIds, roomIds, _.toString) : blockUser.roomIds;
		}
	}

	return { block, rooms: roomIds && roomIds.toMongoObjectIds() };
}

async function validateParams({ blockId, roomIds, from, to, month, userId, ...q }) {
	from = from
		? new Date(from).zeroHours()
		: new Date(moment(month, 'Y-MM').startOf('month').format('Y-MM-DD')).zeroHours();
	to = to ? new Date(to).zeroHours() : new Date(moment(month, 'Y-MM').endOf('month').format('Y-MM-DD')).zeroHours();

	const MAX_MONTH = 2;

	const diff = moment(to).diff(from, 'month');
	if (diff > MAX_MONTH) {
		return Promise.reject(`Thời gian vui lòng không vượt quá ${MAX_MONTH} tháng!`);
	}

	const startDate = moment(from).format('Y-MM-DD');
	const endDate = moment(to).format('Y-MM-DD');

	const { block, rooms } = await findBlock(blockId, roomIds, userId);
	const [taxRate, blockManageFee, feeGroupReport] = await Promise.all([
		models.Setting.getReportTax(startDate, endDate),
		models.Block.getManageFee({ blockId, date: from.toDateMysqlFormat() }),
		models.FeeReportGroup.getFeeReportGroup(blockId),
	]);

	block.manageFee = blockManageFee;
	const revenueKeys = models.Block.getRevenueKeys(blockManageFee);

	q.language = q.language || 'vi';

	return {
		...q,
		from,
		to,
		block,
		rooms,
		revenueKeys,
		feeGroupReport,
		taxRate,
		startDate,
		endDate,
		isVer2: blockManageFee.version !== 1,
	};
}

async function getReportByConfig(data, isFull) {
	const { config, hostRevenues, revenues, fees, block, from, to, taxRate, feeGroupReport, language } = data;

	const input = {
		block,
		revenue: revenues,
		hostRevenues,
		fee: fees,
		from,
		to,
		config,
		taxRate,
		feeGroupReport,
		language,
	};

	const isVer2 = config.version !== 1;

	const overview = isVer2 ? OverviewV2.getOverview(input) : getOverview(input);

	const overviewNotesHtml = getReportNotesRevenueTemplateHtml(overview);

	const feeInput = {
		overview,
		revenue: revenues,
		fee: fees,
		language,
		config,
	};

	const OTAsAndOtherFee = isVer2 ? await getOTAsAndOtherFeesV2(feeInput) : await getOTAsAndOtherFees(feeInput);

	const startDate = moment(from).format('Y-MM-DD');
	const endDate = moment(to).format('Y-MM-DD');

	return {
		block,
		startDate,
		endDate,
		revenue: _.omit(revenues, ['payouts']),
		fee: OTAsAndOtherFee,
		overview,
		overviewNotesHtml,
		taxRate,
		reportType: config.reportType,
		version: config.version || 2,
		params: isFull ? data : undefined,
	};
}

async function getReport(params) {
	const { block, from, to, rooms, taxRate, revenueKeys, feeGroupReport, language, isFull } = await validateParams(
		params
	);

	if (!isFull) {
		const operation = await models.OperationReport.findOne({
			blockId: block._id,
			from,
			to,
			type: { $in: [OPERATION_REPORT_TYPE.APPROVED_REPORT, OPERATION_REPORT_TYPE.REQUEST_MODIFY_REPORT] },
		})
			.sort({
				createdAt: -1,
			})
			.lean();

		if (
			operation &&
			operation.type === OPERATION_REPORT_TYPE.APPROVED_REPORT &&
			!_.isEmpty(operation.data) &&
			!_.isEmpty(operation.params)
		) {
			return getReportByConfig({
				...operation.params,
				...operation.data,
				language,
				from,
				to,
			});
		}
	}

	const config = { ...block.manageFee, ...block.reportConfig, startRunning: block.startRunning, OTAs: block.OTAs };

	const hostRevenues = await getHostRevenues({ blockId: block._id, roomIds: rooms, from, to });

	const revenues = await getRevenues({
		blockId: block._id,
		from,
		to,
		config,
		roomIds: rooms,
		taxRate,
		hostRevenues,
		language,
		revenueKeys,
	});

	const fees = await getFees({
		blockId: block._id,
		roomIds: rooms,
		from: moment(from).startOf('date').toDate(),
		to: moment(to).endOf('date').toDate(),
		config,
		language,
		feeGroupReport,
	});

	const options = {
		config,
		hostRevenues,
		revenues,
		fees,
		block,
		from,
		to,
		taxRate,
		language,
		feeGroupReport,
	};

	return getReportByConfig(options, isFull);
}

async function debugRevReport(params) {
	const { block, from, to, rooms, taxRate, revenueKeys, feeGroupReport, language } = await validateParams(params);

	const hostRevenues = await getHostRevenues({ blockId: block._id, roomIds: rooms, from, to });

	const revenue = await getRevenues({
		block,
		blockId: block._id,
		from,
		to,
		config: block.manageFee,
		roomIds: rooms,
		taxRate,
		hostRevenues,
		language,
		revenueKeys,
	});

	const revenues = {};
	const transactionFees = {};

	_.forEach(revenue, rev => {
		if (rev && rev.data) {
			_.forEach(rev.data, item => {
				revenues[item.otaBookingId] = revenues[item.otaBookingId] || 0;
				revenues[item.otaBookingId] += item.vnd;

				if (item.transactionFee) {
					transactionFees[item.otaBookingId] = transactionFees[item.otaBookingId] || 0;
					transactionFees[item.otaBookingId] += item.transactionFee;
				}
			});
		}
	});

	const fee = await getFees({
		blockId: block._id,
		roomIds: rooms,
		from: moment(from).startOf('date').toDate(),
		to: moment(to).endOf('date').toDate(),
		config: block.manageFee,
		language,
		feeGroupReport,
	});
	const OTAsAndOtherFee = await getOTAsAndOtherFees({
		revenue,
		fee,
		language,
		config: block.manageFee,
	});

	const fees = {};
	OTAsAndOtherFee.data.forEach(item => {
		if (item._id) {
			fees[item._id] = fees[item._id] || 0;
			fees[item._id] += item.vnd;
		}
	});

	return {
		revenues,
		fees,
		transactionFees,
	};
}

module.exports = { getReport, debugRevReport };
