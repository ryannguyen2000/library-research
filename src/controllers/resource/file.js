const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const archiver = require('archiver');
const { v4: uuid } = require('uuid');
const mime = require('mime-types');

const { URL_CONFIG } = require('@config/setting');
const fetch = require('@utils/fetch');
const {
	DEFAULT_FOLDER_NAME,
	MessageGroupType,
	MessageGroupInternalType,
	OTTs,
	RESOURCE_FILE_TYPE,
	PROPERTY_TYPES,
} = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');

const models = require('@models');
const zaloService = require('@services/zalo/personal');
const { getVirtualFunction, getVirtualBreadCrumb, idDecode, isVirtualId } = require('./virtual');

const MAX_DEEP = 10;

async function findAdminPropertyIds(user, blockId) {
	const filter = {
		type: PROPERTY_TYPES.ADMIN,
		groupIds: { $in: user.groupIds },
	};
	if (blockId) {
		filter._id = blockId;
	}

	const blocks = await models.Block.find(filter).select('_id');

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blocks.map(b => b._id) });

	if (!blockIds.length) {
		throw new ThrowReturn().status(403);
	}

	return blockIds;
}

async function getBreadCrumb(parent, blockIds, lang = 'vi', deepLevel = 1) {
	if (!parent) return [];

	const folders = await models.ResourceFile.aggregate()
		.match({
			_id: parent,
			deleted: false,
			isFolder: true,
			$or: [
				{
					blockIds: {
						$in: blockIds,
					},
				},
				{ blockIds: [] },
			],
		})
		.project({
			name: `$name.${lang}`,
			blockIds: 1,
			parent: 1,
			isFolder: 1,
			deleted: 1,
			editable: 1,
			isVirtual: 1,
			virtual: 1,
			createdBy: 1,
			updatedBy: 1,
			deletedBy: 1,
			createdAt: 1,
			rsId: 1,
		});
	const folder = _.first(folders);

	if (folder) {
		folder.blockIds = blockIds;
		if (folder.parent && deepLevel < MAX_DEEP) {
			return [folder, ...(await getBreadCrumb(folder.parent, blockIds, lang, deepLevel + 1))];
		}
		return [folder];
	}

	return [];
}

async function getFiles({ parent, isFolder, isGetBreadCrumb = true, blockId, user, category, lang, admin, ..._query }) {
	let breadCrumb;
	let virtualBreadCrumb;
	let resources;
	let amount = 0;
	let rParentId = '';
	let blockIds;

	let start = parseInt(_query.start) || 0;
	let limit = parseInt(_query.limit) || 20;
	const isVirtual = isVirtualId(parent);

	if (parent) {
		rParentId = isVirtual
			? mongoose.Types.ObjectId(_.get(idDecode(parent), 'parent'))
			: mongoose.Types.ObjectId(parent);
	}

	if (admin === '1') {
		blockIds = await findAdminPropertyIds(user);
	} else {
		if (!blockId && isVirtual && parent) {
			blockId = _.get(idDecode(parent), 'blockId');
		}
		({ blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId }));
	}

	if (isVirtual && parent) {
		const { type, ...virtualQuery } = idDecode(parent);
		const virtual = await getVirtualFunction(type, {
			..._query,
			...virtualQuery,
			parent,
			blockIds,
			start,
			limit,
			isFolder: isFolder ? isFolder === 'true' : undefined,
		});
		virtualBreadCrumb = await getVirtualBreadCrumb(parent, type);
		resources = virtual ? virtual.files : [];
		amount = virtual ? virtual.total : 0;
	} else {
		const query = {
			parent: rParentId || null,
			fileType: RESOURCE_FILE_TYPE.MANUAL,
			deleted: false,
			blockIds: { $in: [...blockIds, []] },
		};
		if (isFolder) {
			query.isFolder = isFolder === 'true';
			limit = 1000;
		}

		const [files, total] = await Promise.all([
			models.ResourceFile.aggregate()
				.match(query)
				.sort({ createdAt: -1 })
				.skip(start)
				.limit(limit)
				.project({
					name: `$name.${lang}`,
					blockIds: 1,
					parent: 1,
					resource: 1,
					isFolder: 1,
					deleted: 1,
					editable: 1,
					isVirtual: 1,
					virtual: 1,
					createdBy: 1,
					updatedBy: 1,
					deletedBy: 1,
					createdAt: 1,
					rsId: 1,
				}),
			models.ResourceFile.find(query).countDocuments(),
		]);

		if (files.length) {
			await models.ResourceUploading.populate(files, {
				path: 'resource',
			});
		}

		resources = files;
		amount = total;
	}

	if (isGetBreadCrumb !== 'false') {
		breadCrumb = await getBreadCrumb(rParentId, blockIds, lang);
		breadCrumb.reverse();
	}

	return {
		resources,
		breadCrumb: isGetBreadCrumb !== 'false' ? [...breadCrumb, ...(virtualBreadCrumb || [])] : [],
		total: amount,
		start,
		limit,
	};
}

