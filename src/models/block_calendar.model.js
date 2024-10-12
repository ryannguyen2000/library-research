const mongoose = require('mongoose');
// const _ = require('lodash');

const { rangeDate } = require('@utils/date');
// const { CurrencyConvert } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block', required: true, index: true },
		roomType: { type: String },
		roomTypeId: { type: ObjectId, ref: 'RoomType', required: true, index: true },
		ratePlanId: { type: Number, ref: 'RatePlan', index: true },
		date: { type: String, required: true, index: true }, // Y-MM-DD
		available: Number,
		price: Number,
		promotionPrice: Number,
		// for hour service
		priceFirstHours: Number,
		promotionPriceFirstHours: Number,
		priceAdditionalHours: Number,
		promotionPriceAdditionalHours: Number,
		unavailableHours: [{ fromHour: String, toHour: String }],
		// otas: [
		// 	{
		// 		_id: false,
		// 		ota: String,
		// 		price: Number,
		// 	},
		// ],
		// rates: [
		// 	{
		// 		_id: false,
		// 		ratePlanId: { type: Number, ref: 'RatePlan' },
		// 		price: Number,
		// 		promotionPrice: Number,
		// 		priceFirstHours: Number,
		// 		promotionPriceFirstHours: Number,
		// 		priceAdditionalHours: Number,
		// 		promotionPriceAdditionalHours: Number,
		// 	},
		// ],
	},
	{
		timestamps: true,
		versionKey: false,
		autoIndex: false,
	}
);

// function roundPrice(price) {
// 	if (!price) return price;
// 	return price < 500 ? CurrencyConvert.VND * price : price;
// }

ModelSchema.statics = {
	async syncPriceCalendar(data) {
		// data is price_history doc
		let dates = rangeDate(data.from, data.to).toArray();
		if (data.daysOfWeek) {
			dates = dates.filter(date => data.daysOfWeek.includes((date.getDay() + 1).toString()));
		}

		const keys = [
			'price',
			'priceFirstHours',
			'promotionPriceFirstHours',
			'priceAdditionalHours',
			'promotionPriceAdditionalHours',
		];
		const dataUpdate = {};

		keys.forEach(key => {
			const price = data[key];
			if (price) {
				dataUpdate[key] = price;
			}
		});

		const bulks = dates.map(date => ({
			updateOne: {
				filter: {
					blockId: data.blockId,
					roomTypeId: data.roomTypeId,
					ratePlanId: data.ratePlanId,
					date: date.toDateMysqlFormat(),
				},
				update: {
					$set: {
						...dataUpdate,
					},
				},
				upsert: true,
			},
		}));

		return await this.bulkWrite(bulks);
	},
};

module.exports = mongoose.model('BlockCalendar', ModelSchema, 'block_calendar');
