const mime = require('mime-types');
const _ = require('lodash');
const path = require('path');
const mongoose = require('mongoose');
const moment = require('moment');
const queryString = require('querystring');

const models = require('@models');
const { UPLOAD_CONFIG } = require('@config/setting');
const { HISTORY_TYPE, VIRTUAL_RESOURCE } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

/*
	Note:
	 - FolderId: ${fileId}?${queryString}
	 - Ex: 6419582649bbad42deba8b5e?blockId=63744ab81c5dd66bd466ed4d&date=2022-12-31T17%3A00%3A00.000Z
*/

function idEncode(query) {
	return encodeURIComponent(queryString.stringify(query));
}

function idDecode(text) {
	return queryString.parse(decodeURIComponent(text));
}

function isVirtualId(text) {
	return !mongoose.Types.ObjectId.isValid(text) && _.size(idDecode(text)) > 1;
}

function validateFolderId(parent, fn) {
	if (!parent) throw new ThrowReturn('ParentId invalid');
	const fileId = _.get(idDecode(parent), 'parent');

	if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) throw new ThrowReturn('ParentId invalid');
	return fn;
}

async function getVirtualFunction(type, query) {
	switch (type) {
		// case VIRTUAL_RESOURCE.PAYOUT_BLOCK:
		// 	return getPayoutBlockVirtualFiles(query);
		case VIRTUAL_RESOURCE.PAYOUT_DATE_MONTH:
			return validateFolderId(query.parent, getPayoutDateVirtualFiles({ ...query, dateType: 'MONTH' }));
		case VIRTUAL_RESOURCE.PAYOUT_DATE_YEAR:
			return validateFolderId(query.parent, getPayoutDateVirtualFiles({ ...query, dateType: 'YEAR' }));
		case VIRTUAL_RESOURCE.PAYOUT:
			return validateFolderId(query.parent, getPayoutVirtualFiles(query));

		// case VIRTUAL_RESOURCE.HISTORY_BLOCK:
		// 	return getHistoryBlockVirtualFiles(query);
		case VIRTUAL_RESOURCE.HISTORY_ROOM:
			return validateFolderId(query.parent, getHistoryRoomVirtualFiles(query));
		case VIRTUAL_RESOURCE.HISTORY_DATE:
			return validateFolderId(query.parent, getHistoryDateVirtualFiles(query));
		case VIRTUAL_RESOURCE.HISTORY:
			return validateFolderId(query.parent, getHistoryVirtualFiles(query));

		// case VIRTUAL_RESOURCE.TASK_BLOCK:
		// 	return getTaskBlockVirtualFiles(query);
		case VIRTUAL_RESOURCE.TASK_ROOM:
			return validateFolderId(query.parent, getTaskRoomVirtualFiles(query));
		case VIRTUAL_RESOURCE.TASK_DATE:
			return validateFolderId(query.parent, getTaskDateVirtualFiles(query));
		case VIRTUAL_RESOURCE.TASK:
			return validateFolderId(query.parent, getTaskVirtualFiles(query));
		default:
	}
}

const PAYOUT_TYPES = [
	// VIRTUAL_RESOURCE.PAYOUT_BLOCK,
	VIRTUAL_RESOURCE.PAYOUT_DATE_YEAR,
	VIRTUAL_RESOURCE.PAYOUT_DATE_MONTH,
	VIRTUAL_RESOURCE.PAYOUT,
];
// const HISTORY_TYPES = [VIRTUAL_RESOURCE.HISTORY_BLOCK, VIRTUAL_RESOURCE.HISTORY_ROOM, VIRTUAL_RESOURCE.HISTORY];
// const TASK_TYPES = [VIRTUAL_RESOURCE.TASK_BLOCK, VIRTUAL_RESOURCE.TASK_ROOM, VIRTUAL_RESOURCE.TASK];

const HISTORY_TYPES = [VIRTUAL_RESOURCE.HISTORY_ROOM, VIRTUAL_RESOURCE.HISTORY_DATE, VIRTUAL_RESOURCE.HISTORY];
const TASK_TYPES = [VIRTUAL_RESOURCE.TASK_ROOM, VIRTUAL_RESOURCE.TASK_DATE, VIRTUAL_RESOURCE.TASK];