async function createFile(body, user, query = {}) {
	body.blockIds = _.compact(body.blockId ? [body.blockId] : body.blockIds);

	if (!body.blockIds.length && query.admin === '1') {
		body.blockIds = await findAdminPropertyIds(user);
	} else {
		({ blockIds: body.blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: body.blockIds }));
	}

	if (!body.blockIds.length) {
		throw new ThrowReturn().status(403);
	}

	if (body.isVirtual && body.parent) {
		const parentIdBulks = _.map(await getBreadCrumb(body.parent, body.blockIds), ({ _id }) => ({
			updateOne: {
				filter: {
					_id,
				},
				update: {
					editable: false,
				},
				upsert: true,
			},
		}));
		models.ResourceFile.bulkWrite(parentIdBulks);
	}

	if (_.includes(body.url, URL_CONFIG.SERVER) && !body.resource) {
		const fileName = _.last(_.split(body.url, '/'));
		const mimetype = mime.lookup(path.extname(fileName));

		const resourceUploading = await models.ResourceUploading.create({
			_id: uuid(),
			path: body.url,
			originName: fileName,
			mimetype,
			createdBy: user._id,
		});
		body.resource = resourceUploading._id;
		if (!body.name) {
			body.name = {
				vi: fileName,
				en: fileName,
			};
		}
	}

	const file = await models.ResourceFile.create({
		...body,
		createdBy: user._id,
	});

	return file;
}

async function updateFile(id, body, user) {
	const folder = await models.ResourceFile.findOne({
		_id: id,
		editable: true,
		deleted: false,
	});
	if (!folder) {
		throw new ThrowReturn().status(404);
	}

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: folder.blockIds });
	if (!blockIds.length) {
		throw new ThrowReturn().status(403);
	}

	if (!folder) throw new ThrowReturn('Can not update file.');
	const keys = ['name', 'parent'];
	Object.assign(folder, { ..._.pick(body, keys), updatedBy: user._id });
	await folder.save();

	return folder;
}

async function checkIsDeleteValid(parent) {
	const folders = await models.ResourceFile.find({ parent, deleted: false }).select('editable name parent').lean();
	if (_.isEmpty(folders)) return;

	await folders.asyncMap(folder => {
		if (!folder.parent) return;
		if (folder.editable === false) {
			throw new ThrowReturn('Can not delete folder');
		}

		return checkIsDeleteValid(folder._id);
	});
}

async function deleteFile(id, user, validate = true) {
	if (!mongoose.Types.ObjectId.isValid(id)) throw new ThrowReturn('resourceId invalid');

	const file = await models.ResourceFile.findOne({ _id: id, editable: true, deleted: false });
	if (!file) {
		if (validate) throw new ThrowReturn('Can not delete folder');
		return;
	}

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: file.blockIds });
	if (!blockIds.length) {
		throw new ThrowReturn().status(403);
	}

	if (validate) await checkIsDeleteValid(id);

	Object.assign(file, { deleted: true, deletedBy: user._id });

	if (file.isFolder && file) {
		const resourceFiles = await models.ResourceFile.find({ parent: file._id });
		if (!_.isEmpty(resourceFiles)) await resourceFiles.asyncMap(rf => deleteFile(rf._id, user, false));
	}

	await file.save();

	return file;
}

