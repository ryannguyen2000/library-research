const _ = require('lodash');

const { Settings } = require('@utils/setting');
const router = require('@core/router').Router();
const models = require('@models');
const otaHelper = require('@controllers/ota_helper');
const { getReservationsOfOTAs } = require('@controllers/sync/crawler');
const Banking = require('@controllers/banking');

async function getAll(req, res) {
	const settings = await models.Setting.find({
		readOnly: { $ne: true },
	});
	res.sendData({ settings });
}

async function updateAll(req, res) {
	const { settings } = req.body;

	const results = await settings.asyncMap(async s => {
		const setting = await models.Setting.findOne({ key: s.key });
		if (!setting) {
			return {};
		}
		setting.value = s.value;
		await setting.save();
		return setting;
	});

	res.sendData({ settings: results });
}

async function otaRefresh(req, res) {
	const { otas, account } = req.body;

	const configs = await models.OTAManager.findActiveOTAs({
		groupIds: req.decoded.user.groupIds,
		otaName: otas,
		account,
	});

	await _.values(_.groupBy(configs, 'name')).asyncMap(cfgs => {
		return _.uniqBy(cfgs, 'username').asyncForEach(config => otaHelper.updateOTAConfig(config));
	});

	res.sendData();
}

async function crawler(req, res) {
	const groupOTAs = await models.OTAManager.find({
		groupIds: { $in: req.decoded.user.groupIds },
		name: req.body.otas,
	}).select('name');

	await getReservationsOfOTAs(
		_.uniq(_.map(groupOTAs, 'name')),
		req.body.from && new Date(req.body.from),
		req.body.to && new Date(req.body.to)
	);

	res.sendData();
}

async function getAutoResolveOverbook(req, res) {
	const setting = Settings.AutoResolveOverbook;

	res.sendData({ setting });
}

async function updateAutoResolveOverbook(req, res) {
	const setting = await models.Setting.getSetting(Settings.AutoResolveOverbook);

	setting.value = !!req.body.setting.value;
	await setting.save();

	res.sendData({ setting: _.pick(setting, _.keys(req.body.setting)) });
}

async function getBanks(req, res) {
	const data = await Banking.getBanks(req.decoded.user, req.query);

	res.sendData(data);
}

async function getBankAccounts(req, res) {
	const data = await Banking.getAccounts(req.decoded.user, req.query);

	res.sendData(data);
}

async function createBankAccount(req, res) {
	const data = await Banking.createAccount(req.decoded.user, req.body);

	res.sendData(data);
}

async function updateBankAccount(req, res) {
	const data = await Banking.updateAccount(req.decoded.user, req.params.accountId, req.body);

	res.sendData(data);
}

async function deleteBankAccount(req, res) {
	const data = await Banking.deleteAccount(req.decoded.user, req.params.accountId);

	res.sendData(data);
}

async function getBankServiceAccounts(req, res) {
	const data = await Banking.getServiceAccounts(req.decoded.user, req.query);

	res.sendData(data);
}

async function requestSubscribeBankingNotification(req, res) {
	const data = await Banking.requestSubscribeNotification(req.decoded.user, req.params.accountId);

	res.sendData(data);
}

async function confirmSubscribeBankingNotification(req, res) {
	const data = await Banking.confirmSubscribeNotification(req.decoded.user, req.params.accountId, req.body);

	res.sendData(data);
}

async function requestUnsubscribeBankingNotification(req, res) {
	const data = await Banking.requestUnsubscribeNotification(req.decoded.user, req.params.accountId);

	res.sendData(data);
}

async function confirmUnsubscribeBankingNotification(req, res) {
	const data = await Banking.confirmUnsubscribeNotification(req.decoded.user, req.params.accountId, req.body);

	res.sendData(data);
}

router.getS('/', getAll, true);
router.postS('/', updateAll, true);

router.getS('/autoResolveOverbook', getAutoResolveOverbook, true);
router.postS('/autoResolveOverbook', updateAutoResolveOverbook, true);

router.postS('/ota_refresh', otaRefresh, true);
router.postS('/crawler', crawler, true);

router.getS('/bank', getBanks);
router.getS('/bank/account', getBankAccounts);
router.postS('/bank/account', createBankAccount);
router.putS('/bank/account/:accountId', updateBankAccount);
router.deleteS('/bank/account/:accountId', deleteBankAccount);
router.getS('/bank/serviceAccount', getBankServiceAccounts);

router.postS('/bank/account/:accountId/subscribe/request', requestSubscribeBankingNotification);
router.postS('/bank/account/:accountId/subscribe/confirm', confirmSubscribeBankingNotification);
router.postS('/bank/account/:accountId/unsubscribe/request', requestUnsubscribeBankingNotification);
router.postS('/bank/account/:accountId/unsubscribe/confirm', confirmUnsubscribeBankingNotification);

const activity = {
	SETTING_RESOLVE_OVERBOOK: {
		key: 'autoResolveOverbook',
	},
	SETTING_BANK_SUBSCRIBE_REQUEST: {
		key: '/bank/account/{id}/subscribe/request',
		exact: true,
	},
	SETTING_BANK_SUBSCRIBE_CONFIRM: {
		key: '/bank/account/{id}/subscribe/confirm',
		exact: true,
	},
	SETTING_BANK_UNSUBSCRIBE_REQUEST: {
		key: '/bank/account/{id}/unsubscribe/request',
		exact: true,
	},
	SETTING_BANK_UNSUBSCRIBE_CONFIRM: {
		key: '/bank/account/{id}/unsubscribe/confirm',
		exact: true,
	},
};

module.exports = { router, activity };
