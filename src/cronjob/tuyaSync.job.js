const schedule = require('node-schedule');
const _ = require('lodash');

const models = require('@models');
const { logger } = require('@utils/logger');
const TuyaClient = require('@controllers/lock/tuya/tuyaClient');
const { AccountConfigTypes, AccountProvider } = require('@utils/const');

const MINUTE = 30;

async function syncTuyaHomeAndDevices() {
	try {
		const tuyaConfig = await models.AccountConfig.findOne({
			active: true,
			accountType: AccountConfigTypes.API,
			provider: AccountProvider.TUYA,
		}).lean();

		if (!tuyaConfig) logger.error('Tuya Authorization does not exist');

		const { accessKey, secretKey } = tuyaConfig.authorizationKey || {};

		const params = { accessKey, secretKey, uid: _.get(tuyaConfig, 'others.appAccountUID', '') };
		const tuyaClient = new TuyaClient(params);

		const homes = await tuyaClient.getHomes();
		const devices = await homes.asyncMap(home => tuyaClient.getDevicesByHomeId(home.home_id));

		const deviceBulks = [];
		_.flatten(devices).forEach(device => {
			const { id, owner_id, name, product_name, create_time, status, model, error_code } = device;
			const batteryState = _.find(status, ({ code }) => code === 'battery_state') || {};
			if (error_code === 1) return;

			const bulk = {
				updateOne: {
					filter: { deviceId: id },
					update: {
						homeId: owner_id,
						deviceId: id,
						deviceName: name,
						model,
						type: product_name,
						createAt: create_time,
						batteryState: batteryState.value || '',
					},
					upsert: true,
				},
			};

			deviceBulks.push(bulk);
		});

		const homeBulks = homes.map(home => ({
			updateOne: {
				filter: { homeId: home.home_id },
				update: {
					homeId: home.home_id,
					...home,
				},
				upsert: true,
			},
		}));

		await Promise.all([models.TuyaHome.bulkWrite(homeBulks), models.TuyaDevice.bulkWrite(deviceBulks)]);
	} catch (error) {
		logger.error(error);
	}
}

schedule.scheduleJob(`*/${MINUTE} * * * *`, syncTuyaHomeAndDevices);
