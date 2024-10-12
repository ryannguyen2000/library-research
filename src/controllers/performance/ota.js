const mongoose = require('mongoose');

const { logger } = require('@utils/logger');
const models = require('@models');
const apis = require('@controllers/ota_api/crawler_performance');

const { ObjectId } = mongoose.Types;

async function getPerformance(query) {
	const { blockId, ota, account, from, to } = query;
	const $match = {
		date: { $gte: new Date(from), $lte: new Date(to) },
	};
	if (blockId) $match.blockId = ObjectId(blockId);
	if (ota) $match.otaName = ota;
	if (account) $match.account = account;

	const results = await models.Performance.aggregate([
		{
			$match,
		},
		{ $project: { _id: 0, date: 1, bookings: 1, property_views: 1, result_views: 1, total_score: 1, score: 1 } },
		{
			$group: {
				_id: null,
				dates: { $push: '$$ROOT' },
				bookings: { $sum: '$bookings' },
				property_views: { $sum: '$property_views' },
				result_views: { $sum: '$result_views' },
				total_score: { $last: '$total_score' },
				score: { $last: '$score' },
			},
		},
	]);

	return results && results[0];
}

async function fetchPerformance() {
	const m1 = { 'OTAProperties.otaName': { $in: Object.keys(apis).filter(ota => apis[ota].get) } };

	const blocks = await models.Block.aggregate([
		{ $match: { active: true, isTest: false, isProperty: true, ...m1 } },
		{ $project: { OTAProperties: 1 } },
		{ $unwind: '$OTAProperties' },
		{ $match: m1 },
	]);

	const bulks = [];

	await blocks.asyncForEach(async block => {
		try {
			const { otaName, propertyId, account } = block.OTAProperties;

			const [otaConfig] = await models.OTAManager.findByName(otaName, account);
			if (!otaConfig) return;

			const stats = await apis[otaName].get(otaConfig, propertyId);

			if (!stats || !stats.length) return;

			stats.forEach(data => {
				bulks.push({
					updateOne: {
						filter: {
							blockId: block._id,
							date: data.date,
							otaName,
							account,
						},
						update: {
							$set: data,
						},
						upsert: true,
					},
				});
			});
		} catch (e) {
			logger.error(e);
		}
	});

	if (bulks.length) await models.Performance.bulkWrite(bulks);
}

module.exports = {
	getPerformance,
	fetchPerformance,
};
