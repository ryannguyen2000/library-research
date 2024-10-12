const _ = require('lodash');
const mongoose = require('mongoose');

const ThrowReturn = require('@core/throwreturn');
const { AssetActions, Currency } = require('@utils/const');
const Asset = require('./asset.model');

const { Schema, Custom } = mongoose;
const { ObjectId } = Schema.Types;

const AssetActionSchema = new Schema(
	{
		name: String,
		blockId: Custom.Ref({ ref: 'Block', required: true, type: ObjectId }),
		roomId: Custom.Ref({ ref: 'Room', type: ObjectId }),
		payoutId: { ref: 'Payout', type: ObjectId },
		currentAsset: Asset.Asset,
		newAsset: Asset.Asset,
		action: {
			type: String,
			required: true,
			enum: Object.values(AssetActions),
		},
		fee: Number,
		currency: { type: String, default: Currency.VND },
		createdBy: { ref: 'User', required: true, type: ObjectId },
		approved: [
			{
				time: Date,
				userId: {
					ref: 'User',
					type: ObjectId,
				},
			},
		],
		description: String,
	},
	{
		timestamps: true,
		versionKey: false,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

AssetActionSchema.virtual('taskId', {
	ref: 'Task',
	localField: '_id',
	foreignField: 'assetActionId',
});

AssetActionSchema.methods = {
	async validateApprove() {
		if (this.approved.length) {
			throw new ThrowReturn('Yêu cầu đã duyệt rồi!');
		}
		return true;
	},
	isApproved() {
		return this.approved.length;
	},
};

AssetActionSchema.statics = {
	async createOrUpdate(data) {
		const doc = data._id ? await this.findById(data._id) : new this(data);
		if (!doc) {
			throw new ThrowReturn('Not found!');
		}
		if (data.action === AssetActions.DELETE) {
			delete data.newAsset;
		}
		if (data.action === AssetActions.NEW) {
			delete data.currentAsset;
		}
		if (data.currentAsset) {
			data.currentAsset = await this.model('AssetActive').findById(data.currentAsset._id).lean();
			if (!data.currentAsset) {
				throw new ThrowReturn('Current Asset not found!');
			}
		}
		if (!data._id && data.newAsset && data.newAsset._id) {
			const _newAsset = await this.model('AssetActive').findById(data.newAsset._id);
			if (_newAsset && data.newAsset._id.toString() !== data.currentAsset._id.toString()) {
				throw new ThrowReturn('New Asset already exists!');
			}
		}
		if (data.newAsset) {
			data.newAsset.kindId = data.newAsset.kindId || _.get(data, 'currentAsset.kindId') || data.newAsset._id;
			data.newAsset.blockId = data.newAsset.blockId || data.blockId;
		}

		Object.assign(doc, data);
		await doc.save();

		return doc;
	},

	async del(id) {
		// const data = await this.findById(id);
		// if (!data) {
		// 	throw new ThrowReturn('Form not found!');
		// }
		// if (data.approved.length) {
		// 	throw new ThrowReturn('Form already approved!');
		// }
		await this.deleteOne({ _id: id });
	},

	async approve(id, userId) {
		const form = await this.findById(id);
		if (!form) {
			throw new ThrowReturn('Không tìm thấy form!');
		}

		// await form.validateApprove();

		if (form.action !== AssetActions.DELETE) {
			const assetConfirmation = await this.model('AssetConfirmation').findOne({ blockId: form.blockId });
			const dataUpdate = form.toJSON().newAsset;

			dataUpdate.blockId = form.blockId || dataUpdate.blockId || _.get(form, 'currentAsset.blockId');
			dataUpdate.roomId = form.roomId || dataUpdate.roomId || _.get(form, 'currentAsset.roomId');
			dataUpdate.confirmationId = assetConfirmation && assetConfirmation._id;
			dataUpdate.kindId = dataUpdate.kindId || _.get(form, 'currentAsset.kindId') || dataUpdate._id;
			delete dataUpdate._id;

			if (form.currentAsset && form.currentAsset._id) {
				await this.model('AssetActive').updateOne(
					{ _id: form.currentAsset._id },
					_.omit(dataUpdate, ['nameEn', 'labelEn'])
				);
			} else {
				await this.model('AssetActive').create(dataUpdate);
			}
		} else {
			await this.model('AssetActive').deleteOne({ _id: form.currentAsset._id });
		}

		form.approved.push({
			time: new Date(),
			userId,
		});
		await form.save();
	},
};

const AssetAction = mongoose.model('AssetAction', AssetActionSchema, 'asset_action');

module.exports = AssetAction;
