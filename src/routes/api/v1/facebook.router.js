// const dot = require('dot-object');
const _ = require('lodash');

const router = require('@core/router').Router();
const { OTTs } = require('@utils/const');

const models = require('@models');
const { loadPages } = require('@services/facebook/messager');

async function list(req, res) {
	const { user } = req.decoded;
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const results = await models.Ott.find({
		active: true,
		[OTTs.Facebook]: true,
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockId: { $in: blockIds },
			},
		],
	});

	const data = results.map(r => ({
		_id: r._id,
		...r[`${OTTs.Facebook}Info`],
	}));

	res.sendData(data);
}

async function create(req, res) {
	const pages = _.filter(req.body, p => p.access_token);

	const docs = await pages.asyncMap(async data => {
		const filter = {
			phone: data.id,
		};

		const { name } = data;
		delete data.name;

		const doc = await models.Ott.findOneAndUpdate(
			filter,
			{
				$set: {
					..._.mapKeys(data, (value, key) => `${OTTs.Facebook}Info.${key}`),
				},
				$setOnInsert: {
					active: true,
					groupIds: req.decoded.user.groupIds,
					name,
					[OTTs.Facebook]: true,
				},
			},
			{
				new: true,
				upsert: true,
			}
		);

		return doc;
	});

	loadPages();

	res.sendData(docs);
}

async function update(req, res) {
	const result = await models.Ott.findOneAndUpdate(
		{ _id: req.params.id, groupIds: { $in: req.decoded.user.groupIds } },
		{ ..._.mapKeys(req.body, (value, key) => `${OTTs.Facebook}Info.${key}`) },
		{ new: true }
	);

	loadPages();

	res.sendData(result);
}

async function remove(req, res) {
	await models.Ott.deleteOne({ _id: req.params.id, groupIds: { $in: req.decoded.user.groupIds } });

	loadPages();

	res.sendData();
}

router.getS('/', list, true);
router.postS('/', create, true);
router.putS('/:id', update, true);
router.deleteS('/:id', remove, true);

const activity = {
	OTT_FB_CREATE: {
		key: '/',
		exact: true,
	},
	OTT_FB_UPDATE: {
		key: '/{id}',
		method: 'PUT',
	},
	OTT_FB_DELETE: {
		key: '/{id}',
		method: 'DELETE',
	},
};

module.exports = { router, activity };
