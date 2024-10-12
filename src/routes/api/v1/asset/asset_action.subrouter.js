// const mongoose = require('mongoose');
const _ = require('lodash');
const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { LANGUAGE } = require('@utils/const');
// const { AssetActions } = require('@utils/const');

const FormModel = models.AssetAction;
// const { ObjectId } = mongoose.Types;

async function list(req, res) {
	const isEn = req.language === LANGUAGE.EN;
	const { start = 0, limit = 20, assetId, ...query } = req.query;

	if (assetId) {
		query.$or = [
			{
				'currentAsset._id': assetId,
			},
			{
				'newAsset._id': assetId,
			},
		];
	}

	const [data, total] = await Promise.all([
		FormModel.find(query)
			.sort({ createdAt: -1 })
			.skip(parseInt(start))
			.limit(parseInt(limit))
			.populate('createdBy', 'username name')
			.populate('approved.userId', 'username name')
			.populate('blockId', 'info.name')
			.populate('roomId', 'info.name info.roomNo')
			.populate({
				path: 'taskId',
				select: 'description category time assigned',
				populate: [
					{
						path: 'category',
						select: 'name nameEn tag',
						transform: doc => {
							return isEn ? { name: doc.nameEn } : doc;
						},
					},
					{
						path: 'assigned',
						select: 'name username',
					},
				],
			}),
		FormModel.countDocuments(query),
	]);

	return res.sendData({ assets_action: data, total });
}

async function create(req, res) {
	const createdBy = req.decoded.user._id;

	const asset_action = await FormModel.createOrUpdate({
		...req.body,
		createdBy,
	});

	res.sendData({ asset_action });
}

async function modify(req, res) {
	const { id } = req.params;

	const data = await FormModel.createOrUpdate({
		...req.body,
		_id: id,
	});

	res.sendData({ asset_action: _.pick(data, _.keys(req.body)) });
}

async function view(req, res) {
	const { id } = req.params;

	const asset_action = await FormModel.findOne({ _id: id })
		.populate('createdBy', 'username name')
		.populate('approved.userId', 'username name')
		.populate('blockId', 'info.name')
		.populate('roomId', 'info.name info.roomNo');

	if (!asset_action) throw new ThrowReturn('Form not found!');

	return res.sendData({ asset_action });
}

async function del(req, res) {
	await FormModel.del(req.params.id);

	res.sendData();
}

async function approve(req, res) {
	const { id } = req.params;
	const userId = req.decoded.user._id;

	await FormModel.approve(id, userId);

	const asset_action = await FormModel.findOne({ _id: id })
		.select('approved')
		.populate('approved.userId', 'username name');

	res.sendData({ asset_action });
}

module.exports = { view, modify, del, list, create, approve };
