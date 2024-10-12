const _ = require('lodash');
const moment = require('moment');
const AsyncLock = require('async-lock');

// const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { StringeeType, ONE_MINUTE } = require('@utils/const');
const { logger } = require('@utils/logger');
const { getArray } = require('@utils/query');
const { getLogs, saveRecorded } = require('@services/stringee/log');

function getUsersLogs(calls) {
	const set = new Set();

	calls.forEach(c => {
		set.add(c.to_number);
		set.add(c.from_user_id);
	});

	const ids = [...set];
	if (!ids.length) return {};

	return models.CallUser.find({ stringee_user_id: { $in: ids } })
		.select('userId stringee_user_id')
		.populate('userId', 'username name')
		.lean()
		.then(rs => _.keyBy(rs, 'stringee_user_id'));
}

async function getCallLogs(req, res) {
	const { user } = req.decoded;

	// const project = await models.CallProject.findOne({ groupIds: { $in: user.groupIds } });
	// if (!project) throw new ThrowReturn().status(404);

	let {
		from_user_id,
		from_internal,
		from_answer_time,
		to_answer_time,
		from_number,
		from_start_time,
		to_number,
		to_start_time,
		page,
		limit,
		status,
		keyword,
		home,
		showTotal,
	} = req.query;

	page = parseInt(page) || 1;
	home = getArray(home);
	from_start_time = parseInt(from_start_time);
	to_start_time = parseInt(to_start_time);
	from_answer_time = parseInt(from_answer_time);
	to_answer_time = parseInt(to_answer_time);
	keyword = _.trim(keyword);

	const filter = _.pickBy(
		{
			groupIds: { $in: user.groupIds },
			status,
			// 'data.project_id': project.stringeeProjectId,
			'data.from_number': from_number
				? new RegExp(`^${_.escapeRegExp(from_number.replace(/\+/g, ''))}`)
				: undefined,
			'data.to_number': to_number ? new RegExp(`^${_.escapeRegExp(to_number.replace(/\+/g, ''))}`) : undefined,
			'data.from_internal': from_internal ? Number(from_internal) : undefined,
		},
		v => v !== undefined
	);

	if (!_.isNaN(from_start_time)) {
		_.set(filter, ['data.start_time', '$gte'], from_start_time);
	}
	if (!_.isNaN(to_start_time)) {
		_.set(filter, ['data.start_time', '$lte'], to_start_time);
	}
	if (!_.isNaN(from_answer_time)) {
		_.set(filter, ['data.answer_time', '$gte'], from_answer_time);
	}
	if (!_.isNaN(to_answer_time)) {
		_.set(filter, ['data.answer_time', '$lte'], to_answer_time);
	}

	if (from_user_id) {
		filter.$or = [
			{ 'data.from_user_id': from_user_id ? new RegExp(_.escapeRegExp(from_user_id), 'i') : undefined },
			{ 'data.to_number': from_user_id ? new RegExp(_.escapeRegExp(from_user_id), 'i') : undefined },
		];
	}

	if (keyword) {
		const regex = new RegExp(`^${_.escapeRegExp(_.toUpper(keyword))}`);
		if (!filter.$or) filter.$or = [];
		filter.$or.push({ otaBookingId: regex });
		filter.$or.push({ phone: regex });
	}

	// const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: home });
	// const mainGroup = await models.UserGroup.findOne({ _id: user.groupIds, primary: true }).select('_id');
	// const isMainGroup = user.groupIds[0].equals(project.groupIds[0]);

	// const mFilter = {
	// 	$or: [{}],
	// };

	// if (!home && (await models.UserGroup.findOne({ _id: user.groupIds, primary: true }).select('_id'))) {
	// 	mFilter.$or[0].blockId = { $in: [null, ...blockIds] };
	// } else {
	// 	mFilter.$or[0].blockId = { $in: blockIds };
	// }

	// const callUser = await models.CallUser.findOne({ userId: user._id }).select('stringee_user_id');
	// if (callUser && callUser.stringee_user_id) {
	// 	mFilter.$or.push(
	// 		{
	// 			'data.to_number': callUser.stringee_user_id,
	// 		},
	// 		{
	// 			'data.from_user_id': callUser.stringee_user_id,
	// 		}
	// 	);
	// }

	if (home) {
		filter.blockId = home;
	}

	// const ffilter = _.isEmpty(filter)
	// 	? mFilter
	// 	: {
	// 			$and: [filter, mFilter],
	// 	  };

	const total = await models.Stringee.countDocuments(filter);

	if (showTotal) {
		return res.sendData({ totalCalls: total });
	}

	const logs = await models.Stringee.find(filter)
		.sort({ 'data.created': -1 })
		.skip((page - 1) * limit)
		.limit(limit)
		.populate({
			path: 'bookingIds',
			select: 'from to otaName otaBookingId messages blockId status error checkin checkinType checkout checkoutType isPaid reservateRooms',
			populate: [
				{
					path: 'messages',
					select: 'otaName declined inquiry approved otaBookingId inquiryDetails.pageName guestId attitude',
					populate: {
						path: 'guestId',
						select: 'displayName fullName avatar genius isVip phone',
					},
				},
				{
					path: 'reservateRooms',
					select: 'info.name info.roomNo',
				},
				{
					path: 'totalCall totalMsg',
				},
				{ path: 'blockId', select: 'info.name info.shortName' },
			],
		})
		.lean();

	const calls = logs.map(models.Stringee.parseDoc);

	const data = {
		calls,
		page,
		limit,
		currentPage: page,
		totalPages: Math.ceil(total / limit),
		totalCalls: total,
	};

	data.users = await getUsersLogs(data.calls);

	res.sendData(data);
}

