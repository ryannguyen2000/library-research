const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const { StringeeType, StringeeStatus, InboxType } = require('@utils/const');
const { logger } = require('@utils/logger');
const { normPhone } = require('@utils/phone');
const { newCSEventEmitter, NEWCS_EVENTS } = require('@utils/events');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const SMSSchema = new Schema(
	{
		account: String,
		phone: String,
		mid: String,
		type: { type: String, enum: Object.values(StringeeType), default: StringeeType.Stringee },
		status: { type: String, enum: Object.values(StringeeStatus) },
		read: { type: Boolean, default: false },
		data: Mixed,
		otaBookingId: String,
		otaName: String,
		blockId: { type: ObjectId, ref: 'Block' },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
	},
	{
		timestamps: true,
		autoIndex: false,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

SMSSchema.index({ 'data.id': 1 }, { unique: true });
SMSSchema.index({ 'data.created': -1 });

function mapSMStoStringee(account, phone, msg) {
	const time = moment(msg.date);
	const timeStr = time.format('YYYY/MM/DD, HH:mm:ss');
	return {
		answer_time: 0,
		stop_time: 0,
		callee: account,
		first_answer_time: 0,
		to_alias: account,
		uuid: msg._id,
		answer_duration: 0,
		from_internal: 0,
		number_tts_character: 83,
		project_id: 3425,
		from_number: phone,
		id: msg._id,
		day: time.format('YYYY_MM_DD'),
		to_internal: 1,
		participants: `${account};${account};`,
		to_number: account,
		amount: 0,
		object_type: 'call_log',
		created: Math.round(msg.date / 1000),
		video_call: 0,
		recorded: 0,
		start_time: msg.date,
		account_id: 3258,
		from_alias: phone,
		answer_duration_minutes: 1,
		start_time_datetime: timeStr,
		answer_time_datetime: 0,
		stop_time_datetime: 0,
		created_datetime: timeStr,
		project_name: 'Cozrum SMS',
		from_user_id: null,
	};
}

SMSSchema.virtual('bookingIds', {
	ref: 'Booking',
	localField: 'otaBookingId',
	foreignField: 'otaBookingId',
});

SMSSchema.pre('save', function (next) {
	if (!this.status && this.data.answer_time !== undefined && this.data.from_internal !== undefined) {
		if (this.isMissCall() && !this.isCallout()) this.status = StringeeStatus.MISSED;
		else {
			this.status = this.isCallout() ? StringeeStatus.CALL_OUT : StringeeStatus.CALL_IN;
		}
	}

	this.$locals.isNew = this.isNew;

	next();
});

SMSSchema.post('save', function (doc) {
	if (doc.otaBookingId && doc.data.start_time && !doc.$locals.skipNewCallEvent) {
		newCSEventEmitter.emit(NEWCS_EVENTS.NEW_CALL, doc);
	}

	if (!doc.$locals.skipNewCallEvent && !this.isMissCall()) {
		CallLog.updateMany(
			{
				status: StringeeStatus.MISSED,
				phone: doc.phone,
				'data.created': { $lt: doc.data.created },
			},
			{
				status: doc.isCallout() ? 'CALL_OUT' : 'CALL_IN',
			}
		).catch(e => {
			logger.error(e);
		});
	}

	if (this.$locals.isNew) {
		const isCallout = doc.isCallout();

		const userId = isCallout ? doc.data.from_user_id : doc.data.to_number;

		mongoose
			.model('CallUser')
			.findOne({
				stringee_user_id: userId,
			})
			.then(callUser => {
				return mongoose.model('OTTMessage').updateOne(
					{
						ottName: 'stringee',
						messageId: doc.mid,
					},
					{
						sender: doc.account,
						toId: doc.phone,
						time: new Date(doc.data.start_time),
						fromMe: isCallout,
						event: InboxType.CALLING,
						user: callUser && callUser.userId ? _.toString(callUser.userId) : undefined,
					},
					{
						upsert: true,
					}
				);
			})
			.catch(e => {
				logger.error(e);
			});
	}
});

SMSSchema.methods = {
	isMissCall() {
		return !!this.data && !this.data.answer_time;
	},

	isCallout() {
		return !!this.data && this.data.from_internal === 1;
	},
};

SMSSchema.statics = {
	checkSMSIsMissedCall(smsData) {
		if (!smsData) {
			throw new Error('SMS Data null');
		}
		if (typeof smsData.body !== 'string') {
			throw new Error('SMS Data body null');
		}

		return !!smsData.body.match(new RegExp('Cozrum hotline changed. Please call', 'i'));
	},

	async updateCallLogBookingIds({ phone, zaloId, guestId }) {
		const filter = {
			phone: { $in: _.compact([phone && phone.replace(/\+/g, ''), zaloId]) },
			'data.created': { $gte: _.round(moment().add(-24, 'hour').valueOf() / 1000) },
			'data.start_time': { $ne: null },
			otaBookingId: null,
		};
		const docs = await this.find(filter);
		if (docs.length) {
			const time = _.get(_.minBy(docs, 'data.start_time'), 'data.start_time');
			const date = new Date(time).zeroHours();

			const bookings = await this.model('Booking').findBestMatchBookings({
				match: {
					$or: [
						{
							guestId,
						},
						{
							guestIds: guestId,
						},
					],
				},
				project: 'otaBookingId otaName lastTimeCalled blockId groupIds',
				date,
				limit: 1,
			});
			if (bookings && bookings[0]) {
				const dataUpdate = {
					otaBookingId: bookings[0].otaBookingId,
					otaName: bookings[0].otaName,
					blockId: bookings[0].blockId,
					groupIds: bookings[0].groupIds,
				};
				await this.updateMany({ _id: { $in: _.map(docs, '_id') } }, dataUpdate);

				const lastTimeCalled = _.max(bookings.map(b => b.lastTimeCalled));
				const maxTimeLog = _.maxBy(docs, 'data.start_time');
				if (!lastTimeCalled || maxTimeLog.data.start_time > new Date(lastTimeCalled).valueOf()) {
					_.assign(maxTimeLog, dataUpdate);
					newCSEventEmitter.emit(NEWCS_EVENTS.NEW_CALL, maxTimeLog);
				}
			}
		}
	},

	async createLog(account, phone, data, type = StringeeType.Stringee) {
		if (type === StringeeType.SMS) {
			data = mapSMStoStringee(account, phone, data);
		}

		const mid = data.id || data._id;

		let doc = await this.findOne({ 'data.id': mid });
		if (doc && doc.data && doc.data.project_id) {
			return [doc, false];
		}

		doc = doc || new this();
		Object.assign(doc, { account, phone: normPhone(phone, false), mid, data, type });

		if (!doc.otaBookingId) {
			let groupIds;

			const project = await this.model('CallProject')
				.findOne({ stringeeProjectId: data.project_id })
				.select('groupIds phoneList');

			if (project) {
				const currentPhone = project.phoneList.find(p => p.groupId && p.number.includes(account));
				groupIds = currentPhone ? [currentPhone.groupId] : project.groupIds;
			}

			const guests = await this.model('Guest').findWithPhoneNumber(groupIds, phone, true);
			if (guests.length) {
				const guestIds = guests.map(g => g._id);

				const bookings = await this.model('Booking').findBestMatchBookings({
					match: {
						$or: [
							{
								guestId: { $in: guestIds },
							},
							{
								guestIds: { $in: guestIds },
							},
						],
					},
					project: 'otaBookingId otaName blockId groupIds',
					date: new Date(data.start_time),
					limit: 1,
				});
				if (bookings && bookings[0]) {
					doc.otaBookingId = bookings[0].otaBookingId;
					doc.otaName = bookings[0].otaName;
					doc.blockId = bookings[0].blockId;
					doc.groupIds = bookings[0].groupIds;
				}
			}
		}

		if (!doc.groupIds || !doc.groupIds.length) {
			const project = await this.model('CallProject')
				.findOne({ stringeeProjectId: data.project_id })
				.select('groupIds phoneList');

			let groupId;

			if (project) {
				const currentPhone = project.phoneList.find(p => p.groupId && p.number.includes(account));
				if (currentPhone) {
					groupId = currentPhone.groupId;
				}
			}
			if (!groupId) {
				const group = await this.model('UserGroup').findOne({ primary: true });
				groupId = group._id;
			}
			if (groupId) {
				doc.groupIds = [groupId];
			}
		}

		await doc.save();

		return [doc, true];
	},

	parseDoc(doc) {
		if (!doc) return null;
		return {
			...doc.data,
			_id: doc._id,
			phoneNumber: doc.phone,
			status: doc.status,
			otaBookingId: doc.otaBookingId,
			createdAt: doc.createdAt,
			bookingIds: doc.bookingIds,
		};
	},
};

const CallLog = mongoose.model('Stringee', SMSSchema, 'stringee');

module.exports = CallLog;
