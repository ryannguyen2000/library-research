const _ = require('lodash');

const { URL_CONFIG } = require('@config/setting');
const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const letterController = require('@controllers/image_composer/letter');
const { genUrl } = require('@utils/generate');

function transUrl(url = '') {
	if (!URL_CONFIG.LETTER) return url;
	const paths = url.split('/');
	return `${URL_CONFIG.LETTER}/${paths[paths.length - 1]}`;
}

async function createLetter(req, res) {
	const { name, type = 'apology' } = req.body;

	const fileName = `${type}_${genUrl(name)}`;
	let url = '';

	if (name && type === 'apology') {
		url = await letterController.createLetterApology({ name, fileName, type });
	}

	if (!url) {
		throw new ThrowReturn('Server error!');
	}

	let letter = await models.Letter.findOne({ name, groupIds: { $in: req.decoded.user.groupIds } });

	if (letter) {
		letter.url = url;
		letter.fileName = fileName;
		letter.createdBy = req.decoded.user._id;
		letter.updatedAt = new Date();
	} else {
		letter = new models.Letter({
			name,
			type,
			fileName,
			createdBy: req.decoded.user._id,
			url,
			groupIds: req.decoded.user.groupIds,
		});
	}

	await letter.save();
	letter.url = transUrl(letter.url);

	res.sendData({ letter });
}

async function getLetters(req, res) {
	let { start, limit, name, ...query } = req.query;
	start = parseInt(start || 0);
	limit = parseInt(limit || 10);
	query.groupIds = { $in: req.decoded.user.groupIds };

	if (name) {
		query.name = new RegExp(_.escapeRegExp(name), 'i');
	}
	const letters = await models.Letter.find(query)
		.sort({ updatedAt: -1 })
		.skip(start)
		.limit(limit)
		.populate('createdBy', 'username name');
	const total = await models.Letter.countDocuments(query);

	letters.forEach(l => {
		l.url = transUrl(l.url);
	});

	res.sendData({ letters, total });
}

async function getLetter(req, res) {
	const { id } = req.params;

	const letter = await models.Letter.findOne({ _id: id, groupIds: { $in: req.decoded.user.groupIds } }).populate(
		'createdBy',
		'username name'
	);
	letter.url = transUrl(letter.url);

	res.sendData({ letter });
}

async function deleteLetter(req, res) {
	const { id } = req.params;

	const letter = await models.Letter.findOneAndDelete({ _id: id, groupIds: { $in: req.decoded.user.groupIds } });
	if (letter) await letterController.removeLetter(letter);

	res.sendData();
}

router.getS('/', getLetters, true);
router.getS('/:id', getLetter, true);

router.postS('/', createLetter, true);
router.deleteS('/:id', deleteLetter, true);

const activity = {
	LETTER_CREATE: {
		key: '',
		method: 'POST',
	},
	LETTER_DELETE: {
		key: '',
		method: 'DELETE',
	},
};

module.exports = { router, activity };
