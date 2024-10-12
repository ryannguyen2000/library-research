// const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const {
	TaskStatus,
	ThirdPartyPaymentStatus,
	ThirdPartyPayment,
	PayoutSources,
	Currency,
	PayoutType,
	TransactionTypes,
	BANK_ACCOUNT,
	PayoutStates,
	MessageGroupType,
	MessageGroupInternalType,
	MessageSentType,
	PayoutPayMethods,
	MessageVariable,
} = require('@utils/const');
const { logger } = require('@utils/logger');
// const { eventEmitter, EVENTS } = require('@utils/events');

const models = require('@models');
const { generateQr } = require('@services/vietqr');
const Payment = require('@services/payment');
const messageOTT = require('@controllers/message/ott');

const { makeNewPayRequest, approveNewPayRequest, declineNewPayRequest } = require('./pay_request/banking');
const { replaceMsg } = require('./pay_request/utils');

async function checkData(taskId) {
	const task = taskId && (await models.Task.findById(taskId));
	if (!task) {
		throw new ThrowReturn().status(404);
	}
	if (![TaskStatus.Confirmed, TaskStatus.Waiting].includes(task.status)) {
		throw new ThrowReturn('Trạng thái nhiệm vụ đã kết thúc!');
	}
	if (!task.fee.amount) {
		throw new ThrowReturn('Bạn chưa nhập số tiền!');
	}
	const booking = task.bookingId && (await models.Booking.findById(task.bookingId));
	if (!booking) {
		throw new ThrowReturn('Mã đặt phòng không tồn tại!');
	}

	return {
		task,
		booking,
	};
}

function getRefundDescription(booking) {
	return `COZRUM HOAN TIEN CHO MA DAT PHONG ${booking.otaBookingId}`;
}

async function checkRefundMethod(query, user) {
	const { task, booking } = await checkData(query.taskId);

	if (task.paymentSource === PayoutSources.CASH) {
		const info = {
			amount: task.fee.amount,
			currency: Currency.VND,
			api: true,
			source: task.paymentSource,
		};
		return info;
	}

	const supportedMethods = _.keys(Payment).filter(p => Payment[p].refundPayment);
	const paymentRefs = await models.PaymentRef.find({
		otaBookingId: booking.otaBookingId,
		otaName: booking.otaName,
		status: ThirdPartyPaymentStatus.SUCCESS,
		method: supportedMethods,
	});

	const { amount } = task.fee;

	if (paymentRefs.length) {
		const groups = _.groupBy(paymentRefs, 'method');
		const validGroups = _.values(groups).find(refs => _.sumBy(refs, 'amount') >= amount);

		if (validGroups) {
			return {
				source: paymentRefs[0].method,
				amount,
				currency: validGroups[0].currency,
				addInfo: getRefundDescription(booking),
				api: true,
			};
		}
	}

	const bank = task.other.bankId && (await models.Bank.findById(task.other.bankId));
	if (!bank) {
		throw new ThrowReturn('Ngân hàng không hợp lệ!');
	}

	// const serviceAccount = await models.BankAccount.findOne({
	// 	active: true,
	// 	groupIds: { $in: user.groupIds },
	// 	serviceAccountId: { $ne: null },
	// });

	const info = {
		accountNo: task.other.bankAccountNo,
		accountName: task.other.bankAccountName,
		acqId: bank.bin,
		bankName: `${bank.name} (${bank.bankCode})`,
		addInfo: getRefundDescription(booking),
		amount,
		currency: Currency.VND,
		api: true,
		source: task.paymentSource,
	};
	// if (serviceAccount) {
	// 	info.api = true;
	// 	info.source = task.paymentSource;
	// } else {
	// 	info.qr = true;
	// }

	return info;
}

