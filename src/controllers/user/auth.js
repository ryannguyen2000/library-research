const jwt = require('jsonwebtoken');
const _ = require('lodash');

const { JWT_CONFIG } = require('@config/setting');
const userutils = require('@utils/userutils');
const { getArray } = require('@utils/query');
const { UserRoles } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function authenticate(data) {
	const { username, password } = data;
	const user = await models.User.findOne({ username, enable: true }).select('_id name password revokeKey');
	const hashPasswords = userutils.hashPassword(password);

	if (!user || user.password !== hashPasswords) {
		throw new ThrowReturn('Authentication failed. Wrong username or password!');
	}

	_.unset(user, 'password');

	await models.User.updateOne({ _id: user._id }, { lastLogin: new Date() });

	const token = jwt.sign({ user }, JWT_CONFIG.SECRET_KEY, {
		expiresIn: JWT_CONFIG.EXPIRE,
	});

	return { user, token };
}

async function getMenus(user) {
	const { role } = user;
	const roleGroup = await models.RoleGroup.findOne({ role });

	return { groups: roleGroup.groups, tabs: roleGroup.tabs };
}

async function changePassword(user, body) {
	const { oldPassword, newPassword } = body;

	if (user.password !== userutils.hashPassword(oldPassword)) {
		throw new ThrowReturn('Old passworld incorrect');
	}
	if (!userutils.validatePassword(newPassword)) {
		throw new ThrowReturn('Password is not valid');
	}

	await user.changePassword(newPassword, false);
}

async function updateNotificationKey(user, data) {
	const { deviceName, notiId } = data;

	await models.UserDevice.updateOrCreate(user._id, deviceName, notiId);
}

async function getUserInfo(user) {
	const userInfo = _.omit(user, ['password', 'revokeKey']);

	return { user: userInfo };
}

async function updateUserInfo(user, data) {
	const allowFields = ['name', 'address', 'phone', 'city'];

	_.assign(user, _.pick(data, allowFields));

	await user.save();

	return { user: _.pick(user, allowFields) };
}

async function getUsers(user, query) {
	const { maid, account, role, taskTag } = query;

	const filter = { roleName: user.role, includeMe: account && account === 'true' };
	if (role) {
		filter.role = getArray(role);
	}
	if (maid === 'true') {
		// const maidRoles = [UserRoles.MAID, UserRoles.REPAIRER];
		// filter.role = filter.role ? _.intersection(filter.role, maidRoles) : maidRoles;
		filter.isMaid = true;
	}

	if (taskTag) {
		const ctg = await models.TaskCategory.findOne({ tag: taskTag })
			.select('departmentIds')
			.populate('departmentIds', 'roles');
		if (!ctg) {
			throw new ThrowReturn('Tag is not valid!');
		}
		const roles = _.map(ctg.departmentIds, 'roles').flat();
		filter.role = filter.role ? _.intersection(filter.role, roles) : roles;
	}

	const accessRoles = await models.RoleGroup.getUnderRoles(filter);

	const users = await models.User.find({ enable: true, role: accessRoles, groupIds: { $in: user.groupIds } })
		.select('no username name role phone address managerId enable webPassIds')
		.populate('managerId', 'username name')
		.lean();

	return { users };
}

async function getDepartments() {
	const departments = await models.Department.find();

	return { departments };
}

module.exports = {
	authenticate,
	getMenus,
	changePassword,
	updateNotificationKey,
	getUserInfo,
	updateUserInfo,
	getUsers,
	getDepartments,
};