async function getArchiveFiles({ folderId, parent, resursive, blockIds, lang }) {
	const resourceFiles = await models.ResourceFile.find({
		deleted: false,
		fileType: RESOURCE_FILE_TYPE.MANUAL,
		parent: folderId,
		isVirtual: { $ne: true },
		blockIds: { $in: blockIds },
	}).populate('resource');

	const files = await resourceFiles
		.filter(rf => !rf.isFolder)
		.asyncMap(async (rf, index) => {
			const fullPath = rf.resource.external ? rf.resource.path : await rf.resource.getExistRelativePath();

			const ext = path.extname(rf.resource.originName);
			const name = _.get(rf, `name.${lang || 'vi'}`) || '';
			let nameWithoutExt = name.replace(ext, '');

			if (_.includes([DEFAULT_FOLDER_NAME.EN, DEFAULT_FOLDER_NAME.VI], nameWithoutExt)) {
				nameWithoutExt += `-${index}`;
			}

			return {
				originName: rf.resource.originName,
				external: rf.resource.external,
				fullPath,
				relativePath: `/${parent}/${nameWithoutExt}${ext}`,
			};
		});

	if (resursive) {
		const folders = resourceFiles.filter(f => f.isFolder);
		if (folders.length) {
			const arcFiles = await folders.asyncMap(async rf => {
				const name = _.get(rf, `name.${lang || 'vi'}`) || '';
				return getArchiveFiles({
					folderId: rf._id,
					parent: `${parent}/${name.replace(/\//g, '|')}`,
					resursive,
					blockIds,
					lang,
				});
			});
			return [...files, ...arcFiles];
		}
	}
	return files;
}

