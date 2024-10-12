const mongoose = require('mongoose');
const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { removeAccents } = require('@utils/generate');
const { DOOR_LOCK_CODE_TYPE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const RoomSchema = new Schema(
	{
		info: {
			name: String,
			nameLT: String, // tên loại phòng khi bán dài hạn
			price: Number,
			images: [String],
			specifications: Mixed,
			description: String,
			roomNo: String,
			sRoomNo: [String],
			amenities: [String],
			wifi: String,
			wifiPassword: String,
			layoutBg: String,
			layoutBgLT: String,
		},
		lock: [
			{
				_id: false,
				no: Number,
				userID: String,
				cardNo: String,
				code: String,
				prevCode: String,
				type: { enum: Object.values(DOOR_LOCK_CODE_TYPE), type: Number, required: true }, // 0: forever, 1: OTP
				// tuya
				lockId: { type: ObjectId, ref: 'BlockLock', required: true },
				passId: { type: String },
				passName: { type: String },
				expireTime: Date,
				//
				// url: String,
				// username: String,
				// password: String,
				// error: Boolean,
			},
		],
		roomLock: {
			deviceId: String,
			password: String,
			expiredAt: Number,
		},
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		blockId: { type: ObjectId, ref: 'Block' },
		parentRoomId: { type: ObjectId, ref: 'Room' },
		active: { type: Boolean, default: true },
		virtual: { type: Boolean, default: false },
		newGuide: [
			{
				_id: false,
				name: String,
				vi: [String],
				en: [String],
				images: [String],
			},
		],
		workPoint: { type: Number, default: 1 },
		roomPoint: { type: Number, default: 1 },
		order: Number,
		view: { type: Number },
		isSelling: { type: Boolean, default: true },
		isOperating: { type: Boolean, default: true },
		isGroundRent: { type: Boolean, default: false },
		relationRoomIds: Mixed,
		manageFee: {
			longTerm: { type: Number },
			shortTerm: { type: Number },
			hasTax: { type: Boolean },
			hasVAT: { type: Boolean },
			reportType: { type: String },
			includeVAT: { type: Boolean },
		},
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
		id: false,
	}
);

RoomSchema.virtual('roomType').get(function () {
	return this.info.name;
});

RoomSchema.virtual('roomTypeLT').get(function () {
	return this.info.nameLT;
});

RoomSchema.pre('save', async function (next) {
	if (this._id.equals(this.parentRoomId)) {
		throw new ThrowReturn('Parent room ID invalid!');
	}

	this.$locals.isModifiedName = this.isModified('info.name');
	this.$locals.isModifiedRoomPoint = this.isModified('roomPoint');

	// if (this.$locals.isModifiedName) {
	// 	const sameTypeRoom = await RoomModel.findOne({
	// 		_id: { $ne: this._id },
	// 		blockId: this.blockId,
	// 		'info.name': this.info.name,
	// 	})
	// 		.select('info roomPoint')
	// 		.lean();
	// 	if (sameTypeRoom) {
	// 		if (sameTypeRoom.roomPoint) this.roomPoint = sameTypeRoom.roomPoint;
	// 		if (sameTypeRoom.info.layoutBg) this.info.layoutBg = sameTypeRoom.info.layoutBg;
	// 		if (sameTypeRoom.info.layoutBgLT) this.info.layoutBgLT = sameTypeRoom.info.layoutBgLT;
	// 	}
	// }

	this.$locals.isModifiedParent = this.isModified('parentRoomId');

	next();
});

const CacheRelations = {};

RoomSchema.pre('save', function (next) {
	if (this.info.roomNo) {
		this.info.sRoomNo = this.info.sRoomNo || [];
		this.info.sRoomNo[0] = removeAccents(this.info.roomNo).replace(/[^0-9|^a-z|^A-Z]/g, '');
	}

	if (this.$locals.isModifiedName || this.$locals.isModifiedRoomPoint) {
		mongoose
			.model('RoomTypeGroup')
			.syncDefaultRoomType({ blockId: this.blockId })
			.catch(e => {
				logger.error('syncDefaultRoomType', e);
			});
	}

	next();
});

RoomSchema.post('save', function (doc) {
	if (doc.$locals.isModifiedParent) {
		RoomModel.find({
			blockId: doc.blockId,
			virtual: false,
		})
			.select('_id')
			.then(rooms => {
				rooms.forEach(room => {
					delete CacheRelations[room._id];
				});
			})
			.catch(e => {
				logger.error(e);
			});

		RoomModel.updateMany(
			{
				blockId: doc.blockId,
				virtual: false,
			},
			{ $unset: { relationRoomIds: 1 } }
		).catch(e => {
			logger.error(e);
		});
	}
});

RoomSchema.methods = {
	async getAscendants() {
		if (!this.parentRoomId || this._id.equals(this.parentRoomId)) return [];

		const room = await RoomModel.findOne({ _id: this.parentRoomId, virtual: false }).select('parentRoomId');
		if (!room) return [];

		const roomIds = await room.getAscendants();
		return [this.parentRoomId, ...roomIds];
	},

	async getDescendants() {
		if (!this.roomIds || !this.roomIds.length) return [];

		const rooms = await RoomModel.find({ _id: { $in: this.roomIds, $ne: this._id } }).select('roomIds');
		const ret = [...this.roomIds];

		const descendants = await rooms.asyncMap(room => room.getDescendants());
		ret.push(..._.flatten(descendants));

		return ret;
	},

	async getRelations() {
		const [ascen, descen] = await Promise.all([this.getAscendants(), this.getDescendants()]);

		return [...ascen, this._id, ...descen];
	},
};

RoomSchema.statics = {
	async getRelationsRooms(roomId, toObject) {
		if (!CacheRelations[roomId]) {
			const room = await this.findById(roomId).select('_id parentRoomId roomIds relationRoomIds');
			if (!room) return [];

			if (!room.relationRoomIds) {
				room.relationRoomIds = await room.getRelations();
				room.save().catch(e => {
					logger.error(e);
				});
			}

			CacheRelations[roomId] = room.relationRoomIds;
		}

		return toObject ? _.mapKeys(CacheRelations[roomId]) : CacheRelations[roomId];
	},

	async getRoomTypes(blockId, filter = null) {
		const rooms = await this.aggregate([
			{ $match: { blockId: mongoose.Types.ObjectId(blockId), virtual: false, ...filter } },
			{ $group: { _id: '$info.name', roomIds: { $push: '$_id' } } },
		]);

		const rs = {};
		_.forEach(rooms, r => {
			rs[r._id] = r.roomIds;
		});

		return rs;
	},

	getRoomNos(roomId) {
		if (!roomId || (_.isArray(roomId) && !roomId.length)) return '';

		return this.find({ _id: roomId })
			.select('info.roomNo')
			.then(res => res.map(r => r.info.roomNo).join(','));
	},

	getTotalRooms(filter) {
		return this.countDocuments({
			...filter,
			isSelling: true,
			virtual: false,
			'roomIds.0': { $exists: false },
		});
	},
};

const RoomModel = mongoose.model('Room', RoomSchema, 'room');

module.exports = RoomModel;