async function getQrRefund(body) {
	const { task, booking } = await checkData(body.taskId);
	const bank = task.other.bankId && (await models.Bank.findById(task.other.bankId));
	if (!bank) {
		throw new ThrowReturn('Ngân hàng không hợp lệ!');
	}

	const info = {
		accountNo: _.get(task, 'other.bankAccountNo'),
		accountName: _.get(task, 'other.bankAccountName'),
		acqId: _.get(bank, 'bin'),
		addInfo: body.addInfo || getRefundDescription(booking),
		amount: _.get(task, 'fee.amount'),
	};
	const data = await generateQr(info);

	return {
		qrData: data,
		info,
	};
}

// refund flow from momo, vnpay, appotapay
async function refundFromThirdParty({ user, data, paymentRefs, task, booking, category, validationData }) {
	const { amount } = task.fee;

	const ref = _.minBy(
		paymentRefs.filter(r => r.amount >= amount),
		'amount'
	);
	if (!ref) {
		throw new ThrowReturn('Số tiền hoàn không được vượt quá số tiền đã thanh toán!');
	}
	const { method } = ref;

	if (validationData.code !== 0) {
		sendMsgToGroup({ task, user, msg: validationData.upLevelMsgRequest, category, paymentMethod: method, booking });
		throw new ThrowReturn(validationData.msg);
	}

	const description = data.addInfo || getRefundDescription(booking);

	const paymentRef = await models.PaymentRef.createRef({
		method,
		amount: -amount,
		otaBookingId: booking.otaBookingId,
		otaName: booking.otaName,
		bankCode: ref.bankCode,
		description,
		groupIds: booking.groupIds,
		blockId: booking.blockId,
		isRefund: true,
		refOrderId: ref.ref,
	});

	try {
		const config = await models.PaymentMethod.findOne({ name: method });

		const res = await Payment[method].refundPayment(config, {
			orderId: paymentRef.ref,
			amount,
			transactionNo: ref.transactionNo,
			description,
			originRef: ref,
			date: paymentRef.createdAt,
			user,
			isFull: amount >= ref.amount,
			booking,
		});

		paymentRef.status = res.status;
		paymentRef.transactionNo = res.transactionNo;
		paymentRef.data = _.assign(paymentRef.data, res.data);

		await paymentRef.save();
	} catch (e) {
		paymentRef.data = { errorMsg: e };
		paymentRef.status = ThirdPartyPaymentStatus.FAIL;

		await paymentRef.save();

		throw new ThrowReturn(e);
	}

	const currencyAmount = {
		amount: -amount,
		currency: ref.currency,
	};

	const payout = await models.Payout.createOTAPayout({
		otaName: booking.otaName,
		otaId: paymentRef.ref,
		currencyAmount,
		collectorCustomName: method,
		source: models.PaymentMethod.getPayoutSource(ref.method),
		description: `Hoàn tiền qua ${method.toUpperCase()}, transaction no: ${paymentRef.transactionNo}, orderId: ${
			paymentRef.ref
		}`,
		createdAt: new Date(),
		blockIds: [booking.blockId],
		productId: paymentRef.transactionNo,
		bookingId: booking._id,
		createdBy: user._id,
		multipleReport: true,
		categoryId: category._id,
	});

	const report = await models.PayoutExport.createExport({
		payoutType: PayoutType.RESERVATION,
		name: `Hoàn tiền ${_.upperFirst(method)} ${moment().format('DD/MM/YYYY')}`,
		payouts: [payout._id],
		source: method,
		createdBy: user._id,
		description: data.description,
	});

	await report.confirm({ userId: user._id });

	task.payoutId = payout._id;
	await task.changeStatus({ status: TaskStatus.Done, description: data.description }, user);

	const msg = category.findNotificationMsg({
		conditions: [
			{
				key: 'status',
				value: 'approved',
			},
			{
				key: 'paymentMethod',
				value: method,
			},
		],
	});

	return { payout, report, msg, paymentMethod: method };
}