// BREAD CRUMB
async function getVirtualBreadCrumb(parentId, type) {
	// PAYOUT
	if (_.includes(PAYOUT_TYPES, type)) {
		return getPayoutBreadCrumb(parentId, type);
	}
	// HISTORY
	if (_.includes(HISTORY_TYPES, type)) {
		return getHistoryAndTaskBreadCrumb(parentId, type, HISTORY_TYPES);
	}
	// TASK
	if (_.includes(TASK_TYPES, type)) {
		return getHistoryAndTaskBreadCrumb(parentId, type, TASK_TYPES);
	}
}

function getPayoutBreadCrumb(parentId, type) {
	let endIndex = _.indexOf(PAYOUT_TYPES, type);
	if (endIndex === -1) return [];
	const types = _.slice(PAYOUT_TYPES, 1, ++endIndex);
	const query = idDecode(parentId);

	return types.asyncMap(async _type => {
		let name = '';
		let id = '';

		// if (_type === VIRTUAL_RESOURCE.PAYOUT_DATE_YEAR) {
		// 	const block = await models.Block.findById(query.blockId).select('info.name');
		// 	name = _.get(block, 'info.name') || '';
		// 	id = idEncode({ parent: parentId, type: _type, blockId: query.blockId });
		// }

		if (_.includes([VIRTUAL_RESOURCE.PAYOUT_DATE_MONTH, VIRTUAL_RESOURCE.PAYOUT], _type)) {
			const isPayoutType = _type === VIRTUAL_RESOURCE.PAYOUT;
			const format = isPayoutType ? 'MM-YYYY' : 'YYYY';

			name = moment(query.date).format(format);
			id = idEncode({
				parent: query.parent,
				type: _type,
				blockId: query.blockId,
				date: query.date,
			});
		}

		return {
			id,
			_id: id,
			rsId: id,
			name,
			blockIds: [query.blockId],
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			__v: 0,
		};
	});
}

function getHistoryAndTaskBreadCrumb(parentId, type, types = []) {
	let endIndex = _.indexOf(types, type);
	if (endIndex === -1) return [];
	const _types = _.slice(types, 1, ++endIndex);
	const query = idDecode(parentId);

	return _types.asyncMap(async _type => {
		let id = '';
		let name = '';

		if (_.includes([VIRTUAL_RESOURCE.HISTORY_ROOM, VIRTUAL_RESOURCE.TASK_ROOM], _type)) {
			const block = await models.Block.findById(query.blockId).select('info.name');
			name = _.get(block, 'info.name');
			id = idEncode({ parent: query.parent, type: _type, blockId: query.blockId });
		}

		if (_.includes([VIRTUAL_RESOURCE.HISTORY_DATE, VIRTUAL_RESOURCE.TASK_DATE], _type)) {
			const room = await models.Room.findById(query.roomId).select('info.roomNo');
			name = _.get(room, 'info.roomNo');
			id = idEncode({
				parent: query.parent,
				type: _type,
				blockId: query.blockId,
				roomId: query.roomId,
			});
		}

		if (_.includes([VIRTUAL_RESOURCE.HISTORY, VIRTUAL_RESOURCE.TASK], _type)) {
			name = moment(query.date).format('DD-MM-YYYY');
			id = idEncode({
				parent: query.parent,
				type: _type,
				blockId: query.blockId,
				roomId: query.roomId,
				date: query.date,
			});
		}

		return {
			id,
			_id: id,
			rsId: id,
			name,
			blockIds: [query.blockId],
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			__v: 0,
		};
	});
}

