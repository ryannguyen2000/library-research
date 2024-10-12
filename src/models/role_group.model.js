const mongoose = require('mongoose');
const _ = require('lodash');

// const ThrowReturn = require('@core/throwreturn');
const { UserRoles, RolePermissons } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const Actions = ['allow', 'deny'];
const Methods = ['POST', 'GET', 'PUT', 'DELETE', '*'];

const RoleGroupSchema = new Schema(
	{
		role: { type: String, unique: true, index: true },
		groups: [
			{
				name: String,
				methods: [{ type: String, require: true, enum: Methods }],
				action: { type: String, enum: Actions },
			},
		],
		level: { type: Number, default: 1 },
		tabs: [String], // UI Tabs
		tasks: [{ type: ObjectId, ref: 'Task' }],
		public: Boolean,
		isMaid: Boolean,
		description: String,
		departmentIds: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
	},
	{
		timestamps: true,
	}
);

// RoleGroupSchema.pre('save', async function (next) {
// 	if (this.groups && this.isModified('groups')) {
// 		const notAccessPermissions = await mongoose.model('RolePermissions').find({ sys: true }).select('name');
// 		const accessPNames = notAccessPermissions.map(p => p.name);
// 		if (this.groups.some(group => accessPNames.includes(group.name))) {
// 			throw new ThrowReturn().status(403);
// 		}
// 	}

// 	next();
// });

RoleGroupSchema.methods = {
	getGroup(name) {
		for (const group of this.groups) {
			if (group.name === name) return group.toObject();
		}
		return {};
	},

	isAdmin() {
		return this.groups.some(g => g.name === RolePermissons.ROOT);
	},
};

RoleGroupSchema.statics = {
	async getRole(role) {
		const result = await this.findOne({ role });
		const policies = [];
		if (result) {
			const permissions = await this.model('RolePermissions').find({
				name: result.groups.map(g => g.name),
			});

			permissions.forEach(permission => {
				permission.permissions = permission.permissions.map(p => {
					p = p.toObject();
					const group = result.getGroup(permission.name);
					p.methods = group.methods && group.methods.length > 0 ? group.methods : p.methods;
					p.action = group.action || p.action;
					return p;
				});
				policies.push(...permission.permissions);
			});
		}
		return policies;
	},

	async getUnderRoles({ roleName, includeMe = true, minimize = true, ...filter }) {
		const role = await this.findOne({ role: roleName });
		if (!role) return [];

		_.set(filter, ['level', includeMe ? '$gte' : '$gt'], role.level);

		if (minimize) {
			return this.find(filter)
				.sort({ level: 1 })
				.select('role')
				.then(res => res.map(v => v.role));
		}

		return this.find(filter).sort({ level: 1 });
	},

	async getRoles(roleName, levelType = '$gte') {
		const role = await this.findOne({ role: roleName });
		if (!role) return [];

		const query = { level: { [levelType]: role.level } };
		return this.find(query)
			.sort({ level: 1 })
			.select('role')
			.then(res => res.map(v => v.role));
	},

	async checkPermission(roleName, permissionName) {
		const rs = { exists: false };
		if (roleName === UserRoles.ADMIN) {
			rs.exists = permissionName !== RolePermissons.INBOX_UNKNOWN_HIDDEN;
			rs.write = true;
			rs.read = true;
			return rs;
		}
		const role = await this.findOne({ role: roleName, 'groups.name': permissionName });
		if (!role) return rs;
		rs.exists = true;
		const permission = role.groups.find(g => g.name === permissionName);
		if (permission) {
			if (permission.methods.includes('*')) {
				rs.write = true;
				rs.read = true;
			} else if (permission.methods.includes('GET')) rs.read = true;
		}
		return rs;
	},
};

module.exports = mongoose.model('RoleGroup', RoleGroupSchema, 'role_group');
