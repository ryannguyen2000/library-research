const _ = require('lodash');
const router = require('@core/router').Router();
const file = require('@controllers/resource/file');

async function getFiles(req, res) {
	const rs = await file.getFiles({ ...req.query, user: req.decoded.user, lang: req.language });
	res.sendData(rs);
}

async function getOttAssets(req, res) {
	const { groupId: zaloGroupId, ottName } = req.params;
	const { start, limit } = req.query;

	let rs;
	if (ottName === 'zalo') {
		rs = await file.getZaloFiles({ start, limit, ottIds: [zaloGroupId] });
	}

	res.sendData(rs);
}

async function getZaloAssets(req, res) {
	const { start, limit, type, fromMe } = req.query;

	const ottIds = await file.getZaloAssetGroupId({ type, fromMe: fromMe === 'true', user: req.decoded.user });
	const rs = await file.getZaloFiles({ start, limit, ottIds });

	res.sendData(rs);
}

async function createFile(req, res) {
	const rs = await file.createFile(req.body, req.decoded.user, req.query);

	if (rs && rs.blockIds) {
		_.set(req, ['logData', 'blockId'], rs.blockIds[0]);
	}

	res.sendData(rs);
}

// async function uploadFolder(req, res) {
// 	const rs = await file.uploadFolder(req.decoded.user, req.files, req.body.parent);
// 	res.sendData(rs);
// }

async function updateFile(req, res) {
	const rs = await file.updateFile(req.params.resourceId, req.body, req.decoded.user);
	if (rs && rs.blockIds) {
		_.set(req, ['logData', 'blockId'], rs.blockIds[0]);
	}

	res.sendData(rs);
}

async function deleteFile(req, res) {
	const removedFile = await file.deleteFile(req.params.resourceId, req.decoded.user);

	if (removedFile && removedFile.blockIds) {
		_.set(req, ['logData', 'blockId'], removedFile.blockIds[0]);
	}

	res.sendData();
}

async function moveFolders(req, res) {
	const data = await file.moveFiles(req.body, req.decoded.user);

	res.sendData(data);
}

async function duplicateFiles(req, res) {
	const data = await file.duplicateFiles(req.body, req.decoded.user);

	res.sendData(data);
}

router.getS('/', getFiles, true);
router.getS('/download', file.download, true);
router.getS('/:ottName/:groupId', getOttAssets, true);

router.postS('/', createFile, true);
router.postS('/zalo-assets', getZaloAssets, true);
router.postS('/moving', moveFolders, true);
router.postS('/duplicate', duplicateFiles, true);

router.putS('/:resourceId', updateFile, true);
router.deleteS('/:resourceId', deleteFile, true);

const activity = {
	RESOURCE_FILE_CREATE: {
		key: '/',
		exact: true,
	},
	RESOURCE_FILE_UPDATE: {
		key: '/{id}',
		method: 'PUT',
		exact: true,
	},
	RESOURCE_FILE_DELETE: {
		key: '/{id}',
		method: 'DELETE',
	},
};

module.exports = { router, activity };
