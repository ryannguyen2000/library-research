const mongoose = require('mongoose');
const _ = require('lodash');

const {
	InboxType,
	RolePermissons,
	// Services,
	BookingGuideStatus,
	BookingGuideDoneStatus,
	BookingCallStatus,
	BookingContactOTAStatus,
	BookingQueueCancellation,
	BookingPaymentStatus,
	BookingTimeInOutStatus,
	ProblemStatus,
	// BookingStatus,
	Attitude,
	USER_CONTACT_TYPE,
} = require('@utils/const');
const notification = require('@services/notification');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const BlockInbox = new Schema(
	{
		inboxType: String,
		title: String,
		subTitle: String,
		ottSource: String,
		ottPhone: String,
		phone: String,
		isGroup: { type: Boolean, default: false },
		isUser: { type: Boolean, default: false },
		isPrivate: { type: Boolean, default: false },
		// userIds: [{ type: ObjectId, ref: 'User' }],
		userType: { type: String, enum: Object.values(USER_CONTACT_TYPE), default: USER_CONTACT_TYPE.GUEST },
		bookingId: { type: ObjectId, ref: 'Booking' },
		messageId: { type: ObjectId, ref: 'Messages', required: true },
		listingId: { type: ObjectId, ref: 'Listing' },
		blockId: { type: ObjectId, ref: 'Block' },
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		guestId: { type: ObjectId, ref: 'Guest' },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		read: { type: Boolean, default: false },
		readBy: { type: ObjectId, ref: 'User' },
		readTime: { type: Date },
		updatedAt: { type: Date, default: () => new Date() },

		otaName: String,
		otaBookingId: String,
		from: Date,
		to: Date,
		checkin: Date,
		checkout: Date,
		keywords: [String],
		attitude: { type: String, enum: [...Attitude, null], default: Attitude[1] },
		reply: { type: Boolean }, // MessageStatus
		inquiry: { type: Boolean },
		serviceType: { type: Number },
		status: { type: String },
		isPaid: Boolean,

		guideStatus: { type: Number, enum: _.values(BookingGuideStatus) },
		guideDoneStatus: { type: Number, enum: _.values(BookingGuideDoneStatus) },
		guideDoneBy: { type: ObjectId, ref: 'User' },
		callStatus: { type: Number, enum: _.values(BookingCallStatus) },

		timeInOutStatus: { type: Number, enum: _.values(BookingTimeInOutStatus) },
		contactOTAStatus: { type: Number, enum: _.values(BookingContactOTAStatus) },
		queueCancellationStatus: { type: Number, enum: _.values(BookingQueueCancellation) },

		paymentStatus: { type: Number, enum: _.values(BookingPaymentStatus) },
		paymentSubStatus: { type: Number },
		paymentCollectType: { type: Number },
		paymentDone: { type: Boolean },

		problemStatus: [{ type: String, enum: _.values(ProblemStatus) }],

		paymentCardState: {
			status: { type: String },
			chargedStatus: { type: String },
			markedInvalid: { type: Boolean },
			markedAt: { Date },
			autoCancel: Boolean,
		},

		display: { type: Boolean, default: true },
		displayToday: Boolean,
	},
	{
		timestamps: {
			createdAt: true,
			updatedAt: false,
		},
		versionKey: false,
		autoIndex: false,
	}
);

BlockInbox.index({ read: 1, updatedAt: -1 });

BlockInbox.post('save', function (doc) {
	if (doc.read) return;

	let sound = null;
	switch (doc.inboxType) {
		case InboxType.MESSAGE:
			sound = notification.Sound.Messages;
			break;
		case InboxType.RESERVATION:
			sound = notification.Sound.Reservation;
			break;
		case InboxType.CANCELED:
			sound = notification.Sound.Cancelled;
			break;
		case InboxType.RESERVATION_UPDATE:
			sound = notification.Sound.Update;
			break;
		default:
			break;
	}

	notification.pushToHostsOfBlock({
		blockId: doc.blockId,
		title: doc.title,
		data: doc,
		sound,
		ottPhone: doc.ottPhone,
		permissions: [RolePermissons.INBOX],
	});
});

BlockInbox.statics = {
	async updateOrCreate(data, read = false, forceUpdateKeyword) {
		let inbox = await this.findOne({ messageId: data.messageId });
		let isNew = !inbox;

		if (inbox) {
			_.entries(data).forEach(([key, value]) => {
				if (
					key === 'groupIds' &&
					(inbox.isGroup || inbox.isUser || inbox.userType === USER_CONTACT_TYPE.GROUP)
				) {
					return;
				}
				if (value !== null && value !== undefined) {
					inbox[key] = value;
				}
			});
			inbox.read = read;
			inbox.updatedAt = new Date();
		} else {
			inbox = new this({ ...data, read });
		}

		await inbox.save();

		if (isNew || forceUpdateKeyword) {
			await this.updateKeyword({ messageId: data.messageId });
		}

		return [inbox, isNew];
	},

	async updateKeyword(filter) {
		const inboxes = await this.find(filter).select('bookingId guestId roomIds').populate('roomIds', 'info.roomNo');

		await inboxes.asyncMap(async inbox => {
			let keywords;
			let roomIds;

			if (inbox.bookingId) {
				const booking = await this.model('Booking')
					.findById(inbox.bookingId)
					.select('reservateRooms guestId guestIds otaBookingId')
					.populate('reservateRooms', 'info.roomNo')
					.populate('guestId guestIds', 'searchName phone')
					.lean();

				if (booking) {
					keywords = _.compact([
						booking.otaBookingId,
						..._.map([booking.guestId, ...(booking.guestIds || [])], 'phone'),
						..._.map([booking.guestId, ...(booking.guestIds || [])], 'searchName'),
						..._.map(booking.reservateRooms, 'info.roomNo'),
					]);
					roomIds = _.map(booking.reservateRooms, '_id');
				}
			} else if (inbox.guestId) {
				const guest = await this.model('Guest').findById(inbox.guestId).select('searchName phone');
				if (guest) {
					keywords = _.compact([guest.searchName, guest.phone]);
					if (inbox.roomIds && inbox.roomIds.length) {
						keywords.push(..._.map(inbox.roomIds, 'info.roomNo'));
					}
				}
			}

			const updateData = {};

			if (keywords) {
				updateData.keywords = keywords.map(k => _.toLower(k));
			}
			if (roomIds) {
				updateData.roomIds = roomIds;
			}
			if (!_.isEmpty(updateData)) {
				await this.updateOne({ _id: inbox._id }, updateData);
			}
		});
	},
};

module.exports = mongoose.model('BlockInbox', BlockInbox, 'block_inbox');
