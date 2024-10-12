const moment = require('moment');
const _ = require('lodash');

// const { AsyncOne } = require('@utils/async');
const { logger } = require('@utils/logger');
const { getDayOfWeek } = require('@services/stringee/utils');
const { findAgent, assignGroup, createAgent, getUsers } = require('@services/stringee/agent');
const { generateToken } = require('@services/stringee/helper');
const models = require('@models');

function getStringeeUserId(user) {
	return user.username.replace(/@/g, '_');
}

async function checkUserToken(config, callUser) {
	if (!callUser.token || !callUser.exp || callUser.exp <= Date.now()) {
		const auth = generateToken(config, { userId: callUser.stringee_user_id });
		callUser.token = auth.token;
		callUser.exp = auth.exp;
		await callUser.save();
	}
}

async function getAgent(user) {
	const project = await models.CallProject.findOne({ groupIds: { $in: user.groupIds } });
	if (!project) return null;

	const callUser = (await models.CallUser.findOne({ userId: user._id })) || new models.CallUser({ userId: user._id });
	callUser.projectId = project._id;

	const now = moment().format('HH:mm');
	const day = getDayOfWeek();
	const currentDay = _.find(callUser.days, d => d.day === day);

	if (
		!currentDay ||
		(currentDay.disabled_calling && currentDay.disabled_listening) ||
		now < currentDay.time_start ||
		now > currentDay.time_end
	) {
		return null;
	}

	if (!callUser.id) {
		const stringee_user_id = getStringeeUserId(user);
		const agent =
			(await findAgent(project, stringee_user_id)) ||
			(await createAgent(project, {
				name: user.name,
				stringee_user_id,
				manual_status: 'AVAILABLE',
			}));

		if (agent) {
			await assignGroup(project, agent);
			_.assign(callUser, agent);
			await callUser.save();
		}
	}

	await checkUserToken(project, callUser);

	return [callUser, project];
}

async function access(req, res) {
	const { user } = req.decoded;

	let data = await getAgent(user);

	if (data) {
		const project = data[1];
		data = data[0].toJSON();

		data.phone_list = project.phoneList.filter(p => p.groupId && user.groupIds.includesObjectId(p.groupId));
		if (!data.phone_list.length) {
			data.phone_list = project.phoneList.filter(p => !p.groupId);
		}
	}

	res.sendData(data);
}

// const asyncOne = new AsyncOne();

// function getOnlineUserByAPI(project, query) {
// 	return asyncOne.acquire(`${project.stringeeProjectId}`, async () => {
// 		return await getUsers(project, query);
// 	});
// }

async function getOnlineUsers(req, res) {
	const { user } = req.decoded;

	const project = await models.CallProject.findOne({ groupIds: { $in: user.groupIds } });
	const data = await getUsers(project);

	const onlineUsers = _.get(data, 'users');
	if (!onlineUsers || !onlineUsers.length) {
		logger.warn('getOnlineUsers', data);
		return res.sendData({ users: [], total: 0, order: 0 });
	}

	const filter = {
		projectId: project._id,
		stringee_user_id: { $in: _.map(onlineUsers, 'userId') },
	};
	const userIds = await models.User.findByGroup(user.groupIds);
	filter.userId = { $in: userIds };

	const canAccessAgents = await models.CallUser.getCanAccessAgents(filter);
	const userObj = _.keyBy(onlineUsers, 'userId');

	const users = canAccessAgents.map(agent => {
		return {
			...userObj[agent.stringee_user_id],
			...agent,
		};
	});

	res.sendData({
		users,
		total: users.length,
		order: users.findIndex(u => user._id.equals(u.userId)) + 1,
	});
}

module.exports = { access, getOnlineUsers };
