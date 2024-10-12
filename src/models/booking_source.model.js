const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;

const BookingSource = new Schema(
	{
		name: String,
		label: String,
		group: String,
		description: String,
		ignoreFinance: Boolean,
		color: String,
		order: Number,
		extend: Boolean,
	},
	{
		timestamps: true,
	}
);

BookingSource.index({ name: 1, group: 1 }, { unique: true });

BookingSource.statics = {
	async getSourceByGroup(otas) {
		const data = await this.find({ group: otas }).select('group name');
		if (data.length) {
			return _.uniq([...data.map(i => i.name), ...otas.filter(o => !data.some(s => s.group === o))]);
		}

		return otas;
	},

	// async getSourceConfig({ otaName, blockId, createdAt }) {
	// 	const source = await this.findOne({ name: otaName });
	// 	if (!source) return;

	// 	const group = await this.model('BookingSourceGroup').findOne({ name: source.group });
	// 	if (!group) return;

	// 	const config = _.find(
	// 		group.configs,
	// 		c =>
	// 			(c.blockIds && c.blockIds.length ? c.blockIds.includesObjectId(blockId) : true) &&
	// 			(c.startDate ? c.startDate <= createdAt : true) &&
	// 			(c.endDate ? c.endDate >= createdAt : true)
	// 	);

	// 	return config;
	// },
};

module.exports = mongoose.model('BookingSource', BookingSource, 'booking_source');
