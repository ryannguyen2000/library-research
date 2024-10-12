const _ = require('lodash');
const mongoose = require('mongoose');
const { PromotionType, OTANotHaveProperty, PromotionChangeType } = require('@utils/const');

const { Schema } = mongoose;
const { Mixed } = Schema.Types;

const PromotionSchema = new Schema(
	{
		// info
		promoType: { type: String, default: PromotionType.Basic, enum: Object.values(PromotionType) },
		name: String,
		active: { type: Boolean, default: true },
		manual: { type: Boolean, default: true },

		// time range
		timeFormat: { type: String, enum: ['Day', 'Hour'] },
		startHour: Number,
		startDate: Date,
		endDate: Date,
		dayOfWeeks: String,
		bookStartDate: Date,
		bookEndDate: Date,
		bookDayOfWeeks: String,
		numOfRoom: Number,

		discount_amount: Number,
		additional_discount_amount: Number,
		discount_type: { type: String, enum: Object.values(PromotionChangeType) },
		early_booker_amount: Number,
		last_minute_amount_days: Number,
		last_minute_amount_hours: Number,
		last_minute_unit: Number,
		min_stay_through: Number,
		secretDeal: Boolean,
		genius: Boolean,
		smart: Boolean,

		// ota info
		otaIds: [{ _id: false, ota: String, account: String, propertyId: String, meta: Mixed }],
		activeOTAs: [String],
		tags: [Mixed],
		realDiscount: Mixed,
		discount: Number,
		data: Mixed,

		// ...Object.values(OTAs)
		// 	.filter(o => !o.includes('.'))
		// 	.reduce((a, c) => ({ ...a, [c]: Mixed }), {}),
	},
	{
		timestamps: true,
	}
);

PromotionSchema.methods.getMetadata = function (otaName, account, propertyId) {
	const finder = OTANotHaveProperty.includes(otaName)
		? value => value.ota === otaName
		: value => value.ota === otaName && (!propertyId || value.propertyId === propertyId);

	const id = _.find(this.otaIds, finder);
	return id ? id.meta : null;
};

// PromotionSchema.statics.create = async function (data) {
// 	const [ota] = data.activeOTAs;

// 	let doc = await this.findOne({
// 		promoType: data.promoType,
// 		name: data.name,
// 		activeOTAs: data.activeOTAs,
// 		'otaIds.ota': ota,
// 	});

// 	if (doc) {
// 		delete data.otaIds;
// 		Object.assign(doc, data);
// 	} else {
// 		doc = new this(data);
// 	}

// 	await doc.save();
// 	return doc;
// };

PromotionSchema.statics.createMeta = async function (_id, meta, otaName, account, propertyId) {
	return await this.updateOne(
		{ _id },
		{
			$push: {
				otaIds: {
					ota: otaName,
					account,
					propertyId,
					meta,
				},
			},
		}
	);
};

PromotionSchema.statics.updateMeta = async function (_id, meta, otaName, account, propertyId) {
	const filter = {
		_id,
		otaIds: {
			$elemMatch: { ota: otaName },
		},
	};

	if (Array.isArray(meta.listingIds)) {
		meta.listingIds = _.uniq(meta.listingIds);
	}

	if (propertyId && !OTANotHaveProperty.includes(otaName)) {
		filter.otaIds.$elemMatch.propertyId = propertyId;
	}

	const promo = await this.findOne(filter);

	return promo
		? await this.updateOne(filter, {
				$set: { 'otaIds.$.meta': meta },
		  })
		: await this.updateOne(
				{ _id },
				{
					$push: {
						otaIds: {
							ota: otaName,
							account,
							propertyId,
							meta,
						},
					},
				}
		  );
};

PromotionSchema.statics.removeMeta = async function (_id, otaName, account, propertyId) {
	const filter = {
		ota: otaName,
	};
	if (!OTANotHaveProperty.includes(otaName)) {
		filter.propertyId = propertyId;
	}

	return await this.updateOne({ _id }, { $pull: { otaIds: filter } });
};

module.exports = mongoose.model('Promotion', PromotionSchema, 'promotion');
