const _ = require('lodash');

const { RolePermissons } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const router = require('@core/router').Router();
const models = require('@models');

async function getPermissions(req, res) {
	const { user } = req.decoded;

	const currentRole = await models.RoleGroup.findOne({ role: user.role });

	const filter = { sys: { $ne: true } };

	if (!currentRole.isAdmin()) {
		filter.$or = [
			{
				public: true,
			},
			{
				name: { $in: _.map(currentRole.groups, 'name') },
			},
		];
	}

	const permissions = await models.RolePermissions.find(filter).select('name description');

	res.sendData({ permissions });
}

async function getRoleGroup(req, res) {
	const roles = await models.RoleGroup.getUnderRoles({
		roleName: req.decoded.user.role,
		minimize: false,
		includeMe: false,
	});

	res.sendData({ roles });
}

function validateTabs(userRole, tabs) {
	if (!tabs) return;

	const invalidTab = tabs.find(tab => !userRole.tabs.includes(tab));

	if (invalidTab) {
		throw new ThrowReturn(`Không có quyền cập nhật, tab ${invalidTab}`);
	}
}

async function validateGroups(userRole, groups) {
	if (!groups) return;

	const rolePermissions = await models.RolePermissions.find({ name: { $in: _.map(groups, 'name') } }).select(
		'name public'
	);

	const invalidGroup = groups.find(group => {
		const uGroup = userRole.groups.find(ug => ug.name === group.name);
		if (!uGroup) return true;

		const rolePermission = rolePermissions.find(p => p.name === group.name);
		if (!rolePermission) return true;

		if (rolePermission.public) return false;

		if (_.includes(group.methods, '*') || _.includes(group.methods, 'POST')) {
			return !(uGroup.methods.includes('*') || uGroup.methods.includes('POST'));
		}

		return false;
	});

	if (invalidGroup) {
		throw new ThrowReturn(`Không có quyền cập nhật, group ${invalidGroup.name} ${invalidGroup.methods}`);
	}
}

async function updateRoleGroup(req, res) {
	const { id } = req.params;
	const data = req.body;

	const [role] = await models.RoleGroup.getUnderRoles({
		roleName: req.decoded.user.role,
		minimize: false,
		includeMe: false,
		_id: id,
	});
	if (!role) {
		throw new ThrowReturn().status(404);
	}

	if (role.role === RolePermissons.ANONYMOUS) {
		throw new ThrowReturn('No update for anonymous role');
	}

	const userRole = await models.RoleGroup.findOne({ role: req.decoded.user.role });
	if (!userRole.isAdmin()) {
		validateTabs(userRole, data.tabs);
		validateGroups(userRole, data.groups);
	}

	Object.assign(role, data);
	await role.save();

	res.sendData({ role });
}

async function addRoleGroup(req, res) {
	const userRole = await models.RoleGroup.findOne({ role: req.decoded.user.role });

	if (!userRole.isAdmin()) {
		validateTabs(userRole, req.body.tabs);
		validateGroups(userRole, req.body.groups);
	}

	const role = new models.RoleGroup(req.body);
	role.level = (userRole.level || 1) + 1;
	await role.save();

	res.sendData({ role });
}

router.getS('/permissions', getPermissions, true);
router.getS('/', getRoleGroup, true);
router.putS('/', addRoleGroup, true);
router.putS('/:id', updateRoleGroup, true);

const activity = {
	ROLE_UPDATE: {
		key: '/{id}',
		exact: true,
		method: 'PUT',
	},
	ROLE_CREATE: {
		key: '/',
		exact: true,
		method: 'PUT',
	},
};

module.exports = { router, activity };