// PAYOUT
async function getPayoutBlockVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };
	const _query = {
		images: { $ne: [], $exists: true },
		blockIds: { $in: blockIds },
	};

	const [folders, total] = await Promise.all([
		models.Payout.aggregate()
			.match(_query)
			.project({ blockIds: 1 })
			.unwind('$blockIds')
			.group({ _id: '$blockIds' })
			.lookup({
				from: 'block',
				let: { id: '$_id' },
				pipeline: [{ $match: { $expr: { $eq: ['$$id', '$_id'] } } }, { $project: { name: '$info.name' } }],
				as: 'block',
			})
			.project({ name: { $arrayElemAt: ['$block.name', 0] } })
			.sort({ name: -1 })
			.skip(start)
			.limit(limit),
		models.Payout.aggregate().match(_query).unwind('$blockIds').group({ _id: '$blockIds' }).count('blockIds'),
	]);

	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(_folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.PAYOUT_DATE_YEAR,
			blockId: _.toString(_folder._id),
		});

		return {
			_id: id,
			id,
			rsId: id,
			name: _folder.name || '',
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			parent,
		};
	});

	return { files, total: _.get(total, '[0].blockIds') || 0, start, limit };
}

async function getPayoutDateVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };

	const _query = {
		images: { $ne: [], $exists: true },
		blockIds: { $in: blockIds },
	};
	let dateConfig = {};
	let virtualType = '';

	if (query.dateType === 'YEAR') {
		virtualType = VIRTUAL_RESOURCE.PAYOUT_DATE_MONTH;
		dateConfig = { mongoFormat: '%Y', format: 'YYYY', type: 'year' };
	}
	if (query.dateType === 'MONTH') {
		virtualType = VIRTUAL_RESOURCE.PAYOUT;
		dateConfig = { mongoFormat: '%m-%Y', format: 'MM-YYYY', type: 'month' };

		const from = moment(query.date).startOf('year').toISOString();
		const to = moment(query.date).endOf('year').toISOString();
		_.set(_query, 'paidAt', {
			$gte: new Date(from) || moment().endOf('year').toDate(),
			$lt: new Date(to) || moment().endOf('year').toDate(),
		});
	}

	const [folders, total] = await Promise.all([
		models.Payout.aggregate()
			.match(_query)
			.project({
				title: {
					$dateToString: {
						date: '$paidAt',
						format: dateConfig.mongoFormat,
					},
				},
				date: '$paidAt',
			})
			.group({ _id: '$title', date: { $max: '$date' } })
			.sort({ date: -1 })
			.skip(start)
			.limit(limit),
		models.Payout.aggregate()
			.match(_query)
			.project({
				title: {
					$dateToString: {
						date: '$paidAt',
						format: dateConfig.mongoFormat,
					},
				},
			})
			.group({ _id: '$title' })
			.count('title'),
	]);
	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const isSingleBlock = blockIds.length === 1;
	const files = folders.map(folder => {
		const _folder = {
			date: moment(folder.date, dateConfig.format).endOf(dateConfig.type).toDate().toDateMysqlFormat(),
			blockId: isSingleBlock ? _.toString(_.first(blockIds)) : undefined,
			title: folder._id,
		};

		let id;
		const file = {
			name: _folder.title || '',
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			parent: encodeURIComponent(parent),
			createdAt: _folder.date,
		};

		id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: virtualType,
			blockId: _folder.blockId,
			date: _folder.date,
		});

		Object.assign(file, {
			_id: id,
			id,
			rsId: id,
		});
		return file;
	});

	return { files, total: _.get(total, '[0].title') || 0, start, limit };
}

async function getPayoutVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (isFolder) return { files: [], total: 0, start, limit };

	const from = moment(query.date).startOf('month').toISOString();
	const to = moment(query.date).endOf('month').toISOString();
	const _query = {
		blockIds: { $in: blockIds },
		$or: [{ images: { $ne: [], $exists: true } }, { historyAttachments: { $ne: [], $exists: true } }],

		paidAt: {
			$gte: new Date(from) || moment().endOf('month').toDate(),
			$lt: new Date(to) || moment().endOf('month').toDate(),
		},
	};

	const [images, total] = await Promise.all([
		models.Payout.aggregate()
			.match(_query)
			.project({
				images: {
					$concatArrays: [{ $ifNull: ['$images', []] }, { $ifNull: ['$historyAttachments', []] }],
				},
				categoryId: 1,
				paidAt: 1,
				updatedAt: 1,
			})
			.unwind('images')
			.sort({ paidAt: -1 })
			.skip(start)
			.limit(limit),
		models.Payout.aggregate().match(_query).project({ images: 1 }).unwind('images').count('images'),
	]);

	if (_.isEmpty(images)) return { files: [], total: 0 };

	const isSingleBlock = blockIds.length === 1;
	const files = images.map((img, i) => {
		const name = _.last(img.images.split('/'));
		const _path = _.replace(img.images, `${UPLOAD_CONFIG.FULL_URI}/`, '');
		const mimetype = mime.lookup(path.extname(name));
		const id = `${img._id}${i}`;

		return {
			_id: id,
			id,
			rsId: id,
			name,
			parent: encodeURIComponent(parent),
			isFolder: false,
			blockIds: isSingleBlock ? blockIds : undefined,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: img.paidAt,
			resource: {
				_id: `${id}${name}`,
				path: _path,
				originName: name,
				external: false,
				url: img.images,
				mimetype,
				createdAt: img.paidAt,
			},
		};
	});

	return { files, total: _.get(total, '[0].images') || 0, start, limit };
}

