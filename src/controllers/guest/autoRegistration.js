const path = require('path');
const _ = require('lodash');
const { fork } = require('child_process');
const fs = require('fs');

const { logger } = require('@utils/logger');
const { GuestRegisterType, GuestRegisterAccountType } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { ACTION } = require('./const');
const registration = require('./registration');

const TIMEOUT = 1000 * 60 * 3;
const nationalRequests = {};
const internationalRequests = {};

function getProcessPath(config) {
	const fileName =
		config.nationality === GuestRegisterType.International
			? 'autoProcessInternational.js'
			: config.accountType === GuestRegisterAccountType.DVC_CAPCHA
			? 'autoProcess.js'
			: config.accountType === GuestRegisterAccountType.DVC_OTP
			? 'autoProcess3.js'
			: config.accountType === GuestRegisterAccountType.DVC_ASM
			? 'autoProcess4.js'
			: 'autoProcess5.js';
	return path.resolve(__dirname, fileName);
}

async function autoRegistration(req, res) {
	const { blockId, date, type, nationality } = req.query;
	const { guests } = req.body;
	const isInternational = nationality === GuestRegisterType.International;

	const config = await models.GuestRegistrationConfig.findOne({
		blockId,
		nationality: isInternational ? GuestRegisterType.International : GuestRegisterType.National,
		active: true,
	}).lean();
	if (!config) {
		throw new ThrowReturn('Cấu hình không tồn tại!');
	}

	const guestData = await registration.getData({ blockId, date, type, guestIds: guests }, req.decoded.user);
	if (!guestData.length || guestData.some(g => !g.passportNumber || !g.dayOfBirth)) {
		throw new ThrowReturn('Thông tin khách hàng không đầy đủ. Hãy kiểm tra lại!');
	}

	const requests = isInternational ? internationalRequests : nationalRequests;
	let childProcess;

	if (_.has(requests, [blockId])) {
		// throw new ThrowReturn('Hệ thống đang xử lý yêu cầu trước đó, vui lòng thử lại sau ít phút!');
		clearTimeout(_.get(requests, [blockId, 'clearTime']));

		childProcess = _.get(requests, [blockId, 'childProcess']);
	} else {
		childProcess = fork(getProcessPath(config), [
			config.username,
			config.password,
			config.username, // config.accountType === GuestRegisterAccountType.DVC_ASM ? blockId : '',
			config.defaultData ? JSON.stringify(config.defaultData) : '',
			config.isExtCheckout ? true : '',
		]);

		_.set(requests, [blockId, 'childProcess'], childProcess);
		_.set(requests, [blockId, 'createdBy'], req.decoded.user._id);
		_.set(requests, [blockId, 'date'], date);
	}

	const clearTime = setTimeout(() => {
		finishProcess(blockId, {
			success: false,
			reason: 'Time out',
			isInternational,
		});
	}, TIMEOUT);

	_.set(requests, [blockId, 'clearTime'], clearTime);

	childProcess.on('error', e => {
		logger.error('child_process auto_register', blockId, config.username, e);
		finishProcess(blockId, {
			success: false,
			reason: 'Process Error',
			isInternational,
		});
		if (!res.headersSent) {
			res.json({
				error_code: 1,
				error_msg: 'Có lỗi xảy ra vui lòng thử lại sau!',
			});
		}
	});

	childProcess.on('message', async data => {
		if (data.type === ACTION.SUCCESS) {
			finishProcess(blockId, {
				success: true,
				isInternational,
			});
			if (!res.headersSent) {
				res.sendData({
					success: true,
				});
			}
		}
		if (data.type === ACTION.ERROR) {
			finishProcess(blockId, {
				success: false,
				reason: data.payload,
				isInternational,
			});
			if (!res.headersSent) {
				res.json({
					error_code: 1,
					error_msg: data.payload || 'Có lỗi xảy ra vui lòng thử lại sau!',
				});
			}
		}
		if (data.type === ACTION.READY) {
			res.sendData(data.payload);
		}
		if (data.type === ACTION.GET_FILE) {
			try {
				_.set(requests, [blockId, 'guests'], _.map(guestData, '_id'));

				if (data.payload && data.payload.raw) {
					const rawData = await registration.getGuestData(guestData);

					childProcess.send({
						type: ACTION.GET_FILE_DONE,
						payload: rawData,
					});
				} else {
					const filePath = isInternational
						? await registration.createInternationalFile(guestData, data.payload)
						: await registration.createNationalFile(guestData, data.payload);
					_.set(requests, [blockId, 'filePath'], filePath);

					childProcess.send({
						type: ACTION.GET_FILE_DONE,
						payload: filePath,
					});
				}
			} catch (e) {
				logger.error(e);
			}
		}
	});
}

function getProcess(blockId, isInternational) {
	const requests = isInternational ? internationalRequests : nationalRequests;
	const childProcess = _.get(requests, [blockId, 'childProcess']);
	if (!childProcess) {
		throw new ThrowReturn('Luồng không tồn tại, hãy bắt đầu lại!');
	}

	return childProcess;
}

