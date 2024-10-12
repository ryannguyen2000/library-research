const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const { v4: uuid } = require('uuid');

const { md5 } = require('@utils/crypto');
const { hashPassword, generatePassword } = require('@utils/userutils');
const {
	UserRoles,
	PayoutCollectStatus,
	PayoutStates,
	RolePermissons,
	LANGUAGE,
	AutoTemplates,
	AutoEvents,
} = require('@utils/const');
const { Settings } = require('@utils/setting');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const UserSchema = new Schema(
	{
		username: {
			type: String,
			index: true,
			unique: true,
			maxlength: 20,
			minlength: 5,
		},
		no: { type: String },
		password: { type: String, minlength: 5 },
		role: String,
		enable: { type: Boolean, default: true },
		revokeKey: { type: String, default: uuid },
		name: String,
		address: String,
		phone: String,
		city: String,
		paymentCollectLimit: { type: Number },
		allowAdvSalary: Boolean,
		forceAccessCalendar: Boolean,
		managerId: { type: ObjectId, ref: 'User' },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		// departmentIds: [{ type: ObjectId, ref: 'Department' }],
		config: {
			lang: { type: String, enum: _.values(LANGUAGE), default: LANGUAGE.VI },
			chatAutomaticConfigs: [
				{
					autoTemplate: { type: String, enum: _.values(AutoTemplates) },
					autoEvents: [{ type: String, enum: _.values(AutoEvents) }],
				},
			],
		},
		otts: [
			{
				_id: false,
				ottName: String,
				ottId: String,
				ottPhone: String,
				notificationEnable: { type: Boolean, default: true },
			},
		],
		webPassIds: [String],
		lastActive: Date,
		lastLogin: Date,
	},
	{
		timestamps: true,
	}
);

UserSchema.pre('save', async function (next) {
	if (this.isNew) {
		const last = await UserModel.findOne().sort({ no: -1 }).select('no');
		const prefix = 'UA';

		this.no = last && last.no ? `${prefix}${Number(last.no.replace(prefix, '')) + 1}` : `${prefix}100001`;
	}

	next();
});

UserSchema.methods = {
	getOttPhones() {
		return this.model('Ott')
			.find({ groupIds: { $in: this.groupIds }, active: true })
			.select('phone')
			.then(otts => otts.map(o => o.phone));
	},

	async getBlockIds() {
		if (this.role === UserRoles.ADMIN) {
			const blocks = await this.model('Block')
				.find({ groupIds: { $in: this.groupIds } })
				.select('_id');
			return _.map(blocks, '_id');
		}
		const hostBlocks = await this.model('HostBlock').find({ userId: this._id }).select('blockId');
		return _.map(hostBlocks, 'blockId');
	},

	async getPermissions() {
		const role = await this.model('RoleGroup').findOne({ role: this.role }).select('groups');

		const rs = {};

		_.forEach(role && role.groups, g => {
			rs[g.name] = g.methods;
		});

		return rs;
	},

	async hasPermission(permission) {
		const role = await this.model('RoleGroup').findOne({ role: this.role }).select('groups');

		return _.some(role && role.groups, group => group.name === permission || group.name === RolePermissons.ROOT);
	},

	async changePassword(newPassword = generatePassword(), hash = true) {
		this.password = hashPassword(hash ? md5(newPassword) : newPassword);
		this.revokeKey = uuid();
		await this.save();

		return newPassword;
	},

	async isHigherRole(userId, isSame) {
		const targetUser = await UserModel.findById(userId);
		if (!targetUser) return false;

		const RoleGroup = this.model('RoleGroup');
		const currentRole = await RoleGroup.findOne({ role: this.role });
		const targetRole = await RoleGroup.findOne({ role: targetUser.role });

		return isSame ? currentRole.level <= targetRole.level : currentRole.level < targetRole.level;
	},

	getPaymentCollectLimit(date) {
		if (!this.allowAdvSalary) return 0;

		date = date || new Date();
		const limit = this.paymentCollectLimit || Number(Settings.LimitAdvSalary.value);
		return limit * (moment(date).date() / moment(date).daysInMonth());
	},

	getCurrentAdvSalary(date) {
		const startMonth = moment(date).startOf('month').toDate();
		const endMonth = moment(date).endOf('month').toDate();

		return this.model('Payout')
			.aggregate()
			.match({
				collector: this._id,
				paidAt: {
					$gte: startMonth,
					$lte: endMonth,
				},
				collectSAStatus: PayoutCollectStatus.Confirmed,
				state: { $ne: PayoutStates.DELETED },
			})
			.group({
				_id: null,
				amount: { $sum: '$currencyAmount.exchangedAmount' },
			})
			.then(rs => _.get(rs, '[0].amount', 0));
	},

	getDepartments(filter = null) {
		return this.model('Department').find({ ...filter, roles: this.role });
	},
};

UserSchema.statics = {
	async createNewAccount(data, manager) {
		if (data.role) {
			const accessRoles = await this.model('RoleGroup').getUnderRoles({
				roleName: manager.role,
				role: data.role,
				includeMe: false,
			});
			if (!accessRoles.length) {
				data.role = UserRoles.ANONYMOUS;
			}
		}

		data.password = hashPassword(data.password);
		data.role = data.role || UserRoles.ANONYMOUS;
		data.managerId = data.managerId || manager._id;
		data.groupIds = manager.groupIds;

		const user = await this.create(data);

		return user;
	},

	async findByPermission({ permissions, blockId, ottPhone, groupId }) {
		const userFilter = {
			enable: true,
			$or: [
				{
					role: UserRoles.ADMIN,
				},
			],
		};
		const $m1 = {};

		if (permissions) {
			const roles = await this.model('RoleGroup')
				.find({ 'groups.name': { $all: permissions } })
				.select('role');

			$m1.role = { $in: _.map(roles, 'role') };
		}
		if (blockId) {
			const userIds = await this.model('HostBlock')
				.aggregate()
				.match({
					blockId: _.isArray(blockId)
						? { $in: blockId.toMongoObjectIds() }
						: mongoose.Types.ObjectId(blockId),
				})
				.group({
					_id: null,
					ids: { $addToSet: '$userId' },
				})
				.then(rs => _.get(rs, [0, 'ids']) || []);

			$m1._id = { $in: userIds };
		}

		if (!_.isEmpty($m1)) {
			userFilter.$or.push($m1);
		}

		if (groupId) {
			userFilter.groupIds = _.isArray(groupId) ? { $in: groupId } : groupId;
		}

		if (ottPhone) {
			const ott = await this.model('Ott').findOne({ phone: ottPhone, active: true }).select('groupIds');
			userFilter.groupIds = ott && { $in: ott.groupIds };
		}

		const users = await this.find(userFilter)
			.select('_id')
			.then(res => res.map(host => host._id));

		return users;
	},

	findByGroup(groupId) {
		return this.aggregate()
			.match({ enable: true, groupIds: _.isArray(groupId) ? { $in: groupId } : mongoose.Types.ObjectId(groupId) })
			.group({ _id: null, userIds: { $push: '$_id' } })
			.then(rs => _.get(rs, [0, 'userIds'], []));
	},
};

const UserModel = mongoose.model('User', UserSchema, 'user');
module.exports = UserModel;