async function updateLogStatus(req, res) {
	const { id } = req.params;
	const { status } = req.body;

	const log = await models.Stringee.findById(id);
	Object.assign(log, { status });
	log.$locals.skipNewCallEvent = true;
	await log.save();

	res.sendData(_.pick(log, _.keys('req.body')));
}

async function getCallLog(req, res) {
	const { id } = req.params;

	const data = await models.Stringee.findOne({ 'data.id': id });
	res.sendData(data && { ...data.data, status: data.status, _id: data._id, phoneNumber: data.phone });
}

const MAX_CONCURRENT_LOG = 200;
const LIMIT = 100;

async function syncChunkLogs(project, query) {
	query.page = parseInt(query.page) || 1;

	const log = await getLogs(project, { limit: LIMIT, ...query });
	if (!log || !log.calls || !log.calls.length) return [];

	let hasNext = true;

	await log.calls.asyncMap(async data => {
		const phone = data.callee ? data.from_number : data.to_number;
		const [doc, isNew] = await models.Stringee.createLog(data.callee || data.from_number, phone, data);
		if (isNew) {
			saveRecorded(project, doc);
			models.UserLog.addLogFromCalling(doc);
		} else {
			hasNext = false;
		}
	});

	if (hasNext && LIMIT * query.page < MAX_CONCURRENT_LOG) {
		await syncChunkLogs(project, { ...query, page: query.page + 1 });
	}
}

const asyncLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 10000 });

async function syncLogs(project, from) {
	if (global.isDev) return;

	try {
		await asyncLock.acquire(project.stringeeProjectId, async () => {
			if (!from) {
				const last = await models.Stringee.findOne({
					type: StringeeType.Stringee,
				})
					.sort({ 'data.created': -1 })
					.select('data.start_time');
				if (last) {
					from = parseInt(last.data.start_time) - ONE_MINUTE * 2;
				}
			}

			from = parseInt(from) || moment().add(-1, 'day').startOf('day').valueOf();

			await syncChunkLogs(project, { from_start_time: from });
		});
	} catch (e) {
		logger.error('syncLogs', from, e);
	}
}

module.exports = { getCallLogs, getCallLog, syncLogs, updateLogStatus };
