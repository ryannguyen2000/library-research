const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const {
	TransactionStatus,
	TransactionTypes,
	BANK_ACCOUNT,
	BANK_ACCOUNT_TYPE,
	PayoutStates,
	PayoutPayMethods,
} = require('@utils/const');
const { getArray } = require('@utils/query');

const models = require('@models');
const BankService = require('@services/bank');
const { generateQr } = require('@services/vietqr');
const { getRemark } = require('./utils');

async function createPaymentAccount(user, data) {
	const account = await models.BankAccount.create({
		...data,
		createdBy: user._id,
		groupIds: user.groupIds,
		transType: [TransactionTypes.CREDIT],
		accountType: BANK_ACCOUNT_TYPE.CUSTOMER,
		type: [BANK_ACCOUNT.USER],
		validated: false,
	});

	return account;
}

async function updatePaymentAccount(user, accountId, data) {
	const account = await models.BankAccount.findOne({
		_id: accountId,
		active: true,
		groupIds: user.groupIds,
	});
	if (!account) {
		throw new ThrowReturn().status(403);
	}

	const updatedData = _.pick(data, [
		'name',
		'fullName',
		'nationalId',
		'phoneNumber',
		'address',
		'accountType',
		'contacts',
		'bankId',
		'accountName',
		'accountNos',
		'blockIds',
		'payoutCategoryIds',
		'description',
		'sourceType',
	]);
	_.assign(account, updatedData);

	await account.save();

	return _.pick(account, _.keys(updatedData));
}

async function getPaymentAccounts(user, query) {
	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: query.blockIds });

	const showNull = query.showNull === 'true';

	const filter = {
		active: true,
		type: { $in: [BANK_ACCOUNT.PARTER, BANK_ACCOUNT.USER] },
		$and: [
			{
				$or: [
					{
						blockIds: { $in: blockIds },
					},
					{
						groupIds: { $in: user.groupIds },
					},
				],
			},
		],
	};

	if (query.transType === TransactionTypes.DEBIT) {
		filter.type = BANK_ACCOUNT.PRIVATE;
		filter.transType = TransactionTypes.DEBIT;
	} else if (showNull) {
		filter.$and[0].$or.push({
			groupIds: { $in: user.groupIds },
			blockIds: { $eq: [] },
		});
	}
	if (query.payoutCategoryIds) {
		const parseIds = getArray(query.payoutCategoryIds).toMongoObjectIds();
		filter.payoutCategoryIds = { $in: showNull ? [...parseIds, null, []] : parseIds };
	}
	if (query.keyword) {
		const searchRegex = new RegExp(_.escapeRegExp(query.keyword), 'i');
		filter.$and.push({
			$or: [
				{
					name: searchRegex,
				},
				{
					accountName: searchRegex,
				},
				{
					accountNos: searchRegex,
				},
				{
					shortName: searchRegex,
				},
				{
					no: searchRegex,
				},
			],
		});
	}
	if (query.validated) {
		filter.validated = query.validated === 'true';
	}
	if (query.sourceType) {
		filter.sourceType = query.sourceType;
	}

	const accounts = await models.BankAccount.find(filter)
		.select(
			'no name sourceType shortName accountName accountNos nationalId phoneNumber address accountType type createdAt createdBy bankId'
		)
		.skip(query.start)
		.limit(query.limit)
		.sort({ createdAt: -1 })
		.populate('createdBy', 'username name')
		.populate('bankId payoutCategoryIds')
		.populate('blockIds', 'info.name info.shortName');

	const total = await models.BankAccount.countDocuments(filter);

	return {
		accounts,
		total,
		start: query.start,
		limit: query.limit,
	};
}

async function deletePaymentAccount(user, accountId) {
	const account = await models.BankAccount.findOne({
		_id: accountId,
		groupIds: user.groupIds,
		type: [BANK_ACCOUNT.PARTER, BANK_ACCOUNT.USER],
	});

	account.active = false;
	await account.save();

	return {
		active: account.active,
	};
}

