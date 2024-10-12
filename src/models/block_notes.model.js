const mongoose = require('mongoose');
const _ = require('lodash');
const { CLEANING_STATE } = require('@utils/const');

const { Schema } = mongoose;

const BlockNotesSchema = new Schema(
	{
		date: { type: Date, required: true },
		blockId: { type: Schema.Types.ObjectId, ref: 'Block', required: true },
		roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
		cleaningState: { type: String, enum: Object.values(CLEANING_STATE), default: CLEANING_STATE.VC },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'User ' },
		notes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
	},
	{
		timestamps: true,
		autoIndex: false,
		versionKey: false,
	}
);

BlockNotesSchema.index({ date: 1, blockId: 1, roomId: 1 }, { unique: true });

BlockNotesSchema.statics = {
	async addNotes(data, userId) {
		const notesData = data.notes || [];
		const NoteModel = this.model('Note');

		const newNotes = await notesData.asyncMap(async note => {
			note.by = note.by || (userId ? mongoose.Types.ObjectId(userId) : undefined);
			note.blockId = data.blockId;

			if (note._id) {
				await NoteModel.updateOne(note._id, note, { upsert: true });
				return;
			}

			const doc = await NoteModel.create(note);
			return doc._id;
		});

		const dates = _.isArray(data.date) ? data.date : [data.date];
		const roomIds = _.isArray(data.roomId) ? data.roomId : [data.roomId];

		const bulks = [];

		dates.forEach(date => {
			roomIds.forEach(roomId => {
				bulks.push({
					updateOne: {
						filter: {
							blockId: data.blockId,
							roomId,
							date,
						},
						update: {
							$addToSet: {
								notes: { $each: newNotes.filter(n => n) },
							},
						},
						upsert: true,
					},
				});
			});
		});

		return this.bulkWrite(bulks);
	},

	async getCleaningState(blockId, roomId, date) {
		date = date || new Date().zeroHours();

		const note = await this.findOne({ blockId, roomId, date });
		if (note) {
			return note.cleaningState;
		}

		return CLEANING_STATE.VC;
	},

	async updateCleaningState({ blockId, roomIds, date, user, state }) {
		if (!roomIds || !roomIds.length) return;

		date = (date || new Date()).zeroHours();
		state = state || CLEANING_STATE.VD;
		const userId = user ? user._id : null;

		const bulks = roomIds.map(roomId => {
			return {
				updateOne: {
					filter: {
						roomId,
						blockId,
						date,
					},
					update: {
						$set: {
							cleaningState: state,
							updatedBy: userId,
						},
						$setOnInsert: {
							notes: [],
						},
					},
					upsert: true,
				},
			};
		});

		await this.bulkWrite(bulks);
	},

	async addCalendarNotes({ description, userId, system = false, items, blockId }) {
		if (!items.length) return;

		const note = await this.model('Note').create({
			description,
			by: userId,
			system,
		});

		const bulks = [];
		const checker = {};

		items.forEach(item => {
			const path = [blockId, item.roomId, new Date(item.date).toDateMysqlFormat()];

			if (_.get(checker, path)) return;

			bulks.push({
				updateOne: {
					filter: {
						blockId: mongoose.Types.ObjectId(blockId),
						roomId: mongoose.Types.ObjectId(item.roomId),
						date: item.date,
					},
					update: { $push: { notes: note._id } },
					upsert: true,
				},
			});

			_.set(checker, path, true);
		});

		await this.bulkWrite(bulks);
	},
};

module.exports = mongoose.model('BlockNotes', BlockNotesSchema, 'block_notes');