// HISTORY
async function getHistoryBlockVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };
	const _query = {
		images: { $ne: [], $exists: true },
		blockId: { $in: blockIds },
	};

	const [folders, total] = await Promise.all([
		models.History.aggregate()
			.match(_query)
			.group({ _id: '$blockId' })
			.lookup({
				from: 'block',
				let: { id: '$_id' },
				pipeline: [{ $match: { $expr: { $eq: ['$$id', '$_id'] } } }, { $project: { name: '$info.name' } }],
				as: 'block',
			})
			.project({ name: { $arrayElemAt: ['$block.name', 0] } })
			.sort({ name: -1 })
			.skip(start)
			.limit(limit),
		models.History.aggregate().match(_query).unwind('$blockId').group({ _id: '$blockId' }).count('blockId'),
	]);

	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.HISTORY_ROOM,
			blockId: _.toString(folder._id),
		});

		return {
			id,
			_id: id,
			rsId: id,
			name: folder.name || '',
			parent,
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
		};
	});

	return { files, total: _.get(total, '[0].blockId') || 0, start, limit };
}

async function getHistoryRoomVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };

	const _query = {
		images: { $ne: [], $exists: true },
		blockId: { $in: blockIds },
		type: HISTORY_TYPE.ASSET_REPORT,
		deleted: false,
	};

	const [folders, total] = await Promise.all([
		models.History.aggregate()
			.match(_query)
			.project({ roomIds: 1, blockId: 1, createdAt: 1 })
			.unwind('$roomIds')
			.group({ _id: '$roomIds', blockId: { $first: '$blockId' } })
			.lookup({
				from: 'room',
				let: { id: '$_id' },
				pipeline: [{ $match: { $expr: { $eq: ['$$id', '$_id'] } } }, { $project: { roomNo: '$info.roomNo' } }],
				as: 'room',
			})
			.project({
				roomNo: { $arrayElemAt: ['$room.roomNo', 0] },
				blockId: 1,
				createdAt: 1,
			})
			.sort({ roomNo: -1 })
			.skip(start)
			.limit(limit),
		models.History.aggregate().match(_query).unwind('$roomIds').group({ _id: '$roomIds' }).count('roomIds'),
	]);

	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.HISTORY_DATE,
			blockId: _.toString(folder.blockId),
			roomId: _.toString(folder._id),
		});

		return {
			id,
			_id: id,
			rsId: id,
			name: folder.roomNo || '',
			parent: encodeURIComponent(parent),
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: folder.createdAt,
		};
	});

	return { files, total: _.get(total, '[0].roomIds') || 0, start, limit };
}