async function download(req, res) {
	const { folder: _folder, fileOnly, blockId, admin } = req.query;
	const folder = _folder && mongoose.Types.ObjectId.isValid(_folder) ? _folder : null;
	const lang = req.language;
	const user = req.decoded.user;

	let blockIds;

	if (admin === '1') {
		blockIds = await findAdminPropertyIds(user, blockId);
	} else {
		({ blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId }));
	}

	const parent =
		folder &&
		(await models.ResourceFile.findOne({
			_id: folder,
			blockIds: { $in: blockIds },
			isVirtual: { $ne: true },
		}).select('name'));

	const archive = archiver('zip', { zlib: { level: 9 } });

	archive.on('error', err => {
		logger.error(err);
	});
	archive.on('finish', () => {
		res.end();
	});

	const parentName = parent ? _.get(parent, `name.${lang}`) : 'Root';

	const files = _.flatMapDeep(
		await getArchiveFiles({
			folderId: folder,
			parent: parentName,
			resursive: fileOnly !== true,
			blockIds,
			lang,
		})
	);

	await files.asyncForEach(async file => {
		if (!file.fullPath) return;
		if (file.external) {
			try {
				const response = await fetch(file.fullPath);
				if (response.body) archive.append(response.body, { name: file.relativePath });
			} catch (err) {
				logger.error(err);
			}
		} else {
			const stream = fs.createReadStream(file.fullPath);
			stream.on('error', err => logger.error(err));
			archive.append(stream, { name: file.relativePath });
		}
	});

	res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(parentName)}.zip`);
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Accept-Ranges', 'bytes');

	archive.pipe(res);
	archive.finalize();
}

async function getZaloFiles({ start, limit, ottIds }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;

	if (_.isEmpty(ottIds)) {
		return { urls: [], total: 0, start, limit };
	}

	const { files, total } = await zaloService.getFiles({ start, limit, toUids: ottIds });

	const urls = _.compact(files).map(file => {
		const urlFileName = _.chain(file.image_attachment_url).first().split('/').last().value();

		file.fileName = _.get(file, 'attachments[0].title') || urlFileName;
		file.mimetype = mime.lookup(urlFileName);
		_.unset(file, 'attachments');
		return file;
	});
	const rs = _.compact(urls);

	return { urls: rs, total, start, limit };
}

// async function saveFolder(data, parent, userId) {
// 	return _.entries(data).asyncMap(async ([folderName, item]) => {
// 		let folder;
// 		if (folderName) {
// 			folder = await models.ResourceFile.create({ name: folderName, createdBy: userId, parent });
// 		}

// 		if (!folder || !item) return;

// 		if (item.files) {
// 			const resources = await uploadFile(item.files);
// 			await _.asyncMap(resources, resource => {
// 				return models.ResourceFile.create({
// 					name: resource.originName,
// 					parent: folder._id,
// 					createdBy: userId,
// 					resource: resource._id,
// 				});
// 			});
// 		}

// 		if (item.folders) {
// 			await saveFolder(item.folders, folder._id, userId);
// 		}
// 	});
// }

// async function uploadFolder(user, files, parent) {
// 	const _parent = mongoose.Types.ObjectId.isValid(parent) ? parent : null;
// 	const data = {};

// 	_.forEach(files, (_files, relativePath) => {
// 		_.setWith(
// 			data,
// 			[...relativePath.split('////').reduce((a, c) => [...a, 'folders', c], []), 'files'],
// 			_files,
// 			Object
// 		);
// 	});

// 	if (data.folders) {
// 		await saveFolder(data.folders, _parent, user.id);
// 	}
// }

async function getZaloAssetGroupId({ type, fromMe, user }) {
	// if (!_.includes([MessageGroupInternalType.CONTRACT_ZALO, MessageGroupInternalType.VOUCHER_ZALO], type)) {
	// 	throw new ThrowReturn('Type invalid');
	// }
	if (fromMe) {
		return _.filter(user && user.otts, ott => ott.ottName === OTTs.Zalo).map(o => o.ottId);
	}

	const messages = await models.Messages.find({
		isGroup: true,
		groupType: MessageGroupType.INTERNAL,
		internalGroupType: type || _.values(MessageGroupInternalType),
	})
		.select('guestId groupType')
		.populate('guestId', ' ottIds');

	const rs = _.map(messages, msg => _.get(msg, 'guestId.ottIds.zalo'));
	return _.compact(rs);
}

async function moveChild(id, blockIds) {
	const resourceFiles = await models.ResourceFile.find({ parent: id, editable: true, deleted: false });
	if (_.isEmpty(resourceFiles)) return;

	await models.ResourceFile.updateMany({ _id: resourceFiles.map(item => item._id) }, { $set: { blockIds } });

	await resourceFiles.asyncMap(rf => {
		if (rf.isFolder) moveChild(rf._id, blockIds);
	});
}

async function moveFiles(body, user) {
	try {
		const { fromIds, toId } = body;

		if (!fromIds || !fromIds.length) {
			throw new ThrowReturn('Tệp tin / thư mục không được để trống!');
		}

		const updatedData = {
			updatedBy: user._id,
			parent: null,
		};
		if (body.blockIds) {
			updatedData.blockIds = body.blockIds;
		}
		if (toId) {
			if (fromIds.some(fromId => fromId === toId)) {
				throw new ThrowReturn('Tệp tin / thư mục đích không hợp lệ!');
			}

			const { blockIds } = await models.Host.getBlocksOfUser({ user });
			const target = await models.ResourceFile.findOne({
				_id: toId,
				deleted: false,
				isFolder: true,
				blockIds: { $in: blockIds },
			}).select('_id blockIds');
			if (!target) {
				throw new ThrowReturn('Không tìm thấy tệp tin / thư mục!');
			}
			updatedData.parent = target._id;
			updatedData.blockIds = target.blockIds;
		}

		if (!_.isEmpty(fromIds)) await fromIds.asyncMap(id => moveChild(id, updatedData.blockIds));

		return await models.ResourceFile.updateMany(
			{
				_id: fromIds,
			},
			{
				$set: updatedData,
			}
		);
	} catch (error) {
		console.error('Error moving files:', error);
		throw error;
	}
}

async function duplicateFolder(folder, newParentId, user, blockIds) {
	folder = folder.toObject();

	const duplicatedData = {
		...folder,
		_id: undefined,
		blockIds,
		parent: newParentId,
		rsId: newParentId,
		createdBy: user._id,
	};
	const newFolder = await models.ResourceFile.create(duplicatedData);

	if (folder.isFolder) {
		const children = await models.ResourceFile.find({ parent: folder._id });
		await children.asyncMap(child => duplicateFolder(child, newFolder._id, user, blockIds));
	}

	return newFolder;
}

async function duplicateFiles(body, user) {
	try {
		const { fromIds, blockIds, toId } = body;
		if (_.isEmpty(fromIds)) return;

		if (fromIds.some(fromId => fromId === toId)) {
			throw new ThrowReturn('Tệp tin / thư mục đích không hợp lệ!');
		}

		await fromIds.asyncMap(async id => {
			const folder = await models.ResourceFile.findById(id);
			if (!folder) {
				throw new ThrowReturn('File not found');
			}
			const newFolder = await duplicateFolder(folder, toId, user, blockIds || folder.blockIds);
			return newFolder;
		});
	} catch (error) {
		console.error('Error duplicating files:', error);
		throw error;
	}
}

module.exports = {
	createFile,
	getFiles,
	updateFile,
	deleteFile,
	download,
	getZaloFiles,
	getZaloAssetGroupId,
	moveFiles,
	duplicateFiles,
};
