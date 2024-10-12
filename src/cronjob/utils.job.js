const schedule = require('node-schedule');
const models = require('@models');
const { logger } = require('@utils/logger');
const { LocalOTAs } = require('@utils/const');

const MINUTE = 30;

async function syncOrder(Model, key = 'order') {
	try {
		const docs = await Model.aggregate()
			.match({
				OTAs: {
					$elemMatch: {
						otaName: LocalOTAs.tbWeb,
						active: true,
					},
				},
				view: { $gt: 0 },
			})
			.project('_id view');

		const bulks = docs.map(doc => ({
			updateOne: {
				filter: {
					_id: doc._id,
				},
				update: {
					$set: {
						[key]: doc.view,
					},
				},
			},
		}));

		await Model.bulkWrite(bulks);
	} catch (e) {
		logger.error(e);
	}
}

schedule.scheduleJob(`*/${MINUTE} * * * *`, () => {
	syncOrder(models.Listing, 'order');
});
