const _ = require('lodash');

const { RolePermissons } = require('@utils/const');
const models = require('@models');

async function getCCUsers(user, query) {
	const { day } = query;

	const roles = await models.RoleGroup.getUnderRoles({ roleName: user.role, 'groups.name': RolePermissons.CALLING });

	const users = await models.User.aggregate()
		.match({
			enable: true,
			groupIds: { $in: user.groupIds },
			role: { $in: roles },
		})
		.project({ name: 1, username: 1, userId: '$_id' });

	const callUsers = await models.CallUser.aggregate()
		.match({
			userId: { $in: _.map(users, '_id') },
		})
		.unwind('$days')
		.match({
			'days.day': day,
		})
		.project({
			days: 1,
			stringee_user_id: 1,
			userId: 1,
		})
		.sort({
			'days.order': -1,
		});

	const objUsers = _.keyBy(users, '_id');
	const objCallUsers = {};
	callUsers.forEach(u => {
		_.assign(u, objUsers[u.userId]);
		objCallUsers[u.userId] = true;
	});

	callUsers.push(...users.filter(u => !objCallUsers[u._id]));

	return { users: callUsers };
}

async function orderCCUsers(data) {
	const { day, users } = data;

	const bulks = _.map(users, item => ({
		updateOne: {
			filter: {
				userId: item.userId,
				'days.day': day,
			},
			update: {
				$set: { 'days.$.order': item.order },
			},
		},
	}));

	if (bulks.length) {
		await models.CallUser.bulkWrite(bulks);
	}
}

async function updateCCUser(userId, data) {
	const callUser =
		(await models.CallUser.findOne({
			userId,
		})) || new models.CallUser({ userId });

	const currentDay = _.find(callUser.days, { day: data.day });
	if (currentDay) {
		_.assign(currentDay, data);
	} else {
		callUser.days.push(data);
	}

	await callUser.save();
}

module.exports = {
	getCCUsers,
	orderCCUsers,
	updateCCUser,
};