async function getHistoryDateVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };

	const _query = {
		images: { $ne: [], $exists: true },
		blockId: { $in: blockIds },
		type: HISTORY_TYPE.ASSET_REPORT,
		roomIds: { $in: [mongoose.Types.ObjectId(query.roomId)] },
		deleted: false,
	};

	const [folders, total] = await Promise.all([
		models.History.aggregate()
			.match(_query)
			.project({
				title: {
					$dateToString: {
						date: '$createdAt',
						format: '%d-%m-%Y',
					},
				},
				blockId: 1,
				createdAt: 1,
			})
			.group({
				_id: '$title',
				createdAt: { $max: '$createdAt' },
			})
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit),
		models.History.aggregate()
			.match(_query)
			.project({
				title: {
					$dateToString: {
						date: '$createdAt',
						format: '%d-%m-%Y',
					},
				},
			})
			.group({
				_id: '$title',
			})
			.count('title'),
	]);
	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.HISTORY,
			blockId: _.toString(folder.blockId),
			roomId: query.roomId,
			date: new Date(folder.createdAt).toDateMysqlFormat(),
		});

		return {
			id,
			_id: id,
			rsId: id,
			name: folder._id || '',
			parent: encodeURIComponent(parent),
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: folder.createdAt,
		};
	});

	return { files, total: _.get(total, '[0].title') || 0, start, limit };
}

async function getHistoryVirtualFiles({ roomId, parent, blockIds, start, limit, isFolder, ...query }) {
	if (isFolder) return { files: [], total: 0, start, limit };

	const _query = {
		type: HISTORY_TYPE.ASSET_REPORT,
		blockId: { $in: blockIds },
		roomIds: { $in: [mongoose.Types.ObjectId(roomId)] },
		images: { $ne: [], $exists: true },
		deleted: false,
		createdAt: {
			$gte: new Date(query.date).minTimes(),
			$lte: new Date(query.date).maxTimes(),
		},
	};
	const [images, total] = await Promise.all([
		models.History.aggregate()
			.match(_query)
			.project({ image: '$images', createdAt: 1 })
			.unwind('image')
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit),
		models.History.aggregate().match(_query).project({ images: 1 }).unwind('images').count('images'),
	]);

	if (_.isEmpty(images)) return { files: [], total: 0 };

	const files = images.map((img, i) => {
		const name = _.last(img.image.split('/'));
		const _path = _.replace(img.image, `${UPLOAD_CONFIG.FULL_URI}/`, '');
		const mimetype = mime.lookup(path.extname(name));
		const id = `${img._id}${i}`;

		return {
			_id: id,
			id,
			rsId: id,
			name,
			parent: encodeURIComponent(parent),
			isFolder: false,
			blockIds,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: img.createdAt,
			resource: {
				_id: `${id}${name}`,
				path: _path,
				originName: name,
				external: false,
				url: img.image,
				mimetype,
				createdAt: img.createdAt,
			},
		};
	});

	return { files, total: _.get(total, '[0].images') || 0, start, limit };
}

// TASK
async function getTaskBlockVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };
	const _query = {
		attachments: { $ne: [], $exists: true },
		blockId: { $in: blockIds },
	};

	const [folders, total] = await Promise.all([
		models.Task.aggregate()
			.match(_query)
			.group({ _id: '$blockId' })
			.lookup({
				from: 'block',
				let: { id: '$_id' },
				pipeline: [{ $match: { $expr: { $eq: ['$$id', '$_id'] } } }, { $project: { name: '$info.name' } }],
				as: 'block',
			})
			.project({ name: { $arrayElemAt: ['$block.name', 0] } })
			.sort({ name: -1 })
			.skip(start)
			.limit(limit),
		models.Task.aggregate().match(_query).unwind('$blockId').group({ _id: '$blockId' }).count('blockId'),
	]);

	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.TASK_ROOM,
			blockId: _.toString(folder._id),
		});

		return {
			id,
			_id: id,
			rsId: id,
			name: folder.name || '',
			parent,
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
		};
	});

	return { files, total: _.get(total, '[0].blockId') || 0, start, limit };
}

async function getTaskRoomVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };
	const _query = {
		attachments: { $ne: [], $exists: true },
		blockId: { $in: blockIds },
	};

	const [folders, total] = await Promise.all([
		models.Task.aggregate()
			.match(_query)
			.unwind('$roomIds')
			.group({ _id: '$roomIds', blockId: { $first: '$blockId' } })
			.lookup({
				from: 'room',
				let: { id: '$_id' },
				pipeline: [{ $match: { $expr: { $eq: ['$$id', '$_id'] } } }, { $project: { name: '$info.roomNo' } }],
				as: 'room',
			})
			.project({
				name: { $arrayElemAt: ['$room.name', 0] },
				blockId: 1,
				time: 1,
			})
			.sort({ name: -1 })
			.skip(start)
			.limit(limit),
		models.Task.aggregate().match(_query).unwind('$roomIds').group({ _id: '$roomIds' }).count('roomIds'),
	]);

	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.TASK_DATE,
			blockId: _.toString(folder.blockId),
			roomId: _.toString(folder._id),
		});

		return {
			_id: id,
			id,
			rsId: id,
			name: folder.name || '',
			parent: encodeURIComponent(parent),
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: folder.time,
		};
	});

	return { files, total: _.get(total, '[0].roomIds') || 0, start, limit };
}

