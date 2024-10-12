const _ = require('lodash');
const { rangeDate } = require('@utils/date');
const router = require('@core/router').Router();
const noteController = require('@controllers/note');

async function getNotes(req, res) {
	const { blockId, roomId, from, to } = req.query;
	const userId = req.decoded.user._id;

	let blockNotes;

	blockNotes = await noteController.getNotesFromTo({ blockId, roomId, from, to }, userId);

	res.sendData({ blockNotes });
}

async function getCalendarNotes(req, res) {
	const data = await noteController.getCalendarNotes(req.decoded.user, req.query);

	res.sendData(data);
}

async function updateCleaningState(req, res) {
	const data = await noteController.updateCleaningState(req.decoded.user, req.body);

	res.sendData(data);
}

async function addNotes(req, res) {
	let { blockId, roomId, from, to } = req.query;
	let { notes, rooms } = req.body;
	let userId = req.decoded.user._id;

	let date = [];
	if (from && to) {
		date = rangeDate(from, to).toArray();
	} else {
		date = req.query.date;
	}
	if (rooms && rooms.length) {
		roomId = rooms;
	}

	await noteController.addNotes({ blockId, roomId, date, notes }, userId);

	res.sendData();
}

async function removeNote(req, res) {
	const { noteId } = req.params;
	const userId = req.decoded.user._id;

	const removedNote = await noteController.removeNote({ noteId }, userId);
	if (removedNote && removedNote.blockId) {
		_.set(req, ['logData', 'blockId'], removedNote.blockId);
	}

	res.sendData();
}

async function updateNote(req, res) {
	const { noteId } = req.params;
	const userId = req.decoded.user._id;

	const { description = '', images = [] } = req.body;

	const note = await noteController.updateNote({ noteId, data: { description, images } }, userId);
	if (note && note.blockId) {
		_.set(req, ['logData', 'blockId'], note.blockId);
	}

	res.sendData();
}

router.getS('/', getNotes, true);
router.postS('/', addNotes, true);
router.postS('/cleaningState', updateCleaningState, true);
router.getS('/calendar', getCalendarNotes, true);
router.putS('/:noteId', updateNote, true);
router.deleteS('/:noteId', removeNote, true);

const activity = {
	CALENDAR_UPDATE_CLEANING_STATE: {
		key: 'cleaningState',
		method: 'POST',
	},
	CALENDAR_NOTE_CREATE: {
		key: '',
		method: 'POST',
	},
	CALENDAR_NOTE_UPDATE: {
		key: '',
		method: 'PUT',
	},
	CALENDAR_NOTE_DELETE: {
		key: '',
		method: 'DELETE',
	},
};

module.exports = { router, activity };
