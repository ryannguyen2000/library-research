const { Schema, model } = require('mongoose');
const _ = require('lodash');

const { ObjectId } = Schema.Types;

const schema = new Schema(
	{
		forMonth: {
			type: String,
			validate: {
				validator: v => /^\d{4}-\d{2}$/.test(v),
				message: props => `\`${props.value}\` is not a valid format \`YYYY-MM\``,
			},
			required: true,
		},
		blockId: { type: ObjectId, ref: 'Block' },
		by: { type: ObjectId, ref: 'User' },
		data: {
			room: {
				total: Number,
				available: Number,
				sold: Number,
			},
			guest: {
				total: Number,
				international: Number,
				domestic: Number,
			},
			night: {
				total: Number,
				international: Number,
				domestic: Number,
			},
			revenue: {
				total: Number,
				booking: Number,
				minibar: Number,
				other: Number,
			},
			employee: {
				total: Number,
				manager: Number,
				admin: Number,
				housekeeping: Number,
				minibar: Number,
				other: Number,
			},
		},
		groupId: { type: Schema.Types.ObjectId, ref: 'UserGroup' },
	},
	{
		timestamps: true,
	}
);

module.exports = model('TourismAccommodationReport', schema, 'tourism_accomodation_report');