async function refundByCash({ user, task, booking, data, validationData, category }) {
	const { amount, currency } = task.fee;

	if (validationData.code !== 0) {
		sendMsgToGroup({
			task,
			user,
			booking,
			msg: validationData.upLevelMsgRequest,
			paymentMethod: PayoutSources.CASH,
			category,
		});
		throw new ThrowReturn(validationData.msg);
	}

	const payout = await models.Payout.createBookingPayout(user, {
		payoutType: PayoutType.REFUND,
		paidAt: new Date(),
		multipleReport: true,
		createdBy: user._id,
		source: PayoutSources.CASH,
		currencyAmount: {
			currency,
			amount,
		},
		blockIds: [booking.blockId],
		bookingId: booking._id,
		collector: task.createdBy,
		categoryId: category._id,
		description: _.compact([`Hoàn tiền mã đặt phòng ${booking.otaBookingId}`, await task.getReasonTxt()]).join(
			'\n'
		),
	});

	const report = await models.PayoutExport.createExport({
		payoutType: PayoutType.PAY,
		name: `Hoàn tiền mặt ${moment().format('DD/MM/YYYY')} - ${booking.otaBookingId}`,
		payouts: [payout._id],
		createdBy: user._id,
		description: data.description,
	});

	const approved = [];

	_.range(4).forEach(i => {
		approved[i] = report.approved[i] || { user: null };
	});

	approved[validationData.approveIndex || 0] = {
		user: user._id,
		state: PayoutStates.APPROVE,
		date: new Date(),
	};
	approved[3] = {
		user: user._id,
		state: PayoutStates.PAID,
		date: new Date(),
	};

	report.approved = approved;
	report.confirmedBy = user._id;
	report.confirmedDate = new Date();
	report.state = PayoutStates.PAID;

	await report.save();

	task.payoutId = payout._id;
	await task.changeStatus({ status: TaskStatus.Done, description: data.description }, user);

	const msg = category.findNotificationMsg({
		conditions: [
			{
				key: 'status',
				value: 'approved',
			},
			{
				key: 'paymentMethod',
				value: PayoutSources.CASH,
			},
		],
	});

	return { payout, report, msg, paymentMethod: PayoutSources.CASH };
}

async function refundByBanking({ user, task, booking, data, validationData, category }) {
	if (validationData.code !== 0 && !validationData.allowCreateRequestOnReachLimit) {
		sendMsgToGroup({
			task,
			user,
			booking,
			msg: validationData.upLevelMsgRequest,
			paymentMethod: PayoutSources.BANKING,
			category,
		});
		throw new ThrowReturn(validationData.msg);
	}

	const debitAccount = await models.BankAccount.findOne({
		active: true,
		groupIds: { $in: user.groupIds },
		transType: TransactionTypes.DEBIT,
		type: BANK_ACCOUNT.PRIVATE,
	}).sort({
		serviceAccountId: -1,
	});

	const payout = await task.createTaskPayout(user, {
		payoutType: PayoutType.REFUND,
		payDebitAccountId: debitAccount._id,
		paidAt: new Date(),
		multipleReport: true,
		source: PayoutSources.BANKING,
		categoryId: category._id,
		payDescription: data.addInfo || getRefundDescription(booking),
	});
	await task.save();

	let report = await models.PayoutExport.findOne({
		payouts: payout._id,
		state: { $ne: PayoutStates.DELETED },
	});
	if (!report) {
		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.PAY,
			name: `Hoàn tiền qua ngân hàng ${moment().format('DD/MM/YYYY')}`,
			payouts: [payout._id],
			createdBy: user._id,
			description: data.description,
		});
	}

	const request = await makeNewPayRequest(
		{
			payoutIds: [payout._id],
			payDebitAccountId: debitAccount._id,
		},
		user,
		payout.payRequestId,
		{
			skipNotification: validationData.code === 0,
		}
	);

	if (validationData.code === 0) {
		if (request.payMethod === PayoutPayMethods.AUTO_BANKING) {
			const transaction = await approveNewPayRequest({
				user,
				requestId: request._id,
				skipCheckPermission: true,
			});

			return {
				payout,
				report,
				paymentMethod: PayoutSources.BANKING,
				transaction,
			};
		}

		return {
			payout,
			report,
			paymentMethod: PayoutSources.BANKING,
		};
	}

	sendMsgToGroup({
		task,
		user,
		booking,
		msg: validationData.upLevelMsgRequest,
		paymentMethod: PayoutSources.BANKING,
		category,
		paymentReport: report,
		paymentRequest: request,
	});

	throw new ThrowReturn(validationData.msg);
}