async function getTaskDateVirtualFiles({ parent, blockIds, start, limit, isFolder, ...query }) {
	if (!isFolder && isFolder !== undefined) return { files: [], total: 0, start, limit };
	const _query = {
		attachments: { $ne: [], $exists: true },
		blockId: { $in: blockIds },
		roomIds: mongoose.Types.ObjectId(query.roomId),
	};

	const [folders, total] = await Promise.all([
		models.Task.aggregate()
			.match(_query)
			.project({
				title: {
					$dateToString: {
						date: '$time',
						format: '%d-%m-%Y',
					},
				},
				time: 1,
			})
			.group({
				_id: '$title',
				time: { $max: '$time' },
			})
			.sort({ time: -1 })
			.skip(start)
			.limit(limit),
		models.Task.aggregate()
			.match(_query)
			.project({
				title: {
					$dateToString: {
						date: '$time',
						format: '%d-%m-%Y',
					},
				},
			})
			.group({
				_id: '$title',
			})
			.count('title'),
	]);

	if (_.isEmpty(folders)) return { files: [], total: 0 };

	const files = folders.map(folder => {
		const id = idEncode({
			parent: _.get(idDecode(parent), 'parent'),
			type: VIRTUAL_RESOURCE.TASK,
			blockId: _.toString(folder.blockId),
			roomId: query.roomId,
			date: new Date(folder.time).toDateMysqlFormat(),
		});

		return {
			_id: id,
			id,
			rsId: id,
			name: folder._id || '',
			parent: encodeURIComponent(parent),
			isFolder: true,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: folder.time,
		};
	});

	return { files, total: _.get(total, '[0]._id') || 0, start, limit };
}

async function getTaskVirtualFiles({ roomId, parent, blockIds, start, limit, isFolder, ...query }) {
	if (isFolder) return { files: [], total: 0, start, limit };
	const _query = {
		blockId: { $in: blockIds },
		attachments: { $ne: [], $exists: true },
		roomIds: mongoose.Types.ObjectId(roomId),
		time: {
			$lte: new Date(query.date).maxTimes(),
			$gte: new Date(query.date).minTimes(),
		},
	};

	const [images, total] = await Promise.all([
		models.Task.aggregate()
			.match(_query)
			.sort({ time: -1 })
			.project({
				images: '$attachments',
				time: 1,
			})
			.unwind('images')
			.skip(start)
			.limit(limit),
		models.Task.aggregate().match(_query).project({ attachments: 1 }).unwind('attachments').count('attachments'),
	]);

	if (_.isEmpty(images)) return { files: [], total: 0 };
	const files = images.map((img, i) => {
		const name = _.last(img.images.split('/'));
		const _path = _.replace(img.images, `${UPLOAD_CONFIG.FULL_URI}/`, '');
		const mimetype = mime.lookup(path.extname(name));
		const id = `${img._id}${i}`;

		return {
			_id: id,
			id,
			rsId: id,
			name,
			parent: encodeURIComponent(parent),
			isFolder: false,
			blockIds,
			deleted: false,
			editable: false,
			isVirtual: true,
			createdAt: img.time,
			resource: {
				_id: `${id}${name}`,
				path: _path,
				originName: name,
				external: false,
				url: img.images,
				mimetype,
				createdAt: img.time,
			},
		};
	});

	return { files, total: _.get(total, '[0].attachments') || 0, start, limit };
}

module.exports = {
	getVirtualFunction,
	getVirtualBreadCrumb,
	idDecode,
	isVirtualId,
};
