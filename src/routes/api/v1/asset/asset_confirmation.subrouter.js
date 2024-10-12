const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const mongoose = require('@utils/mongoose');
const { logger } = require('@utils/logger');

const FormModel = models.AssetConfirmation;

async function list(req, res) {
	const { start = 0, limit = 20, blockId, excludeBlockId, ...query } = req.query;

	const { blockIds } = await models.Host.getBlocksOfUser({
		user: req.decoded.user,
		filterBlockIds: blockId,
		excludeBlockId,
	});

	const data = await FormModel.find({ ...query, blockId: blockIds })
		.sort({ createdAt: -1 })
		.skip(start)
		.limit(limit)
		.populate('blockId', 'info.name')
		.populate('createdBy', 'username name')
		.populate('approved.userId', 'username name');

	const total = await FormModel.countDocuments(query);

	return res.sendData({ assets_confirmation: data, total });
}

async function create(req, res) {
	const { blockId, name, description } = req.body;

	const block = await models.Block.findById(blockId).select('_id');
	if (!block) throw new ThrowReturn('Nhà không tồn tại!');

	const confirmed = await FormModel.findOne({ blockId }).select('_id');
	if (confirmed) throw new ThrowReturn('Bàn giao đã tồn tại!');

	const assets = await models.Asset.aggregate([{ $match: { blockId: block._id } }]);

	const asset_confirmation = await FormModel.create({
		blockId: block._id,
		name,
		description,
		createdBy: req.decoded.user._id,
	});

	await models.AssetActive.insertMany(
		assets.map(asset => {
			asset.attributes.forEach(att => {
				if (att.value === null) delete att.value;
			});
			return {
				...asset,
				confirmationId: asset_confirmation._id,
			};
		})
	);

	res.sendData({ asset_confirmation });
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
	const { id } = req.params;
	const { name, description, roomId = null, blockId, assets } = req.body;

	let data = await FormModel.findById(id);

	if (!data) {
		throw new ThrowReturn('Form không tồn tại!');
	}
	if (data.approved.length > 0) {
		throw new ThrowReturn('Form đã duyệt không thể sửa');
	}

	if (name !== undefined) data.name = name;
	if (description !== undefined) data.description = description;
	if (blockId) data.blockId = blockId;

	if (Array.isArray(assets)) {
		await models.AssetActive.deleteMany({ blockId: data.blockId, roomId });
		await models.AssetActive.insertMany(
			assets.map(asset => {
				validateAttrs(asset.attributes);

				return {
					...asset,
					confirmationId: data._id,
					blockId: data.blockId,
					roomId,
				};
			})
		);
	}

	await FormModel.updateOne({ _id: data._id }, { $set: data });

	res.sendData();
}

async function view(req, res) {
	const { id } = req.params;
	const { roomId, getAll = false } = req.query;

	let asset_confirmation = await FormModel.findById(id)
		.populate('createdBy', 'username name')
		.populate('approved.userId', 'username name')
		.then(a => a && a.toJSON());

	if (!asset_confirmation) {
		asset_confirmation = await FormModel.findOne({ blockId: id })
			.populate('createdBy', 'username name')
			.populate('approved.userId', 'username name')
			.then(a => a && a.toJSON());
	}

	if (!asset_confirmation) throw new ThrowReturn('Không tìm thấy form');
	const query = {
		confirmationId: asset_confirmation._id,
		roomId: roomId || null,
	};

	if (JSON.parse(getAll)) {
		delete query.roomId;
	}

	const assets = await models.AssetActive.find(query).sort({ order: 1 });

	asset_confirmation.ordered = _.uniq(_.map(assets, 'label'));
	asset_confirmation.assets = _.groupBy(assets, 'label');

	return res.sendData({ asset_confirmation });
}

async function del(req, res) {
	const { id } = req.params;
	const data = await FormModel.findById(id);
	if (!data) {
		throw new ThrowReturn('Không tìm thấy form');
	}
	if (data.approved.length) {
		throw new ThrowReturn('Form đã duyệt không thể xóa');
	}
	await FormModel.deleteOne({ _id: data._id });
	await models.AssetActive.deleteMany({ confirmationId: data._id });

	res.sendData();
}

async function approve(req, res) {
	const { id } = req.params;
	let { undo, index } = req.body;
	const { user } = req.decoded;
	const userId = user._id;

	const form = await FormModel.findById(id);

	if (!form) throw new ThrowReturn('Không tìm thấy form!');
	if (_.isUndefined(index)) {
		index = form.approved.findIndex(a => userId.equals(a.userId));
	}

	if (undo === true) {
		if (!form.approved[index]) throw new ThrowReturn('Thông tin duyệt không tồn tại!');

		const isAccept = await user.isHigherRole(form.approved[index].userId);
		if (!isAccept && !form.approved[index].userId.equals(userId)) {
			throw new ThrowReturn().status(403);
		}
		form.approved.splice(index, 1);
	} else if (form.approved.length > 1) {
		throw new ThrowReturn('Form đã duyệt rồi!');
	} else {
		form.approved.push({
			time: new Date(),
			userId,
		});
	}

	if (form.approved.length === 2) {
		// update asset after approved
		const assets = await models.AssetActive.aggregate([{ $match: { confirmationId: form._id } }]);

		await models.Asset.deleteMany({ blockId: form.blockId });
		await models.Asset.insertMany(assets);
	}

	await form.save();
	const rs = await FormModel.findById(id).select('approved').populate('approved.userId', 'username name');

	res.sendData({ form: rs });
}

async function bulkUpdate(req, res) {
	const { id } = req.params;
	const { roomId, name, description, items = [] } = req.body;

	const assetApproved = await FormModel.findById(id);
	if (!assetApproved) {
		throw ThrowReturn().status(404);
	}

	if (name !== undefined) assetApproved.name = name;
	if (description !== undefined) assetApproved.description = description;
	await assetApproved.save();

	const bulks = await items.asyncMap(async item => {
		const rs = { action: item.action, success: true };
		if (item.action === 'DELETE') {
			rs.data = await models.AssetActive.findByIdAndDelete(item.asset._id).catch(e => {
				logger.error(e);
				rs.errorMsg = e.toString();
				rs.success = false;
			});
			return rs;
		}
		if (item.action === 'CREATE') {
			validateAttrs(item.asset.attributes);
			rs.data = await models.AssetActive.create({
				...item.asset,
				confirmationId: assetApproved._id,
				blockId: assetApproved.blockId,
				roomId: roomId || null,
			}).catch(e => {
				logger.error(e);
				rs.errorMsg = e.toString();
				rs.success = false;
			});
			return rs;
		}
		if (item.action === 'UPDATE') {
			validateAttrs(item.asset.attributes);
			rs.data = await models.AssetActive.findByIdAndUpdate(
				item.asset._id,
				{
					...item.asset,
				},
				{
					new: true,
				}
			).catch(e => {
				logger.error(e);
				rs.errorMsg = e.toString();
				rs.success = false;
			});
			return rs;
		}

		rs.success = false;
		rs.errorMsg = 'Invalid Action!';

		return rs;
	});

	res.sendData(bulks);
}

module.exports = { view, modify, del, list, create, approve, bulkUpdate };