async function confirmRefund(body, user) {
	if (!body.description) {
		throw new ThrowReturn('Hãy nhập mô tả!');
	}

	const { task, booking } = await checkData(body.taskId);

	const { amount } = task.fee;

	const category = await models.PayoutCategory.findOne({ payoutType: PayoutType.REFUND });
	const validationData = await models.PayoutRequestConfig.checkPermission({
		user,
		amount,
		categoryId: category._id,
	});

	let result;

	const data = {
		user,
		task,
		booking,
		data: body,
		category,
		validationData,
	};

	if (task.paymentSource !== PayoutSources.CASH) {
		const supportedMethods = _.keys(Payment).filter(p => Payment[p].refundPayment);

		const paymentRefs = await models.PaymentRef.find({
			otaBookingId: booking.otaBookingId,
			otaName: booking.otaName,
			status: ThirdPartyPaymentStatus.SUCCESS,
			method: supportedMethods,
		});

		if (paymentRefs.length) {
			const ref = _.minBy(
				paymentRefs.filter(r => r.amount >= amount),
				'amount'
			);
			if (ref) {
				result = await refundFromThirdParty({
					...data,
					paymentRefs,
				});
			}
		}
	}

	if (!result && task.paymentSource === PayoutSources.CASH) {
		result = await refundByCash(data);
	}

	if (!result) {
		result = await refundByBanking(data);
	}

	if (result && result.msg) {
		sendMsgToGroup({ task, user, booking, category, ...result });
	}

	return result;
}

async function declineRefund(body, user) {
	if (!body.description) {
		throw new ThrowReturn('Hãy nhập mô tả!');
	}

	const { task, booking } = await checkData(body.taskId);

	const category = await models.PayoutCategory.findOne({ payoutType: PayoutType.REFUND });

	await models.PayoutRequestConfig.checkPermission({
		user,
		decline: true,
		categoryId: category._id,
	});

	let hasRequest = false;

	if (task.payoutId) {
		const payout = await models.Payout.findById(task.payoutId);

		if (payout.payRequestId) {
			await declineNewPayRequest({ user, requestId: payout.payRequestId }).then(() => {
				hasRequest = true;
			});
		}
	}

	await task.changeStatus({ status: TaskStatus.Deleted, description: body.description }, user);

	if (!hasRequest) {
		const msg = category.findNotificationMsg({
			conditions: [
				{
					key: 'status',
					value: 'declined',
				},
			],
		});
		sendMsgToGroup({ task, booking, user, category, msg });
	}
}