async function getPayQR(payoutId) {
	const payout = await models.Payout.findOne({ _id: payoutId, state: { $ne: PayoutStates.DELETED } })
		.populate({
			path: 'payAccountId',
			populate: 'bankId',
		})
		.populate({
			path: 'export',
			select: 'noId',
		});
	if (!payout) {
		throw new ThrowReturn().status(404);
	}

	const info = {
		accountNo: _.get(payout, 'payAccountId.accountNos[0]'),
		accountName: _.get(payout, 'payAccountId.accountName'),
		acqId: _.get(payout, 'payAccountId.bankId.bin'),
		addInfo: getRemark(null, payout),
		amount: payout.currencyAmount.exchangedAmount,
	};
	const data = await generateQr(info);

	return {
		type: PayoutPayMethods.VIET_QR,
		data,
		info,
	};
}

async function getBulkFile(user, requestId) {
	const request = await models.PayoutRequest.findOne({ _id: requestId })
		.populate({
			path: 'payouts.creditAccountId',
			populate: 'bankId',
		})
		.populate({
			path: 'debitAccountId',
			populate: 'bankId',
		})
		.populate({
			path: 'payouts.payoutId',
		});

	if (!request) {
		throw new ThrowReturn().status(404);
	}
	if (request.payMethod !== PayoutPayMethods.FILE_BULK) {
		throw new ThrowReturn('Lệnh chi không hỗ trợ xuất file!');
	}

	const exportFiles = _.get(BankService, [request.debitAccountId.bankId.shortName, 'exportFileBulkPayments']);
	if (!exportFiles) {
		throw new ThrowReturn('Lệnh chi không hỗ trợ xuất file!');
	}

	const { fileName, fileData, fileType } = await exportFiles({
		items: request.payouts.map(payout => {
			return {
				bankId: payout.creditAccountId.bankId,
				accountNo: payout.creditAccountId.accountNos[0],
				accountName: payout.creditAccountId.accountName,
				amount: payout.payoutId.currencyAmount.exchangedAmount,
				payDescription: payout.payoutId.payDescription,
			};
		}),
		payDescription: request.payDescription,
		requestNo: request.no,
	});

	return {
		fileName,
		fileData,
		fileType,
	};
}

async function getPayRequestQR(user, requestId) {
	const request = await models.PayoutRequest.findOne({ _id: requestId, state: { $ne: PayoutStates.DELETED } })
		.populate({
			path: 'payouts.creditAccountId',
			populate: 'bankId',
		})
		.populate({
			path: 'payouts.payoutId',
			populate: 'export',
			select: 'noId',
		});

	if (!request) {
		throw new ThrowReturn().status(404);
	}
	if (request.payMethod !== PayoutPayMethods.VIET_QR) {
		throw new ThrowReturn('Lệnh chi không hỗ trợ quét mã QR!');
	}
	if (_.uniqBy(request.payouts, p => p.creditAccountId._id.toString()).length > 1) {
		throw new ThrowReturn('Hình thức quét mã QR chỉ hỗ trợ cho các khoản chi có cùng tài khoản nhận!');
	}

	const account = request.payouts[0].creditAccountId;
	const firstPayout = request.payouts[0].payoutId;

	const info = {
		accountNo: account.accountNos[0],
		accountName: account.accountName,
		acqId: _.get(account.bankId, 'bin'),
		addInfo: getRemark(request, firstPayout),
		amount: request.amount,
	};

	const data = await generateQr(info);

	return {
		type: PayoutPayMethods.VIET_QR,
		data,
		info,
	};
}

async function syncBankTransaction(transId) {
	const transaction = await models.BankTransaction.findById(transId);
	if (!transaction) {
		throw new ThrowReturn().status(404);
	}

	await transaction.save();

	if (transaction.payoutId) {
		const payout = await models.Payout.findById(transaction.payoutId).select('_id payRequestId');
		if (payout.payRequestId) {
			await models.PayoutRequest.syncPayout(payout.payRequestId, payout._id);
		}
	}

	return {
		transaction,
	};
}

async function getPayRequests(user, query) {
	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: query.blockIds });

	const filter = {
		blockIds: { $in: blockIds },
	};

	if (query.status) {
		filter['payouts.status'] = query.status;
	} else {
		filter.status = { $in: _.values(TransactionStatus).filter(s => s !== TransactionStatus.DELETED) };
	}
	if (query.debitAccountId) {
		filter.debitAccountId = query.debitAccountId;
	}
	if (query.creditAccountId) {
		filter['payouts.creditAccountId'] = query.creditAccountId;
	}
	if (query.categoryId) {
		filter['payouts.categoryId'] = query.categoryId;
	}
	if (query.priority) {
		filter.priority = Number(query.priority);
	}
	if (query.createdBy) {
		filter.createdBy = query.createdBy;
	}

	const requests = await models.PayoutRequest.find(filter)
		.sort({ createdAt: -1 })
		.skip(query.start)
		.limit(query.limit)
		.populate({
			path: 'debitAccountId',
			select: 'no name sourceType accountName accountNos bankId bankCode shortName',
			populate: {
				path: 'bankId',
			},
		})
		.populate({
			path: 'createdBy approvedBy',
			select: 'username name',
		});

	const total = await models.PayoutRequest.countDocuments(filter);

	return {
		requests,
		total,
		start: query.start,
		limit: query.limit,
	};
}

