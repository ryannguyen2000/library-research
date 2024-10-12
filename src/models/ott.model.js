const mongoose = require('mongoose');
const _ = require('lodash');
const { OTTs, OTAs } = require('@utils/const');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const schema = {
	phone: { type: String, unique: true },
	public: { type: Boolean, default: false },
	active: { type: Boolean, default: true },
	name: String,
	isOA: Boolean,
	hotline: Boolean,
	display: String,
	groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
	blockId: { type: ObjectId, ref: 'Block' },
};

[...Object.values(OTTs), OTAs.SMS].forEach(ott => {
	schema[ott] = Boolean;
	schema[`${ott}Info`] = Mixed;
});

const OttSchema = new Schema(schema, {
	timestamps: true,
});

OttSchema.statics = {
	async getGuideContact(blockId) {
		const otts = ['hotline', OTTs.Zalo, OTTs.Line, OTTs.WhatsApp, OTTs.Telegram, OTTs.Facebook];

		const data = await otts.asyncMap(async ott => {
			const filter = { active: true };
			if (ott === OTTs.Zalo) {
				filter.$or = [
					{
						[ott]: true,
						blockId,
					},
					{
						[OTTs.ZaloOA]: true,
					},
				];
			} else {
				filter.blockId = { $in: [blockId, null] };
				filter[ott] = true;
			}
			const doc = await this.findOne(filter).sort({ blockId: -1 }).lean();
			if (doc) {
				const name = ott === OTTs.Facebook ? 'messenger' : ott;
				return {
					name,
					dName: _.capitalize(name),
					title: _.get(doc, `${doc[ott] ? ott : OTTs.ZaloOA}Info.name`) || `+${doc.phone}`,
					link: _.get(doc, `${doc[ott] ? ott : OTTs.ZaloOA}Info.link`),
				};
			}
		});

		return data;
	},
};

module.exports = mongoose.model('Ott', OttSchema, 'ott');
