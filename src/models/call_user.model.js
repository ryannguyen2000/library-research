const mongoose = require('mongoose');
const moment = require('moment');
const { daysOfWeek, getDayOfWeek } = require('@services/stringee/utils');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CallSchema = new Schema(
	{
		id: String,
		userId: { type: ObjectId, ref: 'User', unique: true },
		projectId: { type: ObjectId, ref: 'CallProject' },
		stringee_user_id: String,
		stringee_project_id: Number,
		token: String,
		exp: Number,
		routing_type: { type: Number, default: 1 },
		answer_timeout: { type: Number, default: 15 },
		phone_number: Number,
		days: [
			{
				_id: false,
				day: { type: String, enum: daysOfWeek, required: true },
				time_start: { type: String, default: '00:00' },
				time_end: { type: String, default: '23:59' },
				disabled_calling: { type: Boolean, default: false },
				disabled_listening: { type: Boolean, default: false },
				order: Number,
			},
		],
	},
	{
		timestamps: true,
	}
);

CallSchema.statics = {
	getCanAccessAgents(filters, day) {
		day = day || new Date();
		const time = moment(day).format('HH:mm');

		return this.aggregate()
			.match(filters)
			.unwind('$days')
			.match({
				'days.day': getDayOfWeek(day),
				'days.disabled_listening': false,
				'days.time_start': {
					$lte: time,
				},
				'days.time_end': {
					$gte: time,
				},
			})
			.sort({ 'days.order': -1 })
			.project({
				_id: 0,
				stringee_user_id: 1,
				phone_number: 1,
				userId: 1,
			});
	},
};

module.exports = mongoose.model('CallUser', CallSchema, 'call_user');
