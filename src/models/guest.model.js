const mongoose = require('mongoose');
const _ = require('lodash');
const parsePhoneNumber = require('libphonenumber-js');

const {
	OTTs,
	GuestTag,
	LANGUAGE,
	USER_CONTACT_TYPE,
	GUEST_GROUP_KEYS,
	GUEST_GROUP_LAST_TIME,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const { Settings } = require('@utils/setting');
const { getTextScoreMatch } = require('@utils/mongo');
const { normPhone } = require('@utils/phone');
const { removeAccents } = require('@utils/generate');
const { GUEST_LOG_FIELDS } = require('@controllers/guest/const');
const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;

const GuestSchema = new Schema(
	{
		displayName: String,
		taxCode: String,
		represent: String,
		position: String,
		name: String,
		fullName: String,
		searchName: String,
		email: String,
		phone: { type: String, index: true },
		country: String,
		ota: String,
		otaId: String,
		messages: { type: Schema.Types.ObjectId, ref: 'Messages' },
		avatar: String,
		genius: Boolean,
		lang: { type: String, enum: [..._.values(LANGUAGE), null] },
		tags: [String],
		passport: [String],
		passportNumberTime: Date,
		passportNumberAddress: String,
		getPassportType: String, // web, ....
		getPassportTime: Date, // web, ....
		passportNumber: String,
		address: String,
		gender: { type: String, enum: ['male', 'female', 'other', null] },
		dayOfBirth: Date,
		active: { type: Boolean, default: true },
		linkedId: { type: Schema.Types.ObjectId },
		normTargetId: { type: Schema.Types.ObjectId },
		isHost: { type: Boolean },
		userType: { type: String, enum: Object.values(USER_CONTACT_TYPE) },
		ottIds: _.values(OTTs).reduce((acc, cur) => ({ ...acc, [cur]: { type: String, index: true } }), {}),
		otts: [
			{
				_id: false,
				ott: String,
				ottId: String,
				account: String,
			},
		],
		pointInfo: Number,
		addressProvince: String,
		addressDistrict: String,
		addressWard: String,
		hometownProvince: String,
		hometownDistrict: String,
		hometownWard: String,
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
		blockIds: [{ type: Schema.Types.ObjectId, ref: 'Block' }],
		otaIds: [
			{
				_id: false,
				ota: String,
				otaId: String,
			},
		],
		isVip: Boolean,
		histories: [
			{
				description: String,
				images: [String],
				createdAt: Date,
				by: { type: Schema.Types.ObjectId, ref: 'User' },
				removedBy: { type: Schema.Types.ObjectId, ref: 'User' },
			},
		],
		merged: { type: Boolean, default: false },
		logs: [
			{
				createdAt: { type: Date, default: Date.now },
				by: { type: Schema.Types.ObjectId, ref: 'User' },
				field: String,
				oldData: Schema.Types.Mixed,
				newData: Schema.Types.Mixed,
				parsedText: String,
			},
		],
	},
	{
		timestamps: true,
		autoIndex: false,
	}
);

GuestSchema.index({ searchName: 'text' });
GuestSchema.index({ createdAt: -1 });

GuestSchema.pre('save', function (next) {
	if (this.phone) this.phone = normPhone(this.phone);
	if (this.passport) this.passport = _.compact(this.passport);
	if (this.name && !this.fullName) this.fullName = this.name;
	if (this.fullName && !this.name) this.name = _.last(_.split(this.fullName, ' '));
	if (!this.displayName) this.displayName = this.fullName;
	if (this.fullName) {
		this.searchName = removeAccents(this.fullName);
	}
	if (!this.country && this.phone) {
		const parsedPhone = parsePhoneNumber(this.phone);
		if (parsedPhone && parsedPhone.country) {
			this.country = parsedPhone.country;
		}
	}
	if (!this.lang && this.country) {
		this.lang = this.country === Settings.NationalCode.value ? Settings.NationalCode.language : LANGUAGE.EN;
	}

	this.pointInfo = GuestModel.getPointInfo(this);

	this.$locals.modified = {};

	_.uniq([
		...GUEST_GROUP_KEYS,
		'passportNumber',
		'address',
		'tags',
		'phone',
		'fullName',
		`ottIds.${OTTs.ZaloOA}`,
	]).forEach(key => {
		this.$locals.modified[key] = this.isModified(key);
	});

	if (this.isModified(`ottIds`)) {
		_.forEach(this.ottIds, (ottId, ott) => {
			this.otts = this.otts || [];
			if (ottId && !this.otts.find(o => o.ott === ott && o.ottId === ottId)) {
				this.otts.push({ ottId, ott });
			}
		});
	}

	this.$locals.isNew = this.isNew;
	if (!this.isNew) {
		this.addLogs();
	}

	next();
});

GuestSchema.post('save', function (doc) {
	if (doc.$locals.modified.passportNumber || doc.$locals.modified.address) {
		doc.autoTag();
	}

	if (doc.$locals.modified.tags) {
		doc.tags.forEach(tag => {
			mongoose
				.model('GuestTag')
				.create({ name: tag })
				.catch(() => {});
		});
	}

	if (
		(doc.phone && doc.$locals.modified.phone) ||
		(_.get(doc.ottIds, OTTs.ZaloOA) && doc.$locals.modified[`ottIds.${OTTs.ZaloOA}`])
	) {
		mongoose.model('Stringee').updateCallLogBookingIds({
			phone: doc.phone,
			zaloId: _.get(doc.ottIds, OTTs.ZaloOA),
			guestId: doc._id,
		});
	}

	if (!doc.$locals.isNew && (doc.$locals.modified.fullName || doc.$locals.modified.phone)) {
		mongoose.model('BlockInbox').updateKeyword({ guestId: doc._id });
	}

	if (doc.createdAt < GUEST_GROUP_LAST_TIME) {
		GUEST_GROUP_KEYS.forEach(key => {
			if (doc.$locals.modified[key]) {
				const currentValue = _.get(doc, key);
				const preValue = _.get(doc.$locals, ['oldData', key]);

				if (currentValue) {
					mongoose.model('GuestGroup').syncGroup(key, currentValue);
				}
				if (preValue && preValue !== currentValue) {
					mongoose.model('GuestGroup').syncGroup(key, preValue);
				}
			}
		});
	}
});

GuestSchema.methods = {
	async autoTag() {
		try {
			let tag;
			let adressObj;

			if (this.country && this.country !== Settings.NationalCode.value) {
				tag = GuestTag.International;
			}
			if (this.passportNumber) {
				const CSVModel = this.model('CSV');
				const detectedData = await CSVModel.findByPassport(this.passportNumber);
				if (detectedData) {
					adressObj = _.pickBy(detectedData.detectAddress(detectedData));
					if (adressObj.addressProvince) {
						// HCM
						tag = adressObj.addressProvince === '79' ? GuestTag.Local : GuestTag.Traveller;
					}
				}
			}

			if (tag || !_.isEmpty(adressObj)) {
				await GuestModel.updateOne(
					{ _id: this._id },
					_.pickBy({ $addToSet: tag && { tags: tag }, $set: adressObj })
				);
			}
		} catch (e) {
			logger.error(e);
		}
	},
	addLogs() {
		if (!this.$locals.oldData) return;

		const by = this.$locals.updatedBy;
		this.logs = this.logs || [];

		GUEST_LOG_FIELDS.forEach(field => {
			if (this.isModified(field)) {
				const newData = _.get(this, field);
				if (newData === undefined) return;

				const oldData = _.get(this.$locals, `oldData.${field}`);
				this.logs.push({
					by,
					field,
					oldData,
					newData,
				});
			}
		});
	},
};

GuestSchema.statics = {
	/**
	 * Find or create new guest
	 * @param {Object} data
	 */
	async findGuest(data, isUpdate, isFromOTA) {
		if (data.fullName) data.fullName = data.fullName.normalize().trim();
		if (data.name) data.name = data.name.normalize().trim();

		let guest;

		if (data.otaId) {
			const query = {
				active: true,
				ota: data.ota,
				otaId: data.otaId,
				// $or: [
				// 	{
				// 		ota: data.ota,
				// 		otaId: data.otaId,
				// 	},
				// 	{
				// 		'otaIds.ota': data.ota,
				// 		'otaIds.otaId': data.otaId,
				// 	},
				// ],
			};
			guest = await this.findOne(query).sort({ pointInfo: -1 });
		}
		if (!guest) {
			guest = new this(data);
			if (data.otaId) {
				guest.otaIds = guest.otaIds || [];
				guest.otaIds.push({
					ota: data.ota,
					otaId: data.otaId,
				});
			}
		}

		const copy = _.omit(data, ['_id', 'messages']);
		if (isUpdate) {
			Object.assign(guest, copy);
		} else {
			Object.assign(
				guest,
				_.pickBy(copy, (v, k) => !guest[k])
			);
			if (isFromOTA && data.fullName) {
				guest.displayName = data.fullName;
			}
		}

		await guest.save();
		return guest;
	},

	getPointInfo(guest) {
		let point = 0;
		if (guest.phone) point++;
		if (guest.passport) point += Math.min(guest.passport.length, 2);
		if (guest.passportNumber) point++;
		if (guest.email) point++;
		if (guest.dayOfBirth) point++;
		if (guest.tags) point += Math.min(guest.tags.length, 2);
		if (guest.address) point++;
		if (guest.gender) point++;
		if (guest.country) point++;
		if (guest.ottIds) point += _.keys(guest.ottIds).length;

		return point;
	},

	findWithPhoneNumber(groupIds, phone, isMulti) {
		const nphone = normPhone(phone);

		return this[isMulti ? 'find' : 'findOne'](
			_.pickBy({
				active: true,
				groupIds: groupIds && _.isArray(groupIds) ? { $in: groupIds } : groupIds,
				$or: _.compact([
					nphone && { phone: nphone },
					..._.values(OTTs).map(ott => ({ [`ottIds.${ott}`]: phone })),
				]),
			})
		)
			.select('name fullName messages phone ottIds avatar userType')
			.sort({ createdAt: -1 });
	},

	findByKeyword(keyword, user) {
		const phone = normPhone(keyword);
		const text = removeAccents(keyword);
		const filter = phone
			? { phone }
			: {
					$text: { $search: text },
			  };

		if (user) {
			filter.groupIds = { $in: user.groupIds };
		}

		const pipeline = this.aggregate().match(filter);

		if (phone) {
			pipeline.project({ _id: 1 }).limit(200);
		} else {
			pipeline
				.project({
					_id: 1,
					score: { $meta: 'textScore' },
				})
				.match({
					score: { $gte: getTextScoreMatch(text) },
				})
				.limit(200);
		}

		return pipeline;
	},

	getHistories(guestId) {
		return this.findById(guestId)
			.select('histories')
			.populate('histories.by', 'username name role')
			.populate('histories.removedBy', 'username name role');
	},

	async addHistory(guestId, userId, description, images = null) {
		if (!description && !images) {
			throw new ThrowReturn('Content must not be empty');
		}

		await this.updateOne(
			{ _id: guestId },
			{
				$push: {
					histories: {
						by: userId,
						description,
						images,
						createdAt: new Date(),
					},
				},
			},
			{
				new: true,
			}
		);
		return this.getHistories(guestId);
	},

	async updateHistory(userId, guestId, id, data) {
		const guest = await this.findById(guestId);
		if (guest) {
			const history = guest.histories.find(h => h._id.toString() === id);
			if (history) {
				if (history.by && history.by.toString() !== userId.toString()) {
					throw new ThrowReturn('You do not have permission to change this resources');
				}

				Object.keys(data).forEach(k => {
					history[k] = data[k];
				});
				await this.updateOne({ _id: guestId }, { histories: guest.histories });
			}
		}
		return await this.getHistories(guestId);
	},

	async removedHistory(userId, guestId, id) {
		const guest = await this.findById(guestId);
		if (guest) {
			const history = guest.histories.find(h => h._id.toString() === id);
			if (history) {
				if (history.by && history.by.toString() !== userId.toString()) {
					throw new ThrowReturn('You do not have permission to change this resources');
				}
				await this.updateOne(
					{ _id: guestId },
					{
						histories: guest.histories.filter(h => h._id.toString() !== history._id.toString()),
					}
				);
			}
		}
		return await this.getHistories(guestId);
	},
};

const GuestModel = mongoose.model('Guest', GuestSchema, 'guest');

module.exports = GuestModel;