function finishProcess(blockId, { success, reason, isInternational }) {
	const requests = isInternational ? internationalRequests : nationalRequests;
	const childProcess = _.get(requests, [blockId, 'childProcess']);
	if (childProcess) {
		if (requests[blockId].filePath) fs.unlink(requests[blockId].filePath, () => {});

		if (success) {
			models.GuestRegistrationAuto.create({
				blockId,
				date: requests[blockId].date,
				guests: requests[blockId].guests,
				createdBy: requests[blockId].createdBy,
				success,
				reason,
				nationality: isInternational ? GuestRegisterType.International : GuestRegisterType.National,
			}).catch(() => {});
		}

		_.unset(requests, [blockId]);

		childProcess.kill('SIGINT');
	}
}

async function getCapcha(req, res) {
	const { blockId, nationality } = req.query;
	const isInternational = nationality === GuestRegisterType.International;

	const childProcess = getProcess(blockId, isInternational);
	childProcess.send({ type: ACTION.GET_CAPCHA });

	const listener = ({ type, payload }) => {
		if (type === ACTION.GET_CAPCHA_DONE) {
			childProcess.removeListener('message', listener);
			if (payload.requireCapcha === false && payload.errorCode) {
				res.json({ error_code: 1, error_msg: payload.errorMsg });
			} else {
				res.sendData(payload);
			}
		}
		if (type === ACTION.SUCCESS) {
			childProcess.removeListener('message', listener);
			finishProcess(blockId, {
				success: true,
				isInternational,
			});
			res.sendData();
		}
		if (type === ACTION.ERROR) {
			childProcess.removeListener('message', listener);
			finishProcess(blockId, {
				success: false,
				reason: payload,
				isInternational,
			});
			if (!res.headersSent) {
				res.json({
					error_code: 1,
					error_msg: payload || 'Có lỗi xảy ra vui lòng thử lại sau!',
				});
			}
		}
	};
	childProcess.on('message', listener);
}

async function sendCapcha(req, res) {
	const { blockId, nationality } = req.query;
	const isInternational = nationality === GuestRegisterType.International;

	const childProcess = getProcess(blockId, isInternational);
	childProcess.send({
		type: ACTION.SEND_CAPCHA,
		payload: req.body.value,
	});

	const listener = ({ type, payload }) => {
		if (type === ACTION.SEND_CAPCHA_DONE || type === ACTION.SUCCESS) {
			childProcess.removeListener('message', listener);
			res.sendData(payload);
		}
		if (type === ACTION.ERROR) {
			childProcess.removeListener('message', listener);
			finishProcess(blockId, {
				success: false,
				reason: payload,
				isInternational,
			});
			if (!res.headersSent) {
				res.json({
					error_code: 1,
					error_msg: payload || 'Có lỗi xảy ra vui lòng thử lại sau!',
				});
			}
		}
	};
	childProcess.on('message', listener);
}

async function getOTP(req, res) {
	const { blockId, nationality } = req.query;
	const isInternational = nationality === GuestRegisterType.International;

	const childProcess = getProcess(blockId, isInternational);
	childProcess.send({ type: ACTION.GET_OTP });

	const listener = ({ type, payload }) => {
		if (type === ACTION.GET_OTP_DONE) {
			childProcess.removeListener('message', listener);
			res.sendData(payload);
		}
	};
	childProcess.on('message', listener);
}

async function sendOTP(req, res) {
	const { blockId, nationality } = req.query;
	const isInternational = nationality === GuestRegisterType.International;

	const childProcess = getProcess(blockId, isInternational);
	childProcess.send({
		type: ACTION.SEND_OTP,
		payload: req.body.value,
	});

	const listener = ({ type, payload }) => {
		if (type === ACTION.SEND_OTP_DONE || type === ACTION.SUCCESS) {
			childProcess.removeListener('message', listener);
			res.sendData(payload);
		}
		if (type === ACTION.ERROR) {
			childProcess.removeListener('message', listener);
			finishProcess(blockId, {
				success: false,
				reason: payload,
				isInternational,
			});
			if (!res.headersSent) {
				res.json({
					error_code: 1,
					error_msg: payload || 'Có lỗi xảy ra vui lòng thử lại sau!',
				});
			}
		}
	};
	childProcess.on('message', listener);
}

async function getRegistrations(req, res) {
	const { date, blockId, nationality } = req.query;

	const dateFormat = new Date(date).toDateMysqlFormat();
	const data = await models.GuestRegistrationAuto.find({
		blockId,
		date: dateFormat,
		// success: true,
		nationality: nationality || GuestRegisterType.National,
	})
		.sort({ createdAt: -1 })
		.populate('guests', 'fullName name passportNumber address avatar')
		.populate('createdBy', 'username name')
		.lean();

	res.sendData({
		data,
	});
}

async function resetRegistration(req, res) {
	const { blockId, nationality } = req.query;

	const isInternational = nationality === GuestRegisterType.International;
	const childProcess = _.get(isInternational ? internationalRequests : nationalRequests, [blockId, 'childProcess']);
	if (childProcess) {
		// finishProcess(blockId, {
		// 	success: false,
		// 	reason: 'Cancel',
		// 	isInternational,
		// });
	}

	res.sendData();
}

module.exports = {
	autoRegistration,
	getCapcha,
	sendCapcha,
	getOTP,
	sendOTP,
	getRegistrations,
	resetRegistration,
};
