const _ = require('lodash');
const mongoose = require('mongoose');
const {
	MessageStatus,
	Attitude,
	MessageGroupEvent,
	MessageGroupType,
	MessageGroupInternalType,
	USER_CONTACT_TYPE,
	InboxType,
	MessageUser,
} = require('@utils/const');
const { logger } = require('@utils/logger');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const MessagesSchema = new Schema(
	{
		otaName: { type: String, index: true },
		otaListingId: { type: String, index: true },
		otaBookingId: { type: String, index: true },
		threadId: { type: String, index: true },
		inquiry: { type: Boolean, default: false },
		declined: { type: Boolean, default: false },
		approved: { type: Boolean, default: false },
		inquiryPostId: String,
		inquiryDetails: Mixed,
		isGroup: Boolean,
		isUser: Boolean,
		userType: { type: String, enum: Object.values(USER_CONTACT_TYPE), default: USER_CONTACT_TYPE.GUEST },
		groupType: { type: String, enum: _.values(MessageGroupType) },
		internalGroupType: { type: String, enum: _.values(MessageGroupInternalType) },
		departmentId: { type: ObjectId, ref: 'Department' },
		guestId: { type: ObjectId, ref: 'Guest' },
		guestIds: [{ type: ObjectId, ref: 'Guest' }],
		blockId: { type: ObjectId, ref: 'Block' },
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		hostId: { type: ObjectId, ref: 'Guest' },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		autoMessages: [{ type: String, enum: _.values(MessageGroupEvent) }],
		attitude: { type: String, enum: [...Attitude, null], default: Attitude[1] },
		other: Mixed,
		account: String,
		withdrawn: Boolean,
		taskNotification: Boolean,
		taskCategoryIds: [{ type: ObjectId, ref: 'TaskCategory' }],
		notification: Boolean,
		messages: [
			{
				user: String, // 'me' or 'guest'
				time: Date,
				fromMe: Boolean,
				message: String,
				image_attachment_url: [String],
				reply: [Mixed],
				status: {
					type: String,
					default: MessageStatus.NONE,
					enum: _.values(MessageStatus),
				},
				messageId: String,
			},
		],
		request: [
			{
				requestId: String,
				from: Date,
				to: Date,
				guests: Number,
				price: Number,
				status: Number,
				description: String,
			},
		],
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
		versionKey: false,
		autoIndex: false,
	}
);

MessagesSchema.virtual('status').get(function () {
	if (this.declined) {
		return 'declined';
	}
	if (this.inquiry) {
		return 'inquiry';
	}
	if (this.approved) {
		return 'approved';
	}
	if (this.otaBookingId) {
		return 'confirmed';
	}
	return '';
});

MessagesSchema.virtual('inbox', {
	ref: 'BlockInbox',
	localField: '_id',
	foreignField: 'messageId',
	justOne: true,
});

MessagesSchema.pre('save', function (next) {
	this.$locals.isModifiedAttitude = this.isModified('attitude');
	this.$locals.isModifiedInquiry = this.isModified('inquiry');

	if (this.isModified('messages')) {
		this.$locals.isModifiedMsg = true;
		this.messages.sort((m1, m2) => m2.time.getTime() - m1.time.getTime());
	}

	this.$locals.isNew = this.isNew;

	next();
});

MessagesSchema.post('save', function (doc) {
	const inboxData = {};

	if (doc.$locals.isModifiedAttitude) {
		inboxData.attitude = doc.attitude;
	}
	if (doc.$locals.isModifiedInquiry) {
		inboxData.inquiry = doc.inquiry;
	}
	if (doc.$locals.isModifiedMsg) {
		inboxData.reply = _.some(doc.messages, msg => msg.status === MessageStatus.REQUEST);

		MessageModel.updateMany(
			{ _id: { $ne: doc._id }, threadId: doc.threadId },
			{ $set: { messages: doc.messages } }
		).catch(e => {
			logger.error(e);
		});

		const ottMsgBulks = _.reverse(doc.messages).map((m, i) => ({
			updateOne: {
				filter: {
					ottName: doc.otaName,
					otaBookingId: doc.otaBookingId,
					messageId: m.messageId || `${doc.otaBookingId}_${i}`,
				},
				update: {
					time: m.time,
					user: m.user,
					otaName: doc.otaName,
					event: InboxType.MESSAGE,
					fromMe: m.user !== MessageUser.GUEST,
				},
				upsert: true,
			},
		}));

		if (ottMsgBulks.length) {
			mongoose
				.model('OTTMessage')
				.bulkWrite(ottMsgBulks)
				.catch(e => {
					logger.error(e);
				});
		}
	}

	if (!_.isEmpty(inboxData)) {
		mongoose
			.model('BlockInbox')
			.updateMany(
				{ messageId: doc._id },
				{
					$set: inboxData,
				}
			)
			.catch(e => {
				logger.error(e);
			});
	}
});

MessagesSchema.statics = {
	createMessagesThread(data) {
		Object.keys(data).forEach(k => {
			if (data[k] === null || data[k] === undefined) delete data[k];
		});

		data.declined = false;
		data.threadId = _.toString(data.threadId);
		const query = this.getThreadQuery(data);

		// const { groupIds, ...updateData } = data;

		// const updateOptions = {
		// 	$set: updateData,
		// };
		// if (groupIds) {
		// 	updateOptions.$addToSet = _.isArray(groupIds) ? { $each: groupIds } : groupIds;
		// }

		return this.findOneAndUpdate(query, data, {
			new: true,
			upsert: true,
		});
	},

	getThreadQuery(data) {
		const query = {
			otaName: data.otaName,
			threadId: _.toString(data.threadId),
		};
		const $or = [];
		if (data.otaBookingId) {
			$or.push({
				otaBookingId: data.otaBookingId,
			});
		}
		if (data.otaListingId && data.inquiryDetails && data.inquiryDetails.from) {
			$or.push({
				otaListingId: data.otaListingId,
				'inquiryDetails.from': data.inquiryDetails.from,
				'inquiryDetails.to': data.inquiryDetails.to,
			});
		}
		if ($or.length) {
			query.$or = $or;
		}
		return query;
	},
};

const MessageModel = mongoose.model('Messages', MessagesSchema, 'messages');

module.exports = MessageModel;
