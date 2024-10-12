const schedule = require('node-schedule');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { DELAY_MINUTE_CHECK_HEADER } = require('@utils/const');
const crawler = require('@controllers/ota_api/crawler_reservations');
const { updateOTAConfig } = require('@controllers/ota_helper');
const models = require('@models');

async function checkAndUpdateOTAsSession() {
	await Object.keys(crawler)
		.filter(ota => crawler[ota].checkApi)
		.asyncMap(async ota => {
			const otas = await models.OTAManager.findActiveOTAs({ otaName: ota });

			return _.uniqBy(otas, 'username').asyncForEach(async otaInfo => {
				try {
					const ok = await crawler[ota].checkApi(otaInfo);
					if (!ok) {
						logger.warn('SYNC: keepOTAsSession -> checkApi', otaInfo.name, otaInfo.account);
						await updateOTAConfig(otaInfo);
					}
				} catch (e) {
					logger.error('keepOTAsSession', e);
				}
			});
		});
}

schedule.scheduleJob(`*/${DELAY_MINUTE_CHECK_HEADER} * * * *`, checkAndUpdateOTAsSession);