async function sendMsgToGroup({ task, booking, user, msg, paymentMethod, paymentReport, paymentRequest }) {
	try {
		const thread = await getThread({ user, task });

		const ottMsgFilter = {
			ottName: thread.ottName,
			sender: thread.sender,
			toId: thread.phone,
			messageType: MessageSentType.REFUND_REQUEST_CONFIRMATION,
			requestId: task._id,
		};

		const qMsg = await models.OTTMessage.findOne(ottMsgFilter).sort({ time: -1 }).lean();
		if (qMsg) {
			thread.qmsgId = qMsg.messageId;
		}

		if (msg.includes(MessageVariable.USER.text)) {
			const userOtt = _.find(user.otts, ott => ott.ottName === thread.ottName && ott.ottPhone === thread.sender);
			if (userOtt) {
				thread.mentions = [
					{
						userId: userOtt.ottId,
						systemUserId: user._id,
					},
				];
			}
		}

		let manager;

		if (msg.includes(MessageVariable.MANAGER.text)) {
			const config = await models.PayoutRequestConfig.findOne({
				approveIndex: 2,
				groupIds: { $in: user.groupIds },
			});

			if (config) {
				const mFilter = {
					enable: true,
					role: config.role,
				};
				if (config.userIds && config.userIds.length) {
					mFilter._id = config.userIds;
				}

				manager = await models.User.findOne(mFilter);

				if (manager) {
					const userOtt = _.find(
						manager.otts,
						ott => ott.ottName === thread.ottName && ott.ottPhone === thread.sender
					);
					if (userOtt) {
						thread.mentions = thread.mentions || [];
						thread.mentions.push({
							userId: userOtt.ottId,
							systemUserId: manager._id,
						});
					}
				}
			}
		}

		thread.text = replaceMsg({
			msg,
			user,
			manager,
			mentions: thread.mentions,
			otaBookingId: booking.otaBookingId,
			amount: task.fee.amount,
			paymentMethod,
			paymentReport,
			paymentRequest,
		});

		await sendMessage(thread);
	} catch (e) {
		logger.error('refund.sendMsgToGroup', e);
	}
}

function sendMessage(data, retry = 0) {
	return messageOTT.sendOTTMessage(data).catch(e => {
		if (retry < 1) {
			return sendMessage(data, retry + 1);
		}
		logger.error(e);
	});
}

async function getThread({ task, user }) {
	const thread = await models.Messages.findOne({
		isGroup: true,
		groupType: MessageGroupType.INTERNAL,
		$and: [
			{
				$or: [
					{
						internalGroupType: MessageGroupInternalType.REFUND,
					},
					{
						taskCategoryIds: task.category,
					},
				],
			},
			{
				$or: [
					{
						blockId: task.blockId,
					},
					{
						groupIds: { $in: user.groupIds },
					},
				],
			},
		],
	})
		.sort({ blockId: -1, _id: 1 })
		.populate('inbox', 'ottPhone')
		.lean();

	if (!thread) {
		throw new ThrowReturn('Không tìm thấy nhóm phù hợp!');
	}

	return {
		ottName: thread.otaName,
		sender: thread.inbox.ottPhone,
		phone: thread.threadId,
	};
}

// async function onReceivedConfirmation({ requestId, user, userOtt, confirmed, messageType, toId, messageId, fromId }) {
// 	if (messageType !== MessageSentType.REFUND_REQUEST_CONFIRMATION) {
// 		return;
// 	}

// 	try {
// 		const msgData = {
// 			ottName: userOtt.ottName,
// 			sender: userOtt.ottPhone,
// 			phone: toId,
// 			qmsgId: messageId,
// 		};
// 		if (fromId) {
// 			msgData.mentions = [
// 				{
// 					userId: fromId,
// 				},
// 			];
// 		}

// 		try {
// 			if (confirmed) {
// 				// await approveNewPayRequest({ user, requestId, fromOTT: true });
// 				// msgData.text = 'Đã duyệt!';
// 			} else {
// 				// await declineNewPayRequest({ user, requestId, fromOTT: true });
// 				// msgData.text = 'Đã từ chối!';
// 			}
// 		} catch (e) {
// 			logger.error('zalo.approvePayoutPayRequest', e);
// 			msgData.text = `Lỗi! ${e.message || 'Không xác định.'}`;
// 		}

// 		if (msgData.mentions) {
// 			msgData.text = `@mention_${fromId} ${msgData.text}`;
// 		}

// 		await sendMessage(msgData);
// 	} catch (err) {
// 		logger.error('onReceivedConfirmationPayment', err);
// 	}
// }

// eventEmitter.on(EVENTS.RECEIVED_PAYOUT_CONFIRMATION, onReceivedConfirmation);

module.exports = {
	checkRefundMethod,
	getQrRefund,
	confirmRefund,
	declineRefund,
};
