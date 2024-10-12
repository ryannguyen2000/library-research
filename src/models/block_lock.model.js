const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

const { DOOR_LOCK_TYPE, DOOR_LOCK_POS_TYPE, DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const LockConfigSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block', required: true },
		// roomId: { type: ObjectId, ref: 'Room' },
		createdBy: { type: ObjectId, ref: 'User' },
		posType: { type: String, enum: Object.values(DOOR_LOCK_POS_TYPE), required: true },
		lockType: { type: String, enum: Object.values(DOOR_LOCK_TYPE), required: true },
		name: String,
		// webpass setting
		url: String,
		username: String,
		password: String,
		error: { type: Boolean, default: false },
		active: { type: Boolean, default: true },
		ignoreCheckin: { type: Boolean, default: false },
		// tuya setting
		deviceId: String,
		tuyaHomeId: String,
		temporaryPasswordCreationLimit: {
			type: Number,
			default: DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT,
			required: true,
		},
		temporaryPasswordLengthRequirement: { type: Number, default: 6 }, // webpass: 6 digits. tuya: bluetooth: 6 digits, zigbee: 6 digits, wifi - 7 digits.
		temporaryPasswords: [
			{
				roomIds: [{ type: ObjectId, ref: 'Room' }],
				name: String,
				passwordId: String,
				effectiveTime: Number,
				invalidTime: Number,
				code: String,
			},
		],
	},
	{
		timestamps: true,
	}
);

LockConfigSchema.methods = {
	getPassword(passwordId) {
		return this.temporaryPasswords.find(pwd => pwd.passwordId === passwordId);
	},

	removePassword(passwordId) {
		this.temporaryPasswords = this.temporaryPasswords.filter(pwd => pwd !== passwordId);
		return this.save();
	},

	async updatePassword(passwordId, data) {
		const password = this.getPassword(passwordId);
		const prevCode = password.code;
		const isCodeUpdate = _.get(data, 'code', password.code) !== password.code;

		Object.assign(password, _.pick(data, ['code', 'name', 'effectiveTime', 'invalidTime']));

		const isAddRoomId = data.roomId
			? !password.roomIds.find(roomId => roomId.toString() === data.roomId.toString())
			: false;

		if (isAddRoomId) password.roomIds.push(data.roomId);
		const pwdInUsed = _.get(password, 'roomIds.length', 0);

		if (isCodeUpdate && pwdInUsed) {
			await this.syncCode(
				{ passwordId, roomIds: password.roomIds },
				{ passwordId, code: password.code, prevCode }
			);
		}

		return this.save();
	},

	async resolveInvalidPasswordId(passwordId, invalidPassword) {
		const password = this.getPassword(passwordId);
		const roomIds = _.get(invalidPassword, 'roomIds', []);
		Object.assign(password, { roomIds, code: invalidPassword.code });

		await this.syncCode({ passwordId: invalidPassword.passwordId, roomIds }, { passwordId: password.passwordId });
	},

	getPasswordInPool(avoidPwds = [], code) {
		const temporaryPasswords = _.filter(this.temporaryPasswords, pwd => !avoidPwds.includes(pwd.passwordId));

		if (code) {
			const pwd = temporaryPasswords.find(_pwd => _pwd.code === code);
			if (pwd) return pwd;
		}

		const lessUsePwd = temporaryPasswords.reduce((result, pwd) => {
			const curRoomLength = _.get(result, 'roomIds.length', 0);
			const pwdRoomLength = _.get(pwd, 'roomIds.length', 0);
			if (curRoomLength > pwdRoomLength) result = pwd;

			return result;
		}, temporaryPasswords[0]);
		return lessUsePwd;
	},

	async checkBeAbleToResetCode(passwordId, date) {
		const password = this.temporaryPasswords.find(pwd => pwd.passwordId === passwordId);
		if (!password) return false;
		if (_.get(password, 'roomIds.length', 0) < 2) return true;

		const now = moment().startOf('days').set('hours', 7);

		const reservationQuantity = await this.model('Reservation')
			.find({
				roomId: password.roomIds,
				'dates.date': date || now.toISOString(),
				doorCodeDisabled: { $ne: true },
				doorCodeGenerated: true,
			})
			.countDocuments();

		const passwordIsInUse = !!reservationQuantity;
		return !passwordIsInUse;
	},

	pullRoomIdOnPassword(passwordId, roomId) {
		const tempPwd = this.getPassword(passwordId);
		if (!tempPwd) return;

		const roomIds = _.get(tempPwd, 'roomIds', []);
		tempPwd.roomIds = roomIds.filter(_roomId => _roomId.toString() !== roomId.toString());
		return this.save();
	},

	pushRoomIdtoPassword(passwordId, roomId) {
		const tempPwd = this.getPassword(passwordId);
		if (!tempPwd) return;

		const isAddRoomId = roomId ? !tempPwd.roomIds.find(_roomId => _roomId.toString() === roomId.toString()) : false;
		if (isAddRoomId) tempPwd.roomIds.push(roomId);
		return this.save();
	},

	syncCode(filter, data) {
		if (!_.get(filter, 'roomIds.length', 0)) return;

		const { passwordId, code = '', prevCode = '' } = data;
		const $set = _.pickBy({
			'lock.$[elem].code': code,
			'lock.$[elem].prevCode': prevCode,
			'lock.$[elem].passId': passwordId,
		});

		return this.model('Room').updateMany(
			{ _id: filter.roomIds, 'lock.lockId': this._id },
			{ $set },
			{ arrayFilters: [{ 'elem.lockId': this._id, 'elem.passId': filter.passwordId }], upsert: true }
		);
	},

	isCodeValid(code) {
		const codeLength = _.get(code, 'length', 0);
		if (!codeLength) return false;
		if (this.lockType === DOOR_LOCK_TYPE.TUYA) return codeLength === this.temporaryPasswordLengthRequirement;
		return codeLength >= 4 && codeLength <= 8;
	},
};

module.exports = mongoose.model('BlockLock', LockConfigSchema, 'block_lock');
