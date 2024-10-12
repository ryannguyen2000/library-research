const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { normPhone } = require('@utils/phone');
const { MessageGroupType } = require('@utils/const');
const models = require('@models');

require('./auto');
require('./autoTask');

async function updateHostGroup(thread, body) {
	const { fullName, phone, email, hostId } = body;

	let host = hostId
		? await models.Guest.findById(hostId)
		: phone
		? await models.Guest.findWithPhoneNumber(thread.groupIds, phone)
		: null;

	if (host) {
		host.phone = phone;
		host.isHost = true;
		if (fullName) host.fullName = fullName;
		if (email) host.email = email;
		await host.save();
	} else if (phone || fullName) {
		host = await models.Guest.create({
			otaId: normPhone(phone) || Date.now(),
			isHost: true,
			phone,
			email,
			fullName,
		});
	}

	return host;
}

async function updateGroupMembers(user, thread, members) {
	const inbox = await models.BlockInbox.findOne({ messageId: thread._id });

	const bulkUpdates = [];
	const bulkRemoves = [];

	const roles = await models.RoleGroup.getRoles(user.role, '$gte');

	_.forEach(members, member => {
		bulkRemoves.push({
			updateOne: {
				filter: {
					role: { $in: roles },
					'otts.ottId': member.id,
					'otts.ottName': thread.otaName,
				},
				update: {
					$pull: {
						otts: {
							ottId: member.id,
							ottName: thread.otaName,
							ottPhone: inbox.ottPhone,
						},
					},
				},
			},
		});

		if (!member.userId) return;

		bulkUpdates.push({
			updateOne: {
				filter: {
					_id: member.userId,
					role: { $in: roles },
				},
				update: {
					$push: {
						otts: {
							ottId: member.id,
							ottName: thread.otaName,
							ottPhone: inbox.ottPhone,
						},
					},
				},
			},
		});
	});

	if (bulkRemoves.length) {
		await models.User.bulkWrite(bulkRemoves);
	}
	if (bulkUpdates.length) {
		await models.User.bulkWrite(bulkUpdates);
	}

	return {
		members,
	};
}

async function updateGroup(req, res) {
	const { groupType, departmentId, taskNotification, blockId, members } = req.body;
	const thread = req.data.message;

	const rs = {};

	if (!_.isUndefined(groupType)) {
		thread.groupType = groupType;
		rs.groupType = thread.groupType;

		if (!_.isUndefined(blockId)) {
			if (blockId) {
				rs.blockId = await models.Block.findById(blockId).select('info');
				if (!rs.blockId) throw new ThrowReturn('blockId not found!');
			}
			thread.blockId = blockId;
			rs.blockId = rs.blockId || blockId;
		}

		if (groupType === MessageGroupType.HOST) {
			const host = await updateHostGroup(thread, req.body);
			thread.hostId = host ? host._id : undefined;
			_.assign(rs, {
				hostId: host,
			});
		}
	}
	if (!_.isUndefined(taskNotification)) {
		thread.taskNotification = taskNotification;
		rs.taskNotification = thread.taskNotification;
	}
	if (!_.isUndefined(departmentId)) {
		if (departmentId) {
			rs.departmentId = await models.Department.findById(departmentId);
			if (!rs.departmentId) throw new ThrowReturn('departmentId not found!');
		}
		thread.departmentId = departmentId;
		rs.departmentId = rs.departmentId || departmentId;
	}
	if (members && members.length) {
		_.assign(rs, await updateGroupMembers(req.decoded.user, thread, members));
	}

	await thread.save();

	if (_.isUndefined(blockId)) {
		await models.BlockInbox.updateOne({ messageId: thread._id }, { $set: { blockId: thread.blockId } });
	}

	res.sendData({
		...rs,
		groupType,
	});
}

async function updateGroupAutoMessage(req, res) {
	const { autoMessages } = req.body;
	const thread = req.data.message;

	thread.autoMessages = autoMessages || [];
	await thread.save();

	res.sendData({
		autoMessages: thread.autoMessages,
	});
}

module.exports = {
	updateGroup,
	updateGroupAutoMessage,
};
