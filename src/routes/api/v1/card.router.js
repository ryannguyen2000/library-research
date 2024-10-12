const _ = require('lodash');
const router = require('@core/router').Router();

async function getCards(req, res) {
	const data = null;
	res.sendData(data);
}

async function validateCardInfo(req, res) {
	const data = null;
	res.sendData(data);
}

async function createCard(req, res) {
	const data = null;
	res.sendData(data);
}

async function updateCard(req, res) {
	const data = null;
	res.sendData(data);
}

async function deleteCard(req, res) {
	const data = null;
	res.sendData(data);
}

router.getS('/', getCards);
router.postS('/', createCard);
router.getS('/validation', validateCardInfo);
router.putS('/:cardId', updateCard);
router.deleteS('/:cardId', deleteCard);

const activity = {
	ROOM_CARD_CREATE: {
		key: '/',
		exact: true,
		method: 'POST',
	},
	ROOM_CARD_UPDATE: {
		key: '/{id}',
		exact: true,
		method: 'PUT',
	},
	ROOM_CARD_DELETE: {
		key: '/{id}',
		method: 'DELETE',
	},
	//
};

module.exports = { router, activity };