async function getPayRequest(user, requestId) {
	const request = await models.PayoutRequest.findById(requestId)
		.populate({
			path: 'payouts.payoutId',
			populate: [
				{
					path: 'export',
					select: 'noId name',
				},
				{
					path: 'blockIds',
					select: 'info',
				},
				{
					path: 'categoryId',
				},
				{
					path: 'createdBy confirmedBy',
					select: 'username name',
				},
				{
					path: 'payAccountId payDebitAccountId',
					select: 'no sourceType accountName name shortName accountNos bankId',
					populate: {
						path: 'bankId',
					},
				},
			],
		})
		.populate({
			path: 'payouts.creditAccountId debitAccountId',
			select: 'no sourceType accountName name shortName accountNos bankId',
			populate: {
				path: 'bankId',
			},
		})
		.populate({
			path: 'createdBy approvedBy deletedBy',
			select: 'username name',
		});

	return {
		request,
	};
}

async function reportError(user, requestId, body) {
	const request = await models.PayoutRequest.findById(requestId);
	if (!request) {
		throw new ThrowReturn().status(404);
	}

	const requestPayout = request.payouts.find(p => p.payoutId.equals(body.payoutId));
	if (!requestPayout) {
		throw new ThrowReturn('Không tìm thấy khoản chi nào!');
	}

	const { undo } = body;

	const prevStatus = requestPayout.status;

	if (undo && prevStatus !== TransactionStatus.ERROR) {
		throw new ThrowReturn('Trạng thái không hợp lệ!');
	} else if (!undo && prevStatus !== TransactionStatus.SUCCESS && prevStatus !== TransactionStatus.PROCESSING) {
		throw new ThrowReturn('Trạng thái không hợp lệ!');
	}

	const payout = await models.Payout.findOne({
		_id: requestPayout.payoutId,
	});

	if (undo) {
		if (payout.payRequestId && !request._id.equals(payout.payRequestId)) {
			throw new ThrowReturn('Khoản chi đang nằm trong lệnh chi khác!');
		}

		const transaction = requestPayout.transactionId
			? await models.BankTransaction.findById(requestPayout.transactionId)
			: await models.BankTransaction.findOne({
					accountId: request.debitAccountId,
					$or: [
						{
							requestId,
							payoutId: null,
						},
						{
							payoutId: requestPayout.payoutId,
						},
					],
			  });

		if (!transaction) {
			throw new ThrowReturn('Không tìm thấy lịch sử giao dịch!');
		}

		payout.payStatus = transaction.status;
		payout.payRequestId = request._id;
		payout.payConfirmedDate = request.approvedAt;
		payout.payConfirmedBy = request.approvedBy;

		if (transaction.attachment) {
			payout.historyAttachments.push(transaction.attachment);
		}

		requestPayout.status = transaction.status;
		requestPayout.reported = false;
		requestPayout.reportedBy = user._id;
		requestPayout.reportedAt = new Date();
	} else {
		payout.payRequestId = null;
		payout.payConfirmedBy = null;
		payout.payConfirmedDate = null;
		payout.payStatus = TransactionStatus.WAITING;
		payout.historyAttachments = [];

		requestPayout.status = TransactionStatus.ERROR;
		requestPayout.reported = true;
		requestPayout.reportedBy = user._id;
		requestPayout.reportedAt = new Date();
	}

	await payout.save();
	await request.save();

	return {
		..._.pick(requestPayout, ['status', 'reported', 'reportedBy', 'reportedAt']),
	};
}

module.exports = {
	getPaymentAccounts,
	createPaymentAccount,
	updatePaymentAccount,
	deletePaymentAccount,
	getPayQR,
	getPayRequests,
	getPayRequest,
	getPayRequestQR,
	getBulkFile,
	syncBankTransaction,
	reportError,
};
