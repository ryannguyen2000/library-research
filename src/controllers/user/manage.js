const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');
const { rangeDate } = require('@utils/date');
const { USER_SYS_NAME } = require('@utils/const');
const { normPhone } = require('@utils/phone');

const models = require('@models');

async function createAccount(user, body) {
	body.username = _.trim(body.username).toLowerCase();

	if (!body.password) {
		throw new ThrowReturn('Passwords must not be empty');
	}
	if (!body.username) {
		throw new ThrowReturn('Username must not be empty');
	}

	// create user
	const exists = await models.User.findOne({ username: body.username }).select('_id');
	if (exists) {
		throw new ThrowReturn('Tên đăng nhập đã tồn tại!');
	}
	if (_.values(USER_SYS_NAME).includes(body.username)) {
		throw new ThrowReturn('Tên đăng nhập không hợp lệ!');
	}

	body.phone = normPhone(body.phone);

	const newUser = await models.User.createNewAccount(body, user);

	// create hosting
	// const createdBy = req.decoded.user._id;
	const host = await models.Host.create({ ...body, _id: newUser._id });

	// const hostBlocks = await models.HostBlock.find({ userId: createdBy }).select('-_id blockId roomIds');
	// await models.HostBlock.insertMany(
	// 	hostBlocks.map(b => ({
	// 		...b.toJSON(),
	// 		userId: user._id,
	// 		createdBy,
	// 	}))
	// );

	return { user: newUser, host };
}

async function changeAccountRole(user, account, data) {
	const { role } = data;

	if (user._id.equals(account._id) || role === user.role) {
		throw new ThrowReturn().status(403);
	}

	const accessRoles = await models.RoleGroup.getUnderRoles({
		roleName: user.role,
		role,
	});
	if (!accessRoles.length) {
		throw new ThrowReturn().status(403);
	}

	account.role = role;
	await account.save();

	return { user: _.pick(account, 'role') };
}

async function lockAccount(accountId, data) {
	const { enable = true } = data;

	await models.User.updateOne({ _id: accountId }, { $set: { enable } });
	if (!enable) {
		await models.Host.updateOne({ _id: accountId }, { $set: { hosting: [] } });
	}
}

async function getWorkingSchedules(query) {
	const { from, to, userId } = query;

	const filter = _.pickBy({
		date: { $gte: from, $lte: to },
		userId,
	});

	const schedules = await models.WorkSchedule.find(filter).then(rs => _.keyBy(rs, 'date'));
	const userHosting = await models.Host.findById(userId).select('hosting');

	const rs = rangeDate(from, to)
		.toArray()
		.map(date => {
			const dFormatted = date.toDateMysqlFormat();
			const data = schedules[dFormatted] || { date: dFormatted, times: [], userId };

			if (!data.blockIds || !data.blockIds.length) {
				data.blockIds = _.get(userHosting, 'hosting');
			}

			return data;
		});

	return { schedules: rs };
}

async function updateWorkingSchedule(userId, body) {
	const bulks = _.map(body, item => ({
		updateOne: {
			filter: {
				date: item.date,
				userId,
			},
			update: {
				times: item.times,
				note: item.note,
				blockIds: item.blockIds,
			},
			upsert: true,
		},
	}));

	if (bulks.length) {
		await models.WorkSchedule.bulkWrite(bulks);
	}
}

module.exports = {
	createAccount,
	changeAccountRole,
	lockAccount,
	getWorkingSchedules,
	updateWorkingSchedule,
};
