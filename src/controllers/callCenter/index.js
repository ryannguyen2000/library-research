const moment = require('moment');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { saveRecorded } = require('@services/stringee/log');
const { getDayOfWeek } = require('@services/stringee/utils');
const models = require('@models');
const { syncLogs } = require('./log');

async function getAgents(project, phone, to) {
	const filter = { projectId: project._id };

	let groupId;

	if (to) {
		const currentPhone = project.phoneList.find(p => p.groupId && p.number.includes(to));
		if (currentPhone) {
			groupId = currentPhone.groupId;
		}
	}

	if (!groupId) {
		const log =
			phone && (await models.Stringee.findOne({ phone, blockId: { $ne: null } }).sort({ 'data.created': -1 }));

		if (log) {
			const block = await models.Block.findById(log.blockId).select('groupIds');
			groupId = _.head(block.groupIds);
		} else {
			groupId = _.head(project.groupIds);
		}
	}

	const userIds = await models.User.findByGroup(groupId);
	filter.userId = { $in: userIds };

	const agents = await models.CallUser.getCanAccessAgents(filter);

	return agents.map(a => ({
		stringee_user_id: a.stringee_user_id,
		phone_number: a.phone_number,
	}));
}

async function getListAgents(req, res) {
	try {
		logger.info('getListAgents', JSON.stringify(req.body, '', 4));

		const { calls, projectId } = req.body;

		const project = await models.CallProject.findOne({ stringeeProjectId: projectId });
		if (!project) {
			return res.json({
				version: 2,
				calls: [],
			});
		}

		const from = _.get(calls, '[0].from') || _.get(calls, '[0].from.number');
		const to = _.get(calls, '[0].to') || _.get(calls, '[0].to.number');
		const agents = await getAgents(project, from, to);

		const callsRes = _.map(calls, call => ({
			callId: call.callId,
			agents,
		}));

		const data = {
			version: 2,
			calls: callsRes,
		};

		res.json(data);
	} catch (e) {
		logger.error('getListAgents error', e);
		res.json({
			version: 2,
			calls: [],
		});
	}
}

async function accessCallout(stringeeProjectId, stringee_user_id) {
	const time = moment().format('HH:mm');

	const project = await models.CallProject.findOne({ stringeeProjectId });
	if (!project) return false;

	const user = await models.CallUser.findOne({
		projectId: project._id,
		stringee_user_id,
		days: {
			$elemMatch: {
				day: getDayOfWeek(),
				disabled_calling: false,
				time_start: {
					$lte: time,
				},
				time_end: {
					$gte: time,
				},
			},
		},
	}).select('_id');

	return !!user;
}

async function getAnswerUrl(req, res) {
	const { from, to, fromInternal, userId, projectId } = req.query;

	if (fromInternal === 'false') {
		return res.json([
			{
				action: 'record',
				format: 'mp3',
			},
			{
				action: 'connect',
				from: {
					type: 'external',
					number: from,
					alias: from,
				},
				to: {
					type: 'internal',
					number: to,
					alias: to,
				},
				peerToPeerCall: false,
			},
		]);
	}

	if (await accessCallout(projectId, userId)) {
		return res.json([
			{
				action: 'record',
				format: 'mp3',
			},
			{
				action: 'connect',
				from: {
					type: 'internal',
					number: from,
					alias: from,
				},
				to: {
					type: 'external',
					number: to,
					alias: to,
				},
				peerToPeerCall: false,
			},
		]);
	}

	res.json([]);
}

async function getRecorded(req, res) {
	const { id } = req.params;

	const call = await models.Stringee.findOne({ 'data.id': id });
	if (!call || !call.data.project_id) {
		return res.sendStatus(404);
	}

	const project = await models.CallProject.findOne({ stringeeProjectId: call.data.project_id });
	const recordPath = await saveRecorded(project, call);

	if (!recordPath) {
		return res.sendStatus(404);
	}

	res.sendFile(recordPath);
}

async function processEventData(data) {
	try {
		const isEnded = data.call_status === 'ended';
		if (isEnded) {
			const clientCustomData = data.clientCustomData && JSON.parse(data.clientCustomData);
			if (clientCustomData) {
				const bFilter = {};

				if (clientCustomData.otaBookingId) {
					bFilter.otaBookingId = clientCustomData.otaBookingId;
					bFilter.otaName = clientCustomData.otaName;
				} else if (clientCustomData.messageId) {
					bFilter.messages = clientCustomData.messageId;
				}

				if (!_.isEmpty(bFilter)) {
					const booking = await models.Booking.findOne(bFilter).select('otaName otaBookingId blockId');
					if (booking) {
						await models.Stringee.updateOne(
							{ 'data.id': data.call_id },
							{
								$set: {
									otaBookingId: booking.otaBookingId,
									otaName: booking.otaName,
									blockId: booking.blockId,
								},
								$setOnInsert: {
									mid: data.call_id,
									'data.created': _.round(data.timestamp_ms / 1000),
								},
							},
							{
								upsert: true,
							}
						);
					}
				}
			}

			const customData = data.customData && JSON.parse(data.customData);
			const fromTime = _.get(customData, 'callInfo.callStartTime');

			const project = await models.CallProject.findOne({ stringeeProjectId: data.project_id });

			await syncLogs(project, fromTime && fromTime - 60 * 1000);
		}
	} catch (e) {
		logger.error(e);
	}
}

module.exports = { getListAgents, getAnswerUrl, getRecorded, processEventData };
