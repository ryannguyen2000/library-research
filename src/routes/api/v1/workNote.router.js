const _ = require('lodash');

const router = require('@core/router').Router();
const { WORK_NOTE_TYPES } = require('@utils/const');
const models = require('@models');
const WorkNote = require('@controllers/working/work_note');

async function getNotes(req, res) {
	const type = parseInt(req.query.type);

	const filter = { type: { $in: [WORK_NOTE_TYPES.NORMAL, null] } };

	if (type) {
		filter.type = type;
	}

	const data = await WorkNote.list(req.query, req.decoded.user, filter);

	res.sendData(data);
}

async function getHostNotes(req, res) {
	const data = await WorkNote.list(req.query, req.decoded.user, { type: WORK_NOTE_TYPES.HOST_ONLY });
	res.sendData(data);
}

async function getNote(req, res) {
	const { id } = req.params;

	const data = await models.WorkNote.findById(id)
		.populate('createdBy', 'username name')
		.populate('bookingId', 'otaName otaBookingId')
		.populate('blockId', 'info.name info.shortName')
		.populate('log.user', 'name username');

	res.sendData(data);
}

async function addNote(req, res) {
	const note = req.body;
	const { user } = req.decoded;
	note.createdBy = user._id;

	const data = await WorkNote.create(note, user);

	res.sendData(data);
}

async function addHostNote(req, res) {
	const note = req.body;
	const { user } = req.decoded;

	note.createdBy = user._id;
	note.type = [WORK_NOTE_TYPES.HOST_ONLY];

	const data = await WorkNote.create(note, user);

	res.sendData(data);
}

async function updateNote(req, res) {
	const { id } = req.params;
	const user = req.decoded.user._id;
	const data = req.body;

	const note = await WorkNote.update(id, user, data);

	res.sendData(_.pick(note, _.keys(data)));
}

router.getS('/', getNotes, true);
router.getS('/host', getHostNotes, true);

router.getS('/:id', getNote, true);

router.postS('/host', addHostNote, true);
router.postS('/', addNote, true);
router.putS('/:id', updateNote, true);

const activity = {
	WORKNOTE_HOST_CREATE: {
		key: 'host',
		method: 'POST',
	},
	WORKNOTE_CREATE: {
		key: '',
		method: 'POST',
	},
	WORKNOTE_UPDATE: {
		key: '',
		method: 'PUT',
	},
};

module.exports = { router, activity };
