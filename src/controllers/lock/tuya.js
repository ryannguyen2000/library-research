const moment = require('moment');
const _ = require('lodash');
const { isMainThread } = require('worker_threads');
const { customAlphabet } = require('nanoid');
const AsyncLock = require('async-lock');

const models = require('@models');
const {
	DOOR_LOCK_TYPE,
	RuleDay,
	AccountConfigTypes,
	AccountProvider,
	DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const TuyaWebSocket = require('@services/tuya');

const TuyaClient = require('./tuya/tuyaClient');
const { VALID_PASSWORD_PHASES } = require('./tuya/const');

const asyncLock = new AsyncLock();

async function initTuyaWs(accessKey, secretKey) {
	if (!isMainThread) return;
	if (!accessKey || !secretKey) {
		const tuyaConfig = await models.AccountConfig.findOne({
			active: true,
			accountType: AccountConfigTypes.API,
			provider: AccountProvider.TUYA,
		}).lean();
		if (!tuyaConfig) {
			logger.error('Tuya Authorization does not exist');
		}
		accessKey = _.get(tuyaConfig, 'authorizationKey.accessKey', '');
		secretKey = _.get(tuyaConfig, 'authorizationKey.secretKey', '');
	}

	const tuyaWs = TuyaWebSocket.connection(accessKey, secretKey);
	if (!tuyaWs) return;
	tuyaWs.open(() => {
		logger.info('Tuya websocket open');
	});

	tuyaWs.message((ws, message) => onReceivedLog(message));

	tuyaWs.reconnect(() => {
		logger.info('Tuya websocket reconnect');
	});

	tuyaWs.close((ws, ...args) => {
		logger.info('Tuya websocket close', ...args);
	});

	tuyaWs.error((ws, error) => {
		logger.error('Tuya websocket error', error);
	});

	tuyaWs.start();
}

function tuyaClientInit() {
	let tuyaClient;
	let isTuyaInit = true;
	initTuyaWs();

	return async () => {
		const tuyaConfig = await models.AccountConfig.findOne({
			active: true,
			accountType: AccountConfigTypes.API,
			provider: AccountProvider.TUYA,
		}).lean();
		if (!tuyaConfig) throw new ThrowReturn('Tuya Authorization does not exist');

		const { accessKey, secretKey } = tuyaConfig.authorizationKey || {};

		const params = { accessKey, secretKey, uid: _.get(tuyaConfig, 'others.appAccountUID', '') };

		// reconnect if Tuya credential changed
		if (!tuyaClient || !tuyaClient.isExist(params)) {
			tuyaClient = new TuyaClient(params);
			if (!isTuyaInit) initTuyaWs(accessKey, secretKey);

			isTuyaInit = false;
		}
		return tuyaClient;
	};
}

const getTuyaClient = tuyaClientInit();

async function getDevices(query) {
	const devices = await models.TuyaDevice.find({ homeId: query.homeId }).lean();
	return devices;
}

async function getHomes() {
	const homes = await models.TuyaHome.find().lean();
	return { homes };
}

async function getTempPassword(blockLock, { deviceId = '', passwordId = '', roomId }) {
	const tuyaClient = await getTuyaClient();
	let tempPassword = blockLock.getPassword(passwordId);
	const password = tempPassword ? await tuyaClient.smartLock.getPassword(deviceId, passwordId) : {};

	const isPasswordInvalid = _.get(password, 'error_code', 0) === 1 || !VALID_PASSWORD_PHASES.includes(password.phase);

	if (isPasswordInvalid) {
		await syncTempPasswords(blockLock._id);
		blockLock = await models.BlockLock.findById(blockLock._id);
		tempPassword = blockLock.temporaryPasswords.find(tempPwd => tempPwd.roomIds.includes(roomId));
	}

	return tempPassword;
}

async function updateCode({ config: blockLock, data, newCode, room, expireTime }) {
	const { deviceId } = blockLock;
	const { passId } = data;
	const res = { expireTime, code: newCode };
	const roomId = _.get(room, '_id');

	let password = await getTempPassword(blockLock, {
		deviceId,
		passwordId: passId,
		roomId: room._id,
	});
	const isCreateLockForRoom = !password.roomIds.includes(roomId);
	if (password.code === newCode) return res;
	password = isCreateLockForRoom ? password : blockLock.getPasswordInPool([password.passwordId], newCode);

	if (!isCreateLockForRoom) await blockLock.pullRoomIdOnPassword(passId, roomId);

	await blockLock.updatePassword(password.passwordId, { roomId });
	return { code: password.code, passId: password.passwordId };

	// Use for update tuya Lock
	// const temporaryPasswordCreationLimit = _.get(
	// 	blockLock,
	// 	'temporaryPasswordCreationLimit',
	// 	DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT
	// );

	// if (_.get(blockLock, 'temporaryPasswords.length', 0) !== temporaryPasswordCreationLimit) {
	// 	await syncTempPasswords(blockLock._id);
	// 	blockLock = await models.BlockLock.findById(blockLock._id);
	// }
	// const tuyaClient = await getTuyaClient();
	//
	// const now = moment();
	// const effectiveTime = now.unix();
	// expireTime = expireTime ? moment(expireTime) : now.add(1, 'y');
	// const invalidTime = expireTime.unix();
	//
	// const res = { expireTime, code: newCode };
	//
	// const { code, passwordId } = await getTempPassword(blockLock, { deviceId, passwordId: passId, roomId: room._id });
	//
	// if (code === newCode) return res;
	//
	// const resetCodeEnable = await blockLock.checkBeAbleToResetCode(passwordId);
	//
	// if (!resetCodeEnable) {
	// 	res.code = code;
	// 	return res;
	// }
	//
	// if (newCode.length !== blockLock.temporaryPasswordLengthRequirement) {
	// 	logger.error('tuya updateCode error', deviceId, { passwordId, newCode, msg: 'Code length invalid' });
	// 	throw new ThrowReturn('Code length invalid');
	// }
	//
	// res.prevCode = code;
	//
	// const rs = await tuyaClient.smartLock.updateTempPassword({
	// 	deviceId,
	// 	passwordId,
	// 	password: newCode,
	// 	effectiveTime,
	// 	invalidTime,
	// });
	//
	// if (rs.error_code === 1) {
	// 	logger.error('tuya api updateCode error', deviceId, { passwordId, newCode, msg: rs.msg });
	// 	throw new ThrowReturn(rs.msg);
	// }
	//
	// await blockLock.updatePassword(passwordId, {
	// 	code: newCode,
	// 	roomId: _.get(room, '_id'),
	// 	effectiveTime,
	// 	invalidTime,
	// });
	//
	// logger.info('tuya updateCode', deviceId, { passwordId, newCode });
	// res.passId = passwordId;
	//
	// return res;
}

async function findBookingIdByLog({ blockId, roomId, log }) {
	if (!roomId) return;
	const accessDate = new Date(log.time).zeroHours();
	const prevDate = moment(accessDate).add(-1, 'day').toDate();
	const query = {
		blockId,
		'dates.date': { $in: [prevDate, accessDate] },
		roomId,
	};

	const reservations = await models.Reservation.find(query)
		.sort({ 'dates.date': -1 })
		.select('guests bookingId')
		.populate('bookingId', 'doorCode');

	if (reservations.length === 0) return;

	let reservation;

	const accessTime = moment(log.time).format('HH:mm');
	if (
		_.last(reservations).getCheck('out') ||
		_.first(reservations).getCheck('in') ||
		(accessTime > RuleDay.to && log.action === 'unlock_card') ||
		(accessTime > RuleDay.from && log.action === 'unlock_temporary')
	) {
		reservation = _.first(reservations);
	} else {
		reservation = _.last(reservations);
	}

	const rs = {
		bookingId: reservation.bookingId._id,
		checkin: !!reservation.getCheck('in'),
	};

	if (!rs.checkin) {
		if (log.action === 'unlock_temporary' || reservations.length === 1) {
			rs.autoCheckin = true;
		} else if (log.action === 'unlock_card' && _.last(reservations).getCheck('out')) {
			rs.autoCheckin = true;
		}
	}

	return rs;
}

async function onReceivedLog(log) {
	try {
		await asyncLock.acquire(log.messageId, async () => {
			const bizCode = _.get(log, 'payload.data.bizCode', '');
			const { devId, properties } = _.get(log, 'payload.data.bizData', {});
			if (bizCode !== 'devicePropertyMessage') return;
			logger.info(`TUYA LOG device ${devId}`, JSON.stringify(properties));

			const accessLog = await models.DoorAccessLog.findOne({
				deviceId: devId,
				messageId: log.messageId,
				time: { $gte: moment().startOf('d').toISOString() },
			}).lean();
			if (accessLog) return;

			const lock = await models.BlockLock.findOne({ deviceId: devId, active: true }).lean();
			if (!lock) return;

			const to = moment();
			const from = moment(to).subtract(15, 'minute');
			const tuyaClient = await getTuyaClient();

			const { logs: lockLogs } = await tuyaClient.smartLock.getLogs({
				deviceId: devId,
				from: from.valueOf(),
				to: to.valueOf(),
				showMediaInfo: true,
			});

			await (properties || []).asyncMap(prop => {
				if (prop.code === 'battery_state' && prop.value) {
					return models.TuyaDevice.updateOne({ deviceId: devId }, { batteryState: prop.value });
				}
				if (!_.get(prop, 'code', '').includes('unlock_')) return;

				const lockLog =
					_.find(lockLogs, _lockLog => {
						return _lockLog.update_time === prop.time;
					}) || {};

				const tempPassword = _.get(lock, 'temporaryPasswords', []).find(pwd => pwd.name === lockLog.nick_name);
				const roomIds = _.get(tempPassword, 'roomIds', []);
				let roomId;

				if (roomIds.length <= 1) roomId = _.head(roomIds);
				return createLog({ ...prop, roomId, devId, blockId: lock.blockId, lockLog, messageId: log.messageId });
			});
		});
	} catch (error) {
		logger.error('TUYA LOG:', error);
	}
}

async function createLog({ code, value, time, devId, roomId, blockId, lockLog, messageId }) {
	const log = {
		deviceId: devId,
		blockId,
		roomId,
		action: code,
		value,
		time,
		nameUnlocker: lockLog.nick_name,
		lockType: DOOR_LOCK_TYPE.TUYA,
		messageId,
	};
	const data = await findBookingIdByLog({ blockId, roomId, log: { code, value, time } });
	if (data) {
		log.bookingId = _.get(data, 'bookingId', '').toString();
		log.checkin = data.checkin;
	}

	return models.DoorAccessLog.create(log);
}

async function deletePassword(deviceId, passwordId) {
	const tuyaClient = await getTuyaClient();
	return tuyaClient.smartLock.deleteTempPassword(deviceId, passwordId);
}

async function createTemporaryPassword({ deviceId, name, password, effectiveTime, invalidTime }) {
	const present = moment();
	effectiveTime = effectiveTime || present.unix();
	invalidTime = invalidTime || present.add(1, 'y').unix();
	const tuyaClient = await getTuyaClient();

	if (!deviceId) throw new ThrowReturn('Missing deviceId');

	const res = await tuyaClient.smartLock.createTempPassword({
		deviceId,
		name,
		password,
		effectiveTime,
		invalidTime,
	});

	if (_.get(res, 'error_code') === 1 || !res) return {};

	const passwordId = res.id;

	return {
		name,
		passwordId,
		roomIds: [],
		effectiveTime,
		invalidTime,
		code: password,
	};
}

async function getTempPasswordsFromTuyaCloud(deviceId, valid = true) {
	const tuyaClient = await getTuyaClient();
	let tempPasswords = await tuyaClient.smartLock.getPasswords(deviceId);
	if (_.get(tempPasswords, 'error_code', 0) === 1) return [];

	if (valid) {
		tempPasswords = _.filter(tempPasswords, tPwd => VALID_PASSWORD_PHASES.includes(tPwd.phase));
	}

	return tempPasswords.map(pwd => ({
		name: pwd.name,
		passwordId: pwd.id,
		roomIds: [],
		effectiveTime: pwd.effective_time,
		invalidTime: pwd.invalid_time,
		code: '',
	}));
}

// sync tuya cloud temporary passwords
// const generator = customAlphabet('0123456789', 6);
// const generateCode = (length = 6) => generator(length);

// async function createTemporaryPasswords(blockLock, quantity = 0) {
// 	if (!quantity || quantity <= 0) return [];
// 	const temporatyPasswordReqs = [];
//
// 	const tuyaDevice = await models.TuyaDevice.findOne({ deviceId: blockLock.deviceId }).select('deviceName').lean();
// 	const blockShortName = _.get(blockLock, 'blockId.info.shortName.0', '');
// 	const tempPwdName = `${blockShortName}_${_.get(tuyaDevice, 'deviceName', '')}`;
//
// 	for (let i = 1; i <= quantity; i++) {
// 		const code = generateCode(blockLock.temporaryPasswordLengthRequirement);
// 		const pwdName = `${tempPwdName}_${generateCode()}`;
// 		temporatyPasswordReqs.push(
// 			createTemporaryPassword({ deviceId: blockLock.deviceId, name: pwdName, password: code })
// 		);
// 	}
//
// 	const temporaryPasswords = await Promise.all(temporatyPasswordReqs);
// 	return temporaryPasswords.filter(pwd => pwd.passwordId);
// }

async function resolveInvalidPwds(blockLock, invalidPwds = []) {
	// const tuyaClient = await getTuyaClient();
	if (!_.get(blockLock, 'temporaryPasswords.length', 0)) return;

	await invalidPwds.asyncMap(async invalidPwd => {
		const tempPwd = blockLock.getPasswordInPool();
		if (!tempPwd) return;

		// const now = moment();
		// const effectiveTime = now.unix();
		// const invalidTime = now.add(1, 'y').unix();

		// const updateTuyaPassword = tuyaClient.smartLock.updateTempPassword({
		// 	deviceId: blockLock.deviceId,
		// 	passwordId: tempPwd.passwordId,
		// 	password: invalidPwd.code,
		// 	effectiveTime,
		// 	invalidTime,
		// });
		const resolveInvalidPassword = blockLock.resolveInvalidPasswordId(tempPwd.passwordId, invalidPwd);
		return resolveInvalidPassword;

		// return Promise.all([updateTuyaPassword, resolveInvalidPassword]);
	});

	return blockLock.save();
}

async function getInvalidPwdsMissingInPwdPool(blockLock) {
	const validPasswordIds = blockLock.temporaryPasswords.map(pwd => pwd.passwordId);

	const roomsContainInvalidPassword = await models.Room.find({
		lock: {
			$elemMatch: {
				lockId: blockLock._id,
				passId: { $nin: validPasswordIds },
			},
		},
	})
		.select('lock')
		.lean();

	if (!roomsContainInvalidPassword.length) return [];

	const invalidPassword = roomsContainInvalidPassword.reduce((_invalidPassword, room) => {
		room.lock.forEach(lock => {
			if (validPasswordIds.includes(lock.passId)) return;
			if (!_invalidPassword[lock.passId]) {
				_invalidPassword[lock.passId] = { roomIds: [], code: '' };
			}
			_invalidPassword[lock.passId].roomIds.push(room._id);
			_invalidPassword[lock.passId].code = lock.code;
		});

		return _invalidPassword;
	}, {});

	return _.entries(invalidPassword).map((passwordId, { roomIds, code }) => ({ roomIds, code, passwordId }));
}

async function syncTempPasswords(blockLockId) {
	try {
		await asyncLock.acquire(blockLockId.toString(), async () => {
			const blockLock = await models.BlockLock.findById(blockLockId).populate('blockId', 'info.shortName');

			if (!blockLock) throw new ThrowReturn('Block lock does not exist');
			if (blockLock.lockType !== DOOR_LOCK_TYPE.TUYA) throw new ThrowReturn('Only support for Tuya lock');

			let temporaryPasswords = [];
			// const temporaryPasswordCreationLimit = _.get(
			// 	blockLock,
			// 	'temporaryPasswordCreationLimit',
			// 	DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT
			// );
			let cloudPwdPool = await getTempPasswordsFromTuyaCloud(blockLock.deviceId);
			// cloudPwdPool.splice(0, cloudPwdPool.length - temporaryPasswordCreationLimit);

			const localPwdPool = [...blockLock.temporaryPasswords];
			const cloudPwdPoolKeyBy = _.keyBy(cloudPwdPool, pwd => pwd.passwordId);
			const localPwdPoolKeyBy = _.keyBy(localPwdPool, pwd => pwd.passwordId);

			// const newCreatingPwdQuantity = temporaryPasswordCreationLimit - cloudPwdPool.length;
			// const newTempPasswords = await createTemporaryPasswords(blockLock, newCreatingPwdQuantity);
			// temporaryPasswords = [...newTempPasswords];

			cloudPwdPool.forEach(({ passwordId }) => {
				const tempPwd = localPwdPoolKeyBy[passwordId] || cloudPwdPoolKeyBy[passwordId];
				tempPwd.name = _.get(cloudPwdPoolKeyBy, [passwordId, 'name'], '');
				temporaryPasswords.push(tempPwd);
			});

			blockLock.temporaryPasswords = temporaryPasswords;
			await blockLock.save();

			let invalidLocalPwds = await getInvalidPwdsMissingInPwdPool(blockLock);
			invalidLocalPwds = [
				...invalidLocalPwds,
				...localPwdPool.filter(({ passwordId }) => !cloudPwdPoolKeyBy[passwordId]),
			];

			await resolveInvalidPwds(blockLock, invalidLocalPwds);

			return blockLock.temporaryPasswords;
		});
	} catch (error) {
		logger.error('Tuya temporary password sync:', error);
	}
}

module.exports = {
	updateCode,
	getDevices,
	getHomes,
	deletePassword,
	createTemporaryPassword,
	getTempPasswordsFromTuyaCloud,
	syncTempPasswords,
};
