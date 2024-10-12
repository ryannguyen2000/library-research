const _ = require('lodash');
const moment = require('moment');
const { v4: uuid } = require('uuid');
const AsyncLock = require('async-lock');

const ThrowReturn = require('@core/throwreturn');
const {
	TransactionStatus,
	TransactionTypes,
	SYS_BANK_ACCOUNT_TYPE,
	PayoutStates,
	PayoutPayMethods,
	MessageSentType,
	MessageGroupType,
	MessageGroupInternalType,
	BANK_ACCOUNT_SOURCE_TYPE,
	PayoutPaySources,
	PayoutSources,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const { Settings } = require('@utils/setting');
const { eventEmitter, EVENTS } = require('@utils/events');
const { formatPrice } = require('@utils/func');

const models = require('@models');
const MBBankService = require('@services/bank/MBBank');
const BankService = require('@services/bank');
const messageOTT = require('@controllers/message/ott');
const { getRemark, replaceMsg } = require('./utils');

const MAX_RETRY = 1;

const payRequestLock = new AsyncLock();

async function makePayRequestLock(lockId, data) {
	lockId = _.toString(lockId);

	if (payRequestLock.isBusy(lockId)) {
		return Promise.reject('Can not make payment transfer: Payment is processing!');
	}

	return await payRequestLock.acquire(lockId, async () => await makePayRequest(data));
}

async function makePayRequest(data, retry = 0) {
	const { serviceAccount, debitAccount, creditAccount, remark, transferAmount, ...otherInfo } = data;

	if (!debitAccount.populated('bankId')) {
		await debitAccount.populate('bankId');
	}
	if (!creditAccount.populated('bankId')) {
		await creditAccount.populate('bankId');
	}

	const transaction = await models.BankTransaction.create({
		_id: uuid(),
		accountId: debitAccount._id,
		accountNo: debitAccount.accountNos[0],
		bankName: debitAccount.bankId.shortName,
		bankCode: debitAccount.bankId.bankCode,
		meta: {
			amount: -transferAmount,
		},
		transType: TransactionTypes.DEBIT,
		status: TransactionStatus.PROCESSING,
		isFee: true,
		fromAPI: true,
		...otherInfo,
	});

	try {
		if (!creditAccount.validated || creditAccount.bankId.forceValidation) {
			await creditAccount.validateAccount(serviceAccount, true);
		}

		if (global.isDev) {
			transaction.status = TransactionStatus.SUCCESS;
			transaction.tranTime = new Date();
		} else {
			const { meta, reqData, resData, status, statusDescription, statusText } = await MBBankService.makeTranser({
				serviceAccount,
				debitAccount,
				creditAccount,
				transferAmount,
				remark,
			});

			transaction.meta = meta;
			transaction.reqData = reqData;
			transaction.status = status;
			transaction.statusDescription = statusDescription;
			transaction.tranTime = new Date();
			transaction.statusText = statusText;

			if (resData && resData.ftNumber) {
				transaction.docNo = resData.ftNumber;
			}
		}
	} catch (e) {
		logger.error('makePayRequest', e);

		transaction.status = TransactionStatus.ERROR;
		transaction.statusDescription = JSON.stringify(e);
	}

	if (transaction.status === TransactionStatus.ERROR && retry < MAX_RETRY) {
		transaction.hasRetried = true;
		await transaction.save();

		await Promise.delay(1000);
		return makePayRequest(data, retry + 1);
	}

	await transaction.save();

	return transaction;
}

async function createBankTransferRequest({ debitAccount, creditAccount, transferAmount, remark }) {
	if (!_.get(BankService, [debitAccount.shortName, 'makeTranserRequest'])) {
		throw new ThrowReturn('Ngân hàng tạm thời chưa được hỗ trợ!');
	}

	const data = await BankService[debitAccount.shortName].makeTranserRequest({
		username: debitAccount.username,
		password: debitAccount.decryptedPassword || debitAccount.password,
		date: new Date().toDateMysqlFormat(),
		accountNo: debitAccount.accountNos[0],
		accountId: _.get(debitAccount.configs, 'accountId'),
		accountOriginName: _.get(debitAccount.configs, 'originName'),
		creditAccountNo: creditAccount.accountNos[0],
		creditAccountName: creditAccount.accountName,
		creditAccountBankCode: creditAccount.bankId.bankCode,
		creditAccountBankBin: creditAccount.bankId.bin,
		transferAmount,
		remark,
	});

	return data;
}

async function checkPermissionForApprovePayRequest(user, request, decline) {
	// if (global.isDev) return;

	const categoryId = _.map(request.payouts, 'categoryId');

	const validationData = await models.PayoutRequestConfig.checkPermission({
		user,
		categoryId,
		decline,
		amount: request.amount,
	});

	if (validationData.code !== 0) {
		throw new ThrowReturn(validationData.msg);
	}

	const userBlockIds = await user.getBlockIds();
	const objBlockIds = _.mapKeys(userBlockIds);

	if (request.blockIds.some(blockId => !objBlockIds[blockId])) {
		throw new ThrowReturn('Bạn không có quyền thực hiện tác vụ này!');
	}

	const debitAccount = await models.BankAccount.findOne({
		_id: _.get(request.debitAccountId, '_id') || request.debitAccountId,
		groupIds: { $in: user.groupIds },
	});
	if (!debitAccount) {
		throw new ThrowReturn('Bạn không có quyền thực hiện tác vụ này!');
	}

	return validationData;
}

function validatePayStatus(status, approved) {
	if (status === TransactionStatus.DELETED || status === TransactionStatus.DECLINED) {
		throw new ThrowReturn('Lệnh chi đã bị huỷ!');
	}
	if (status !== TransactionStatus.WAITING && status !== TransactionStatus.WAIT_FOR_APPROVE) {
		throw new ThrowReturn('Lệnh chi đã được xử lí trước đó!');
	}
	if (approved && status === TransactionStatus.WAITING) {
		throw new ThrowReturn('Lệnh chi chưa được tạo!');
	}
}

function validatePayout(payout, request) {
	if (!payout.payAccountId) {
		throw new ThrowReturn('Có khoản chi chưa có thông tin người nhận!');
	}
	if (payout.payAccountId.sourceType !== BANK_ACCOUNT_SOURCE_TYPE.BANKING) {
		throw new ThrowReturn('Không thể tạo lệnh với tài khoản chi tiền mặt!');
	}
	if (!payout.inReport) {
		throw new ThrowReturn('Có khoản chi chưa tạo duyệt chi!');
	}

	if (payout.payStatus === TransactionStatus.PROCESSING || payout.payStatus === TransactionStatus.SUCCESS) {
		throw new ThrowReturn('Có khoản chi đã tạo lệnh chi!');
	}

	if (
		(request.payMethod === PayoutPayMethods.MANUAL_BANKING || request.isNew) &&
		payout.payStatus === TransactionStatus.WAIT_FOR_APPROVE
	) {
		throw new ThrowReturn('Có khoản chi đã tạo lệnh chi!');
	}

	if (request.isNew && payout.payRequestId && payout.payStatus !== TransactionStatus.ERROR) {
		throw new ThrowReturn('Có khoản chi đã tạo lệnh chi!');
	}
}

async function validateBulksPayouts(payouts, debitAccount, request) {
	const uniqAccount = _.uniqBy(payouts, p => (p.payAccountId._id || p.payAccountId).toString()).length;

	if (request.mergeTransaction && uniqAccount > 1) {
		throw new ThrowReturn('Tính năng gộp giao dịch chỉ có thể áp dụng khi tất cả khoản chi có cùng một tài khoản!');
	}

	const payMethod = debitAccount.serviceAccountId
		? PayoutPayMethods.AUTO_BANKING
		: !!debitAccount.username && _.get(BankService, [debitAccount.shortName, 'makeTranserRequest'])
		? PayoutPayMethods.MANUAL_BANKING
		: uniqAccount > 1 && _.get(BankService, [debitAccount.shortName, 'exportFileBulkPayments'])
		? PayoutPayMethods.FILE_BULK
		: PayoutPayMethods.VIET_QR;

	payouts.forEach(payout => validatePayout(payout, request));

	await payouts.filter(p => !p.payAccountId.validated).asyncForEach(p => p.payAccountId.validateAccount(null, true));

	return { payMethod };
}

async function createBulkBankTransferRequest({ debitAccount, payouts, payRequest }) {
	if (!_.get(BankService, [debitAccount.shortName, 'makeBulkTranserRequest'])) {
		throw new ThrowReturn('Ngân hàng tạm thời chưa được hỗ trợ!');
	}

	const category = await models.PayoutCategory.findById(payouts[0].categoryId);

	const data = await BankService[debitAccount.shortName].makeBulkTranserRequest({
		username: debitAccount.username,
		password: debitAccount.decryptedPassword || debitAccount.password,
		date: new Date().toDateMysqlFormat(),
		accountNo: debitAccount.accountNos[0],
		accountId: _.get(debitAccount.configs, 'accountId'),
		accountOriginName: _.get(debitAccount.configs, 'originName'),
		requestNo: payRequest.no,
		isPayroll: category.isPayroll,
		items: payouts.map(payout => {
			const creditAccount = payout.payAccountId;
			return {
				creditAccountNo: creditAccount.accountNos[0],
				creditAccountName: creditAccount.accountName,
				creditAccountBankCode: creditAccount.bankId.bankCode,
				creditAccountBankBin: creditAccount.bankId.bin,
				transferAmount: payout.currencyAmount.exchangedAmount,
				remark: getRemark(payRequest, payout),
			};
		}),
	});

	return data;
}

async function makeNewPayRequest(body, user, requestId, options = {}) {
	let payRequest;

	if (requestId) {
		payRequest = await models.PayoutRequest.findById(requestId);

		if (payRequest) {
			if (payRequest.status === TransactionStatus.ERROR) {
				payRequest = null;
			} else if (
				payRequest.status !== TransactionStatus.WAITING &&
				(payRequest.payMethod === PayoutPayMethods.MANUAL_BANKING ||
					payRequest.status !== TransactionStatus.WAIT_FOR_APPROVE)
			) {
				throw new ThrowReturn('Trạng thái không hợp lệ!');
			}
		}
	}

	const debitAccount = await models.BankAccount.findById(
		body.payDebitAccountId || _.get(payRequest, 'debitAccountId')
	);
	if (!debitAccount) {
		throw new ThrowReturn('Tài khoản chi tiền không hợp lệ!');
	}

	const status = body.status || _.get(payRequest, 'status') || TransactionStatus.WAIT_FOR_APPROVE;
	if (status !== TransactionStatus.WAITING && status !== TransactionStatus.WAIT_FOR_APPROVE) {
		throw new ThrowReturn('Trạng thái không hợp lệ!');
	}

	const payouts = await models.Payout.find({
		_id: body.payoutIds || _.map(_.get(payRequest, 'payouts'), 'payoutId'),
	})
		.populate({ path: 'payAccountId', populate: 'bankId' })
		.populate({ path: 'export', select: 'noId' });

	if (!payouts.length) {
		throw new ThrowReturn('Phải có ít nhất 1 khoản chi!');
	}

	if (!payRequest) {
		payRequest = new models.PayoutRequest();
	}

	_.assign(payRequest, {
		...body,
		createdBy: user && user._id,
		debitAccountId: debitAccount._id,
		payouts: payouts.map(payout => ({
			payoutId: payout._id,
			categoryId: payout.categoryId,
			creditAccountId: payout.payAccountId._id,
			status,
			amount: payout.currencyAmount.exchangedAmount,
		})),
		status,
		groupIds: user ? user.groupIds : body.groupIds,
		blockIds: _.flatten(_.map(payouts, 'blockIds')),
		roomIds: _.flatten(_.map(payouts, 'roomIds')),
	});

	const isCreateRequest = status === TransactionStatus.WAIT_FOR_APPROVE;
	if (isCreateRequest) {
		const { payMethod } = await validateBulksPayouts(payouts, debitAccount, payRequest);
		payRequest.payMethod = payMethod;
	}

	await payRequest.save();

	if (payRequest.payMethod === PayoutPayMethods.MANUAL_BANKING && isCreateRequest) {
		try {
			if (payouts.length <= 1 || payRequest.mergeTransaction) {
				const transferAmount = payRequest.mergeTransaction
					? _.sumBy(payRequest.payouts, 'amount')
					: payouts[0].currencyAmount.exchangedAmount;

				payRequest.dataAPI = await createBankTransferRequest({
					debitAccount,
					creditAccount: payouts[0].payAccountId,
					transferAmount,
					remark: getRemark(payRequest, payouts[0]),
				});
			} else {
				payRequest.dataAPI = await createBulkBankTransferRequest({
					debitAccount,
					payouts,
					payRequest,
				});
			}

			await payRequest.save();
		} catch (e) {
			logger.error(e);
			if (requestId) {
				payRequest.setStatus(TransactionStatus.WAITING);
				await payRequest.save();
			} else {
				await models.PayoutRequest.deleteOne({ _id: payRequest._id });
			}

			throw e;
		}
	}

	if (isCreateRequest) {
		await models.Payout.updateMany(
			{
				_id: { $in: _.map(payouts, '_id') },
			},
			{
				payStatus: status,
				payDebitAccountId: debitAccount._id,
				payRequestId: payRequest._id,
				source: models.Payout.getSourceByBankAccount(debitAccount),
			}
		);
	}

	if (isCreateRequest && !options.skipNotification) {
		sendMsgRequest({ payRequest });
	}

	return payRequest;
}

async function approveNewPayRequest({ user, requestId, fromOTT, skipNotification }) {
	const request = await models.PayoutRequest.findById(requestId)
		.populate({
			path: 'payouts.payoutId',
			populate: {
				path: 'export',
			},
		})
		.populate({
			path: 'payouts.creditAccountId',
			populate: {
				path: 'bankId',
			},
		})
		.populate({
			path: 'debitAccountId',
			populate: {
				path: 'bankId',
			},
		});
	if (!request) {
		throw new ThrowReturn().status(404);
	}

	const validateData = await checkPermissionForApprovePayRequest(user, request);
	if (fromOTT && !validateData.allowApproveByMsg) {
		throw new ThrowReturn('Vui lòng xác nhận qua phần mềm!');
	}

	await validatePayStatus(request.status, true);

	if (fromOTT && !isValidAmount(request.amount)) {
		throw new ThrowReturn('Vui lòng xác nhận qua phần mềm!');
	}

	const debitAccount = request.debitAccountId;

	if (request.payMethod === PayoutPayMethods.MANUAL_BANKING) {
		throw new ThrowReturn('Vui lòng xác nhận qua App ngân hàng!');
	}
	if (request.payMethod !== PayoutPayMethods.AUTO_BANKING || !debitAccount.serviceAccountId) {
		throw new ThrowReturn('Ngân hàng hiện tại chưa hỗ trợ!');
	}

	const serviceAccount = await models.BankServiceAccount.findOne({
		_id: debitAccount.serviceAccountId,
		active: true,
		accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND_PAY,
	});
	if (!serviceAccount) {
		throw new ThrowReturn('Ngân hàng hiện tại chưa hỗ trợ!');
	}

	request.approvedBy = user._id;
	request.approvedAt = new Date();
	request.approvedFrom = fromOTT ? PayoutPaySources.Zalo : PayoutPaySources.Cms;
	request.status = TransactionStatus.PROCESSING;
	await request.save();

	const payoutIds = _.compact(_.map(request.payouts, 'payoutId._id'));

	const reports = await models.PayoutExport.find({
		payouts: { $in: payoutIds },
		state: { $ne: PayoutStates.DELETED },
	});
	if (reports.length) {
		const approveIndex = validateData.approveIndex || 0;

		await reports.asyncMap(report => {
			const approved = [];

			_.range(4).forEach(i => {
				approved[i] = report.approved[i] || { user: null };
			});

			approved[approveIndex] = {
				date: request.approvedAt,
				user: request.approvedBy,
				state: PayoutStates.APPROVE,
			};
			report.approved = approved;
			if (!report.confirmedDate) report.confirmedDate = request.approvedAt;

			return report.save();
		});
	}

	let transaction;

	if (request.mergeTransaction) {
		const remark = getRemark(request, request.payouts[0].payoutId);

		transaction = await makePayRequestLock(request._id, {
			serviceAccount,
			debitAccount,
			creditAccount: request.payouts[0].creditAccountId,
			remark,
			transferAmount: request.amount || _.sumBy(request.payouts, 'amount'),
			requestId: request._id,
		});
	}

	if (request.payouts.length === 1) {
		const [payout] = request.payouts;

		transaction = await makePayRequestLock(payout.payoutId._id, {
			serviceAccount,
			debitAccount,
			creditAccount: payout.creditAccountId,
			remark: getRemark(request, payout.payoutId),
			transferAmount: payout.amount,
			payoutId: payout.payoutId._id,
			requestId: request._id,
		});
	}

	if (transaction) {
		if (transaction.status === TransactionStatus.ERROR) {
			request.setStatus(TransactionStatus.WAIT_FOR_APPROVE);
			await request.save();

			throw new ThrowReturn(transaction.statusText);
		}
	}

	await models.Payout.updateMany(
		{ _id: { $in: payoutIds } },
		{
			payConfirmedBy: user._id,
			payConfirmedDate: new Date(),
			payRequestId: request._id,
			state: PayoutStates.CONFIRMED,
		}
	);

	if (!transaction) {
		request.payouts
			.filter(payout => payout.status !== TransactionStatus.SUCCESS)
			.asyncForEach(payout =>
				makePayRequestLock(payout._id, {
					serviceAccount,
					debitAccount,
					creditAccount: payout.creditAccountId,
					remark: getRemark(request, payout.payoutId),
					transferAmount: payout.amount,
					payoutId: payout.payoutId._id,
					requestId: request._id,
				}).catch(e => {
					logger.error('approveNewPayRequest.makePayRequestLock', requestId, payout, e);
				})
			);
	}

	if (!skipNotification) {
		sendResultToGroup({
			user,
			payRequest: request,
			approved: true,
		});
	}

	return (
		transaction || {
			status: request.status,
		}
	);
}

async function declineNewPayRequest({ user, requestId, fromOTT, skipCheckPermission }) {
	const request = await models.PayoutRequest.findById(requestId);
	if (!request) {
		throw new ThrowReturn().status(404);
	}

	if (!skipCheckPermission) {
		await checkPermissionForApprovePayRequest(user, request, true);
	}

	await validatePayStatus(request.status, true);

	if (fromOTT && !isValidAmount(request.amount)) {
		throw new ThrowReturn('Lỗi! Vui lòng xác nhận qua phần mềm.');
	}

	request.approvedBy = user._id;
	request.approvedAt = new Date();
	request.setStatus(TransactionStatus.DECLINED);

	await request.save();

	await models.Payout.updateMany(
		{
			_id: _.map(request.payouts, 'payoutId'),
			payRequestId: request._id,
			payStatus: { $nin: [TransactionStatus.PROCESSING, TransactionStatus.SUCCESS] },
		},
		{
			$set: {
				payStatus: TransactionStatus.WAITING,
			},
		}
	);

	await models.Payout.updateMany(
		{
			_id: _.map(request.payouts, 'payoutId'),
			payRequestId: request._id,
		},
		{
			$unset: {
				payRequestId: 1,
			},
		}
	);

	// await models.Payout.updateMany(
	// 	{
	// 		_id: _.map(request.payouts, 'payoutId'),
	// 		payRequestId: request._id,
	// 	},
	// 	{
	// 		$set: {
	// 			payStatus: TransactionStatus.WAITING,
	// 		},
	// 		$unset: {
	// 			payRequestId: 1,
	// 		},
	// 	}
	// );

	cancelAPIRequest(request);

	// if (!fromOTT) {
	sendResultToGroup({
		user,
		payRequest: request,
		approved: false,
	});
	// }

	return {
		status: request.status,
	};
}

async function deleteNewPayRequest(user, requestId) {
	const request = await models.PayoutRequest.findById(requestId);
	if (!request) {
		throw new ThrowReturn().status(404);
	}

	await validatePayStatus(request.status);

	const prevStatus = request.status;

	request.approvedBy = user._id;
	request.approvedAt = new Date();
	request.setStatus(TransactionStatus.DELETED);

	await request.save();

	await models.Payout.updateMany(
		{
			_id: _.map(request.payouts, 'payoutId'),
			payRequestId: request._id,
			payStatus: { $nin: [TransactionStatus.PROCESSING, TransactionStatus.SUCCESS] },
		},
		{
			$set: {
				payStatus: TransactionStatus.WAITING,
			},
		}
	);

	await models.Payout.updateMany(
		{
			_id: _.map(request.payouts, 'payoutId'),
			payRequestId: request._id,
		},
		{
			$unset: {
				payRequestId: 1,
			},
		}
	);

	if (prevStatus !== TransactionStatus.WAITING) {
		cancelAPIRequest(request);
	}

	return {
		status: request.status,
	};
}

async function cancelAPIRequest(payRequest) {
	if (!payRequest.dataAPI) return;

	const debitAccount = await models.BankAccount.findById(payRequest.debitAccountId);
	if (!_.get(BankService, [debitAccount.shortName, 'cancelTranserRequest'])) {
		return;
	}

	const data = await BankService[debitAccount.shortName]
		.cancelTranserRequest({
			...payRequest.dataAPI,
			username: debitAccount.username,
			password: debitAccount.decryptedPassword || debitAccount.password,
			amount: payRequest.amount,
		})
		.then(() => {
			return models.PayoutRequest.updateOne(
				{ _id: payRequest._id },
				{ dataAPIStatus: TransactionStatus.SUCCESS }
			);
		})
		.catch(e => {
			logger.error('cancelAPIRequest', e);
			return models.PayoutRequest.updateOne({ _id: payRequest._id }, { dataAPIStatus: TransactionStatus.ERROR });
		});

	return data;
}

function sendMessage(data, retry = 0) {
	return messageOTT.sendOTTMessage(data).catch(e => {
		if (retry < 1) {
			return sendMessage(data, retry + 1);
		}
		logger.error(e);
	});
}

async function getPayDetailMsg(payout, request) {
	const home = await models.Block.findById(payout.blockIds).select('info.name info.shortName');

	const bankAccount = payout.populated('payAccountId')
		? payout.payAccountId
		: await models.BankAccount.findById(payout.payAccountId);

	const txtPrice = formatPrice(payout.currencyAmount.exchangedAmount);
	const txtHome = _.get(home, 'info.shortName[0]') || _.get(home, 'info.name');
	const des = payout.payDescription || payout.description;

	return _.compact([
		request && `- Lệnh chi: ${request.no}`,
		payout.export && `- Phiếu chi: ${payout.export.noId}`,
		txtHome && `- Nhà: ${txtHome}`,
		des && `- Nội dung: ${des}`,
		`- Số tiền: ${txtPrice}`,
		`- Người nhận: ${
			bankAccount.sourceType === BANK_ACCOUNT_SOURCE_TYPE.CASH
				? `${bankAccount.name} - Tài khoản tiền mặt`
				: `${bankAccount.shortName} - ${bankAccount.accountName} - ${bankAccount.accountNos[0]}`
		}`,
	]).join('\n');
}

async function getPayRequestMsg(request) {
	if (request.payouts.length > 1) {
		const txtPrice = formatPrice(request.amount);
		const des = request.payDescription || request.description;
		const msgs = [`- Lệnh chi: ${request.no}`, des && `- Nội dung: ${des}`, `- Tổng số tiền: ${txtPrice}`];

		return _.compact(msgs).join('\n');
	}

	const payout = request.populated('payouts.payoutId')
		? request.payouts[0].payoutId
		: await models.Payout.findById(request.payouts[0].payoutId).populate('export', 'noId');

	return getPayDetailMsg(payout, request);
}

function isValidAmount(amount) {
	return amount <= Settings.MaxAmountForApprovePayRequestThrowMsg.value;
}

async function getOTTMsgData({ groupIds, ...filter }) {
	const thread = await models.Messages.findOne({
		isGroup: true,
		groupType: MessageGroupType.INTERNAL,
		groupIds: { $in: groupIds },
		...filter,
	})
		.sort({ blockId: -1, _id: 1 })
		.populate('inbox', 'ottPhone')
		.lean();

	if (!thread) return;

	return {
		ottName: thread.otaName,
		sender: thread.inbox.ottPhone,
		phone: thread.threadId,
	};
}

async function sendResultToMainGroup({ user, payRequest, approved = true, error }) {
	try {
		const msgData = await getOTTMsgData({
			groupIds: payRequest.groupIds,
			internalGroupType: MessageGroupInternalType.PAY_REQUEST,
		});
		if (!msgData) return;

		const ottMsgFilter = {
			ottName: msgData.ottName,
			sender: msgData.sender,
			toId: msgData.phone,
			messageType: MessageSentType.PAY_REQUEST_CONFIRMATION,
			requestId: payRequest._id,
		};

		const qMsg = await models.OTTMessage.findOne(ottMsgFilter).sort({ time: -1 }).lean();

		const msgs = [error ? 'Đã xảy ra lỗi khi duyệt!' : approved ? 'Đã duyệt!' : 'Đã từ chối!'];

		if (qMsg) {
			msgData.qmsgId = qMsg.messageId;
		} else {
			msgs.push(await getPayRequestMsg(payRequest));
		}

		const userOtt = _.find(user.otts, ott => ott.ottName === msgData.ottName && ott.ottPhone === msgData.sender);
		if (userOtt) {
			msgData.mentions = [
				{
					userId: userOtt.ottId,
				},
			];
		}

		msgData.text = _.compact(msgs).join('\n');

		if (msgData.mentions) {
			msgData.text = `@mention_${msgData.mentions[0].userId} ${msgData.text}`;
		}

		await sendMessage(msgData);
	} catch (e) {
		logger.error('pay.sendResultToMainGroup', e);
	}
}

async function sendResultToTargetedGroups({ user, payRequest, approved, error }) {
	try {
		await _.values(_.groupBy(payRequest.payouts, 'categoryId')).asyncMap(async payouts => {
			const category = await models.PayoutCategory.findOne({
				_id: payouts[0].categoryId,
				'notifications.msg': { $ne: null },
			});

			if (category) {
				const tasks = await models.Task.find({ payoutId: _.map(payouts, 'payoutId._id') }).select('category');

				if (tasks.length) {
					await tasks.asyncMap(task => {
						sendResultToTargetedGroup({ user, payRequest, approved, error, category, task });
					});
				}
			}
		});
	} catch (e) {
		logger.error('pay.sendResultToTargetedGroups', e);
	}
}

async function sendResultToTargetedGroup({ user, payRequest, approved, error, category, task }) {
	try {
		const msgData = await getOTTMsgData({
			groupIds: payRequest.groupIds,
			$or: [
				{
					internalGroupType: category.payoutType,
				},
				{
					taskCategoryIds: task.category,
				},
			],
		});
		if (!msgData) return;

		const msg = error
			? 'Đã xảy ra lỗi khi duyệt!'
			: category.findNotificationMsg({
					conditions: [
						{
							key: 'status',
							value: approved ? 'approved' : 'declined',
						},
						{
							key: 'paymentMethod',
							value: PayoutSources.BANKING,
						},
					],
			  });

		if (!msg) return;

		const userOtt = _.find(user.otts, ott => ott.ottName === msgData.ottName && ott.ottPhone === msgData.sender);
		if (userOtt) {
			msgData.mentions = [
				{
					userId: userOtt.ottId,
					systemUserId: user._id,
				},
			];
		}

		if (error) {
			msgData.text = msg;
		} else {
			const bookingIds = _.compact(_.map(payRequest.payouts, 'payoutId.bookingId'));

			const booking = bookingIds.length
				? await models.Booking.findOne({ _id: bookingIds }).select('otaBookingId')
				: null;

			msgData.text = replaceMsg({
				msg,
				user,
				mentions: msgData.mentions,
				otaBookingId: _.get(booking, 'otaBookingId'),
				amount: payRequest.amount,
				paymentMethod: PayoutSources.BANKING,
				paymentRequest: payRequest,
			});
		}

		const tMsg = await sendMessage(msgData);

		const msgs = [];

		if (tMsg) {
			const messageTime = moment(tMsg.message.time);

			msgs.push({
				ottName: msgData.ottName,
				ottPhone: msgData.sender,
				ottId: msgData.phone,
				taskId: task._id,
				messageId: tMsg.message.messageId,
				messageTime: messageTime.isValid() ? messageTime.toDate() : new Date(),
			});
		}

		if (msgs.length) {
			await models.TaskAutoMessage.insertMany(msgs);
		}
	} catch (e) {
		logger.error('pay.sendResultToTargetedGroup', e);
	}
}

async function sendResultToGroup({ user, payRequest, approved = true, error }) {
	await Promise.all([
		sendResultToTargetedGroups({ user, payRequest, approved, error }),
		sendResultToMainGroup({ user, payRequest, approved, error }),
	]);
}

async function sendMsgRequest({ payRequest }) {
	try {
		if (payRequest.payMethod === PayoutPayMethods.VIET_QR || payRequest.payMethod === PayoutPayMethods.FILE_BULK) {
			return;
		}

		const msgData = await getOTTMsgData({
			groupIds: payRequest.groupIds,
			internalGroupType: MessageGroupInternalType.PAY_REQUEST,
		});
		if (!msgData) return;

		msgData.ottData = {
			messageType: MessageSentType.PAY_REQUEST_CONFIRMATION,
			toId: msgData.phone,
			requestId: payRequest._id,
		};

		const msgs = ['Có khoản chi cần duyệt!', await getPayRequestMsg(payRequest)];

		if (payRequest && payRequest.payMethod === PayoutPayMethods.MANUAL_BANKING) {
			msgs.push('Vui lòng xác nhận qua App ngân hàng.');
		} else if (isValidAmount(payRequest.amount)) {
			msgs.push('Vui lòng trả lời bằng số với các lựa chọn sau:', '(1) để duyệt', '(2) để từ chối.');
		} else {
			msgs.push('Vui lòng xác nhận qua phần mềm.');
		}

		msgData.text = _.compact(msgs).join('\n');

		await sendMessage(msgData);
	} catch (e) {
		logger.error('pay.sendMsgRequest', e);
	}
}

async function onReceivedConfirmationPayment({
	requestId,
	user,
	userOtt,
	confirmed,
	messageType,
	toId,
	messageId,
	fromId,
}) {
	if (messageType !== MessageSentType.PAY_REQUEST_CONFIRMATION) {
		return;
	}

	try {
		try {
			if (confirmed) {
				await approveNewPayRequest({ user, requestId, fromOTT: true });
				// msgData.text = 'Đã duyệt!';
			} else {
				await declineNewPayRequest({ user, requestId, fromOTT: true });
				// msgData.text = 'Đã từ chối!';
			}
		} catch (e) {
			logger.error('zalo.approvePayoutPayRequest', e);

			const msgData = {
				ottName: userOtt.ottName,
				sender: userOtt.ottPhone,
				phone: toId,
				qmsgId: messageId,
			};
			if (fromId) {
				msgData.mentions = [
					{
						userId: fromId,
					},
				];
			}

			msgData.text = `Lỗi! ${e.message || 'Không xác định.'}`;

			if (msgData.mentions) {
				msgData.text = `@mention_${fromId} ${msgData.text}`;
			}

			await sendMessage(msgData);
		}
	} catch (err) {
		logger.error('onReceivedConfirmationPayment', err);
	}
}

eventEmitter.on(EVENTS.RECEIVED_PAYOUT_CONFIRMATION, onReceivedConfirmationPayment);

module.exports = {
	makeNewPayRequest,
	deleteNewPayRequest,
	declineNewPayRequest,
	approveNewPayRequest,
};
