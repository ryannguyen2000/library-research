const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const UserLogSchema = new Schema(
	{
		username: { type: String, required: true },
		method: String,
		action: String,
		data: String,
		type: { type: String, index: true, required: true },
		rawText: String,
		blockId: { type: ObjectId, ref: 'Block' },
		roomId: { type: ObjectId, ref: 'Room' },
		response: Schema.Types.Mixed,
		// {
		// 	error_code: Number,
		// 	error_msg: String,
		// 	data: Schema.Types.Mixed,
		// },
	},
	{
		timestamps: {
			createdAt: true,
			updatedAt: false,
		},
		versionKey: false,
		autoIndex: false,
		toJSON: {
			virtuals: true,
		},
	}
);

UserLogSchema.index({ createdAt: 1 });

UserLogSchema.virtual('user', {
	ref: 'User',
	localField: 'username',
	foreignField: 'username',
	justOne: true,
});

UserLogSchema.statics = {
	async addLogFromCalling(callDoc) {
		const { phone, data, bookingIds, blockId } = callDoc;

		const callUser = await this.model('CallUser')
			.findOne({
				stringee_user_id: data.from_user_id || data.to_number,
			})
			.populate('userId', 'groupIds username');

		const username = _.get(callUser, 'userId.username');
		if (!username) return;

		const booking =
			bookingIds &&
			bookingIds.length &&
			(await this.model('Booking').findOne({ _id: bookingIds }).select('otaBookingId blockId'));

		await this.create({
			username,
			method: 'POST',
			action: '',
			data: data.id,
			type: `CALLING_CALL_${data.from_internal ? 'OUT' : 'IN'}`,
			createdAt: new Date(data.start_time),
			rawText: _.compact([
				data.from_internal ? `Gọi điện tới số ${phone}` : `Nhận cuộc gọi từ số ${phone}`,
				booking && `Mã đặt phòng ${booking.otaBookingId}`,
			]).join('. '),
			blockId: blockId || (booking ? booking.blockId : undefined),
		});
	},
};

module.exports = mongoose.model('UserLog', UserLogSchema, 'user_log');
