const _ = require('lodash');

// const ThrowReturn = require('@core/throwreturn');
const mongoose = require('@utils/mongoose');
const models = require('@models');
const { logger } = require('@utils/logger');
const { LANGUAGE } = require('@utils/const');

const FormModel = models.Asset;

async function groupByList(req, res) {
	const { roomId, getAll = false, approved = false, limit, start, ...query } = req.query;

	if (!query.blockId) {
		// throw new ThrowReturn('Missing params blockId!');
		return res.sendData({ assets: {}, order: [] });
	}

	if (roomId) {
		query.roomId = roomId;
	} else if (!JSON.parse(getAll)) {
		query.roomId = null;
	}

	let Form = !JSON.parse(approved) ? FormModel : models.AssetActive;

	const data = await Form.find(query).sort({ order: 1 });

	const assets = _.groupBy(data, 'label');
	const order = _.uniq(_.map(data, 'label'));

	res.sendData({ assets, order });
}

async function list(req, res) {
	const isEn = req.language === LANGUAGE.EN;
	const { roomId, approved = false, start, limit, blockId } = req.query;

	const { filters } = await models.Host.getBlocksOfUser({
		user: req.decoded.user,
		filterBlockIds: blockId,
		roomKey: 'roomId',
	});

	const query = {
		...filters,
	};

	if (!roomId && roomId !== undefined) _.set(query, 'roomId.$eq', null);
	if (roomId) _.set(query, 'roomId.$eq', roomId);

	let Form = !JSON.parse(approved) ? FormModel : models.AssetActive;

	const [assets, total] = await Promise.all([
		Form.find(query)
			.sort({ order: -1 })
			.skip(start)
			.limit(limit)
			.populate('kindId', '_id name nameEn')
			.populate('roomId', 'info.roomNo')
			.lean(),
		Form.countDocuments(query),
	]);
	_.forEach(assets, asset => {
		if (isEn) {
			asset.name = _.get(asset, 'kindId.nameEn') || asset.nameEn || asset.name;
		}
		asset.kindId = _.get(asset, 'kindId._id');
		asset.label = asset.labelEn;
	});

	return res.sendData({ assets, total });
}

function validateAttrs(attributes) {
	if (!attributes) return;

	const keys = _.keys(mongoose.Custom.Schema.Types.validators);

	attributes.forEach(att => {
		if (att.value === null) att.value = undefined;
		if (att.value && keys.includes(att.type)) {
			const isValid = mongoose.Custom.Schema.Types.validators[att.type].validator(att.value);
			if (!isValid) {
				att.value = undefined;
			}
		}
	});
}

async function modify(req, res) {
	const { roomId, blockId, assets } = req.body.assets;

	const ids = [];

	await assets.asyncMap(async asset => {
		validateAttrs(asset.attributes);

		if (asset._id) {
			const data = await FormModel.findByIdAndUpdate(asset._id, {
				...asset,
				blockId,
				roomId,
			});
			if (data) ids.push(data._id);
		} else {
			const data = await FormModel.create({
				...asset,
				blockId,
				roomId,
			});
			ids.push(data._id);
		}
	});

	await FormModel.deleteMany({ _id: { $nin: ids }, blockId, roomId });

	res.sendData();
}

async function bulkUpdate(req, res) {
	const { roomId, blockId, items } = req.body;

	const bulks = await items.asyncMap(async item => {
		if (item.action === 'DELETE') {
			const rs = await FormModel.findByIdAndDelete(item.asset._id).catch(e => {
				logger.error(e);
			});
			return {
				action: item.action,
				data: rs,
				success: !!rs,
			};
		}
		if (item.action === 'CREATE') {
			validateAttrs(item.asset.attributes);
			const data = await FormModel.create({
				...item.asset,
				blockId,
				roomId: roomId || null,
			}).catch(e => {
				logger.error(e);
			});
			return {
				action: item.action,
				success: !!data,
				data,
			};
		}
		if (item.action === 'UPDATE') {
			validateAttrs(item.asset.attributes);
			const data = await FormModel.findByIdAndUpdate(
				item.asset._id,
				{
					...item.asset,
				},
				{
					new: true,
				}
			).catch(e => {
				logger.error(e);
			});
			return {
				action: item.action,
				success: !!data,
				data,
			};
		}

		return {
			action: item.action,
			success: false,
		};
	});

	res.sendData(bulks);
}

module.exports = { modify, groupByList, bulkUpdate, list };
