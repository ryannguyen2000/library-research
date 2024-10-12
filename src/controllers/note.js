const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const { rangeDate } = require('@utils/date');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

const { ObjectId } = mongoose.Types;

async function getNotes(data) {
	const { blockId, roomId, date } = data;

	if (!blockId) {
		throw new ThrowReturn('BlockId empty');
	}
	if (!date) {
		throw new ThrowReturn('date empty');
	}

	const filter = {
		blockId: ObjectId(blockId),
		date: new Date(date),
	};

	if (roomId) {
		filter.roomId = ObjectId(roomId);
	}

	const blockDatesNotes = await models.BlockNotes.find(filter)
		.populate({
			path: 'notes',
			match: {
				deleted: false,
			},
			populate: [
				{ path: 'by', select: 'name username' },
				{ path: 'removedBy', select: 'name username' },
			],
		})
		.sort({ date: 1 })
		.lean();

	return blockDatesNotes;
}

async function getCalendarNotes(user, query) {
	const { blockId, roomId, from, to } = query;

	if (!from || !to) {
		throw new ThrowReturn('from/to is null');
	}
	if (!blockId) {
		throw new ThrowReturn('BlockId empty');
	}

	const start = moment(from).startOf('day').toDate();
	const end = moment(to).endOf('day').toDate();

	const filter = {
		date: { $gte: start, $lte: end },
		blockId: ObjectId(blockId),
		roomId: { $ne: null },
	};
	if (roomId) {
		filter.roomId.$eq = ObjectId(roomId);
	}

	const blockNotes = await models.BlockNotes.find(filter)
		.select('roomId date notes cleaningState')
		.populate({
			path: 'notes',
			match: {
				deleted: false,
			},
			select: 'system',
		})
		.lean();

	const rs = {};

	blockNotes.forEach(s => {
		const formatDate = s.date.toDateMysqlFormat();
		const notes = _.filter(s.notes, n => !n.system);

		_.set(rs, [formatDate, s.roomId], {
			cleaningState: s.cleaningState,
			noteCount: notes.length,
			logCount: _.get(s.notes, 'length', 0) - notes.length,
		});
	});

	return {
		stats: rs,
	};
}

async function getNotesFromTo(data) {
	const { blockId, roomId } = data;

	if (!data.from || !data.to) {
		throw new ThrowReturn('from/to is null');
	}
	if (!blockId) {
		throw new ThrowReturn('BlockId empty');
	}

	const from = moment(data.from).startOf('days').toDate();
	const to = moment(data.to).endOf('days').toDate();

	const filter = {
		blockId: ObjectId(blockId),
		date: { $gte: from, $lte: to },
	};

	if (roomId) {
		filter.roomId = ObjectId(roomId);
	}

	const blockDatesNotes = await models.BlockNotes.find(filter)
		.populate({
			path: 'notes',
			match: {
				deleted: false,
			},
			populate: [
				{ path: 'by', select: 'name username' },
				{ path: 'removedBy', select: 'name username' },
			],
		})
		.sort({ date: 1 })
		.lean();

	return blockDatesNotes;
}

async function addNotes(data, useId) {
	return await models.BlockNotes.addNotes(data, useId);
}

async function removeNote({ noteId }, userId) {
	return await models.Note.removeNote(noteId, userId);
}

async function updateNote({ noteId, data }, userId) {
	return await models.Note.updateNote(noteId, data, userId);
}

async function updateCleaningState(user, data) {
	if (!data.blockId) {
		throw new ThrowReturn('BlockId empty');
	}

	const roomIds = _.compact(data.roomIds || [data.roomId]);
	const userId = user ? user._id : null;
	const bulks = [];

	rangeDate(data.from, data.to)
		.toArray()
		.forEach(date => {
			roomIds.forEach(roomId => {
				bulks.push({
					updateOne: {
						filter: {
							roomId,
							blockId: data.blockId,
							date,
						},
						update: {
							$set: {
								cleaningState: data.cleaningState,
								updatedBy: userId,
							},
							$setOnInsert: {
								notes: [],
							},
						},
						upsert: true,
					},
				});
			});
		});

	await models.BlockNotes.bulkWrite(bulks);
}

module.exports = {
	addNotes,
	getNotes,
	removeNote,
	updateNote,
	getNotesFromTo,
	getCalendarNotes,
	updateCleaningState,
};
