const mongoose = require('mongoose');
const { STATIC_CONTENT_TYPE } = require('@utils/const');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const BlockStaticSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		sourceBlockId: { type: Number },
		sourceRoomTypeId: { type: Number },
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		otaListingId: String,
		// roomNos: [String],
		contentType: { type: String, enum: Object.values(STATIC_CONTENT_TYPE) },
		content: {
			id: Mixed,
			address: Mixed,
			vr: Mixed,
			images: Mixed,
			videos: Mixed,
			operator: Mixed,
			facilities: Mixed,
			amenities: Mixed,
			seo: Mixed,
			service: Mixed,
			area: Mixed,
			review: Mixed,
			type: Mixed,
			typeId: Mixed,
			occupancy: Mixed,
			info: Mixed,
			faqs: Mixed,
			types: Mixed,
			tags: Mixed,
			tagsEn: Mixed,
			direction: Mixed,
			description: Mixed,
			place: Mixed,
			districtId: Mixed,
			provinceId: Mixed,
			streetId: Mixed,
			wardId: Mixed,
			displayNames: Mixed,
			layout: Mixed,
			mapStatic: Mixed,
			slug: Mixed,
			stags: Mixed,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('BlockStaticContent', BlockStaticSchema, 'block_static_content');
