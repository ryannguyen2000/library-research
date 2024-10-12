const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');

const { chunkDate } = require('@utils/date');
const { RuleHour } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const OTAInfo = {
	otaName: String,
	account: String,
	_id: false,
};

const JobSchema = new Schema(
	{
		listingIds: [{ type: ObjectId, ref: 'Listing' }],
		from: Date,
		to: Date,
		description: String,
		otas: [OTAInfo],
		numRun: { type: Number, default: 0 },
		doing: { type: Boolean, default: false },
		done: { type: Boolean, default: false },
		error: { type: Boolean },
	},
	{ timestamps: true }
);

JobSchema.index({ createdAt: -1 }, { expires: '2d' });

JobSchema.statics.createByRooms = async function ({ roomIds, from, to, description }) {
	roomIds = _.compact(_.isArray(roomIds) ? roomIds : [roomIds]);

	if (!roomIds.length) return;

	const Room = this.model('Room');
	const relationRooms = await roomIds.asyncMap(roomId => Room.getRelationsRooms(roomId));

	const listing = await this.model('Listing').aggregate([
		{ $match: { roomIds: { $in: _.flattenDeep(relationRooms) } } },
		{ $group: { _id: null, ids: { $push: '$_id' } } },
	]);
	const listingIds = _.get(listing, [0, 'ids']);

	if (listingIds && listingIds.length) {
		return await this.createByListing({ listingIds, from, to, otas: [], description });
	}
};

JobSchema.statics.createByListing = async function ({ listingIds, from, to, otas = [], description = '', error }) {
	listingIds = _.compact(_.isArray(listingIds) ? listingIds : [listingIds]);

	if (!listingIds.length) return;

	const now = moment().format('HH:mm');
	const today = now >= RuleHour.openHour ? new Date().zeroHours() : moment().subtract(1, 'day').toDate().zeroHours();

	from = new Date(from || new Date()).zeroHours();
	to = new Date(to || new Date()).zeroHours();

	if (from < today) from = today;
	if (to < from) to = from;
	if (to < today) return;

	// delay for update calendar
	await Promise.delay(2000);

	return await chunkDate(from, to, 30).asyncMap(range =>
		this.findAndCreate({
			listingIds,
			from: range[0],
			to: range[1],
			description,
			otas,
			done: !!error,
			error,
		})
	);
};

JobSchema.statics.findAndCreate = async function (data) {
	const exists = await this.findOne({
		listingIds: { $all: data.listingIds },
		from: { $lte: data.from },
		to: { $gte: data.to },
		doing: false,
		$and: [
			{
				$or: [
					{
						done: false,
					},
					{
						error: true,
					},
				],
			},
			{
				$or: [
					{
						'otas.0': { $exists: false },
					},
					..._.map(data.otas, ota => ({
						otas: {
							$elemMatch: {
								otaName: ota.otaName,
								account: ota.account,
							},
						},
					})),
				],
			},
		],
	});
	if (!exists) return this.create(data);
};

module.exports = mongoose.model('JobCalendar', JobSchema, 'job_calendar');
