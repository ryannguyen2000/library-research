const router = require('@core/router').Router();
const models = require('@models');
const restful = require('@routes/restful.base');
const asset = require('./asset.subrouter');
const asset_confirmation = require('./asset_confirmation.subrouter');
const asset_action = require('./asset_action.subrouter');
const asset_kind = require('./assetkind.subrouter');
const asset_history = require('./asset_history.subrouter');
const asset_issue = require('./asset_issue.subrouter');

const SubRouters = {
	asset_action: {
		module: asset_action,
		name: 'asset_action',
		Model: models.AssetAction,
		skipPaniagation: true,
	},
	asset_kind: {
		module: asset_kind,
		name: 'asset_kind',
		Model: models.AssetKind,
		skipPaniagation: true,
	},
	asset_package: {
		module: {},
		name: 'asset_package',
		Model: models.AssetPackage,
		skipPaniagation: true,
	},
	asset_confirmation: {
		module: asset_confirmation,
		name: 'asset_confirmation',
		Model: models.AssetConfirmation,
		skipPaniagation: true,
	},
	asset_issue: {
		module: asset_issue,
		name: 'asset_issue',
		Model: models.AssetIssue,
		skipPaniagation: true,
	},
	asset_issue_type: {
		module: {},
		name: 'asset_issue_type',
		Model: models.AssetIssueType,
		skipPaniagation: true,
	},
};

const activity = {};

router.getS('/asset_issue/statictis', asset_issue.statictis);

Object.entries(SubRouters).forEach(([key, cfg]) => {
	router.postS(`/${key}`, async (req, res) => await restful.create(req, res, cfg));
	router.getS(`/${key}`, async (req, res) => await restful.list(req, res, cfg));
	router.getS(`/${key}/:id`, async (req, res) => await restful.view(req, res, cfg));
	router.putS(`/${key}/:id`, async (req, res) => await restful.modify(req, res, cfg));
	router.deleteS(`/${key}/:id`, async (req, res) => await restful.del(req, res, cfg));

	const pre = `ASSET_${key.toUpperCase()}`;

	activity[`${pre}_CREATE`] = {
		method: 'POST',
		key: `/${key}`,
	};

	activity[`${pre}_UPDATE`] = {
		method: 'PUT',
		key: `/${key}`,
	};

	activity[`${pre}_DELETE`] = {
		method: 'DELETE',
		key: `/${key}`,
	};
});

router.getS('/asset', asset.groupByList);
router.getS('/asset/list', asset.list);
router.putS('/asset', asset.modify);
router.putS('/asset/bulk', asset.bulkUpdate);

router.putS('/asset_confirmation/:id/bulk', asset_confirmation.bulkUpdate);
router.putS('/asset_confirmation/:id/approve', asset_confirmation.approve);

router.putS('/asset_action/approve/:id', asset_action.approve);

router.postS('/asset_issue/:id/status', asset_issue.changeStatus);
router.postS('/asset_issue/:id/merge', asset_issue.merge);
router.getS('/asset_issue/:id/task', asset_issue.getTasks);
router.getS('/asset_issue/:id/history', asset_issue.getHistories);

router.getS('/history', asset_history.getHistories);
router.getS('/history/date', asset_history.getHistoryDates);
router.getS('/history/download', asset_history.dowloadHistories);

router.putS('/history/:historyId', asset_history.updateHistory);
router.deleteS('/history/:historyId', asset_history.deleteHistory);
router.getS('/history/:historyId/asset-issue', asset_history.getAssetIssues);
router.postS('/history/:historyId/asset-issue/assign', asset_history.addAssetIssues);
router.deleteS('/history/:historyId/asset-issue/assign', asset_history.removeAssetIssues);

router.postS('/:assetId/history/:historyId/assign', asset_history.assignAssetToHistory);
router.deleteS('/:assetId/history/:historyId/assign', asset_history.removeAssetFromHistory);

activity.ASSET_UPDATE = {
	method: 'PUT',
	key: '/asset',
	exact: true,
};
activity.ASSET_BULK_UPDATE = {
	method: 'PUT',
	key: '/asset/bulk',
	exact: true,
};
activity.ASSET_ACTION_APPROVE = {
	method: 'PUT',
	key: '/asset_action/approve',
};
activity.ASSET_CONFIRMATION_APPROVE = {
	method: 'PUT',
	key: '/asset_confirmation/{id}/approve',
	exact: true,
};
activity.ASSET_CONFIRMATION_BULK_UPDATE = {
	method: 'PUT',
	key: '/asset_confirmation/{id}/bulk',
	exact: true,
};
activity.ASSET_HISTORY_ASSIGN = {
	method: 'PUT',
	key: '/{id}/history/{id}/assign',
	exact: true,
};
activity.ASSET_HISTORY_REMOVE = {
	method: 'DELETE',
	key: '/{id}/history/{id}/assign',
	exact: true,
};
activity.ASSET_ISSUE_UPDATE = {
	method: 'POST',
	key: '/history/{id}/update_asset_issue',
	exact: true,
};
activity.HISTORY_REMOVE_ASSET_ISSUE = {
	method: 'POST',
	key: '/history/{id}/asset-issue/assign',
	exact: true,
};
activity.HISTORY_ASSIGN_ASSET_ISSUE = {
	method: 'DELETE',
	key: '/history/{id}/asset-issue/assign',
	exact: true,
};
activity.ASSET_ISSUE_MERGE = {
	method: 'POST',
	key: '/asset_issue/:id/merge',
	exact: true,
};
activity.ASSET_ISSUE_CHANGE_STATUS = {
	method: 'POST',
	key: '/asset_issue/:id/status',
	exact: true,
};
activity.ASSET_ISSUE_REMOVE = {
	method: 'DELETE',
	key: '/asset_issue/:id',
	exact: true,
};

module.exports = { router, activity };
