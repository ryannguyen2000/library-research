const moment = require('moment');
const _ = require('lodash');
const path = require('path');

const { UPLOAD_CONFIG } = require('@config/setting');
const { PayoutType, PayoutStates, RESOURCE_FILE_STATUS, RESOURCE_FILE_TYPE, BANK_ACCOUNT } = require('@utils/const');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');
const models = require('@models');
const { runWorker } = require('@workers/index');
const { GENERATE_EXCEL_TO_IMG } = require('@workers/const');

const Reconc = require('./reconciliation');

const MAX_DELAY_DAY = 7;

async function createReport({ payouts, bankAccount, date, confirm }) {
	const payoutIds = _.map(payouts, '_id');

	let report = await models.PayoutExport.findOne({
		payoutType: PayoutType.RESERVATION,
		payouts: { $in: payoutIds },
		state: { $ne: PayoutStates.DELETED },
	});

	if (report) {
		report.$locals.oldPayouts = [...report.payouts];
		report.payouts = payoutIds;
		await report.save();
	} else {
		const total = _.sumBy(payouts, 'currencyAmount.exchangedAmount');

		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `${bankAccount.shortName} STK ${bankAccount.accountNos[0]} ngày ${moment(date).format('D/M/Y')}${
				confirm ? '' : ` - Chênh lệch`
			}`,
			payouts: payoutIds,
			currencyAmount: { VND: total },
			groupIds: bankAccount.groupIds,
		});
	}

	if (confirm) {
		await report.confirm();
	}

	return report;
}

async function createAutoCollectorReports(data) {
	return await _.values(Reconc)
		.filter(r => r.createAutoReports)
		.asyncMap(r => r.createAutoReports(data));
}

async function createAutoReports({ bankCode, date, source } = {}) {
	if (source && Reconc[source] && Reconc[source].createAutoReports) {
		return Reconc[source].createAutoReports({ date });
	}

	const bankAccounts = await models.BankAccount.find(
		_.pickBy({ bankCode, active: true, subscribedNotification: true, type: BANK_ACCOUNT.PRIVATE })
	);
	if (!bankAccounts.length) return;

	const accounts = _.flatten(_.map(bankAccounts, 'accountNos'));
	const phones = _.uniq(_.map(bankAccounts, 'shortName'));

	const dates = date
		? [date]
		: [
				moment().subtract(2, 'day').toDate(),
				moment().subtract(3, 'day').toDate(),
				moment().subtract(4, 'day').toDate(),
		  ];

	await dates.asyncForEach(async d => {
		const listSMS = await models.SMSMessage.find({
			account: { $in: accounts },
			phone: { $in: phones },
			hasPayout: true,
			hasTransaction: true,
			'data.date': { $gte: moment(d).startOf('day').valueOf(), $lte: moment(d).endOf('day').valueOf() },
		})
			.populate('transId', 'meta')
			.populate({
				path: 'payoutId',
				select: 'confirmedDate currencyAmount',
				match: {
					confirmedDate: null,
				},
			});

		await _.values(_.groupBy(listSMS, l => l.account + l.phone)).asyncMap(async listSMSByAccount => {
			const unreportSMS = listSMSByAccount.filter(sms => sms.payoutId && sms.payoutId.length);
			if (!unreportSMS.length) return;

			const matchPayouts = [];
			const unmatchPayouts = [];

			unreportSMS.forEach(sms => {
				if (
					Math.abs(_.sumBy(sms.payoutId, 'currencyAmount.exchangedAmount') - sms.transId.meta.amount) <=
					Settings.PaymentRoundingValue.value
				) {
					matchPayouts.push(...sms.payoutId);
				} else {
					unmatchPayouts.push(...sms.payoutId);
				}
			});

			const bankAccount = bankAccounts.find(
				a => a.shortName === unreportSMS[0].phone && a.accountNos.includes(unreportSMS[0].account)
			);

			if (matchPayouts.length) await createReport({ payouts: matchPayouts, bankAccount, date: d, confirm: true });
			if (unmatchPayouts.length) await createReport({ payouts: unmatchPayouts, bankAccount, date: d });
		});
	});
}

async function confirmAutoReports({ date } = {}) {
	const paymentCollectors = await models.PaymentCollector.find({ banking: true });

	const filter = {
		payoutType: PayoutType.RESERVATION,
		state: { $ne: PayoutStates.DELETED },
		source: { $in: _.map(paymentCollectors, 'tag') },
		confirmedDate: null,
	};
	if (date) {
		filter.createdAt = { $gte: moment(date).startOf('day').toDate(), $lte: moment(date).endOf('day').toDate() };
	} else {
		filter.createdAt = { $gte: moment().subtract(MAX_DELAY_DAY, 'day').toDate() }; // delay max 7 days
	}

	const reports = await models.PayoutExport.find(filter);

	await reports.asyncMap(async report => {
		const paymentCollector = paymentCollectors.find(p => p.tag === report.source);
		const amount = report.currencyAmount.VND - (report.totalTransactionFee || 0) + (paymentCollector.fixedFee || 0);

		if (amount === 0) {
			await report.confirm();
			return;
		}

		const regex = new RegExp(paymentCollector.bankingSearchRegex);
		const { roundedValue } = paymentCollector;

		const transaction = await models.BankTransaction.findOne({
			tranTime: { $gte: moment(report.createdAt).subtract(MAX_DELAY_DAY, 'day').toDate() },
			$or: [
				{
					'data.content': regex,
				},
				{
					'data.description': regex,
				},
			],
			'meta.amount': roundedValue
				? {
						$gte: amount - roundedValue,
						$lte: amount + roundedValue,
				  }
				: amount,
		}).select('_id smsId');

		if (transaction) {
			report.transactionIds.push(transaction._id);
			await report.confirm();

			if (transaction.smsId) {
				await models.SMSMessage.updateOne(
					{
						_id: transaction.smsId,
					},
					{ read: true }
				);
			}
		}
	});
}

async function confirmReportWithTransaction(paymentCollector, transaction, smsId) {
	const { roundedValue, tag } = paymentCollector;

	const report = await models.PayoutExport.findOne({
		payoutType: PayoutType.RESERVATION,
		state: { $ne: PayoutStates.DELETED },
		source: tag,
		confirmedDate: null,
		createdAt: { $gte: moment(transaction.tranTime).subtract(MAX_DELAY_DAY, 'day').toDate() }, // delay max 7 days
		'currencyAmount.VND': roundedValue
			? {
					$gte: transaction.meta.amount - roundedValue,
					$lte: transaction.meta.amount + roundedValue,
			  }
			: transaction.meta.amount,
	});
	if (report) {
		report.transactionIds.push(transaction._id);
		await report.confirm();

		await models.SMSMessage.updateOne(
			{
				_id: smsId,
			},
			{ read: true }
		);
	}
}

async function onReceivedNewSMSBanking(sms) {
	try {
		if (!sms.transId) return;

		const transaction = await models.BankTransaction.findById(sms.transId);
		if (!transaction) return;

		const description = transaction.data.content || transaction.data.description;
		if (!description) return;

		const paymentCollectors = await models.PaymentCollector.find({
			banking: true,
		})
			.select('tag roundedValue bankingSearchRegex')
			.lean();

		const paymentCollector = paymentCollectors.find(p => new RegExp(p.bankingSearchRegex).test(description));
		if (paymentCollector) {
			await confirmReportWithTransaction(paymentCollector, transaction, sms._id);
		}
	} catch (e) {
		logger.error('onReceiveNewSMSBanking', sms, e);
	}
}

async function confirmAutoReportsWithFile({ source, fileDoc, resource, ...params }) {
	const paymentCollector = await models.PaymentCollector.findOne({ tag: source });

	let done = false;

	const recocileFile = _.get(Reconc[source], 'recocileFile');

	if (recocileFile) {
		const result = await recocileFile({ source, paymentCollector, resource, ...params });

		if (result.done) {
			done = result.done;

			if (fileDoc) {
				fileDoc.fileStatus = RESOURCE_FILE_STATUS.DONE;
				await fileDoc.save();
			}

			if (result.smsIds && result.smsIds.length) {
				await models.SMSMessage.updateMany(
					{
						_id: result.smsIds,
					},
					{ read: true }
				);
			}
		}

		if (result.reports) {
			await generateImgReports(result.reports);
		}
	}

	return {
		done,
	};
}

async function autoFiles({ fileId, ...params } = {}) {
	const filter = {
		fileType: RESOURCE_FILE_TYPE.RECONCILIATION,
	};
	if (fileId) {
		filter._id = fileId;
	} else {
		filter.fileStatus = RESOURCE_FILE_STATUS.WAITING;
		filter.createdAt = { $gte: moment().subtract(30, 'day').toDate() };
	}

	const files = await models.ResourceFile.find(filter).populate('resource');
	const res = [];

	await files.asyncForEach(async file => {
		const rs = await confirmAutoReportsWithFile({
			source: file.name.vi,
			fileDoc: file,
			resource: file.resource,
			...params,
		}).catch(e => {
			logger.error('autoFiles confirmAutoReportsWithFile', e);
		});

		res.push({
			fileId: file._id,
			...rs,
		});
	});

	return res;
}

async function generateImgReports(reports) {
	await reports
		.filter(report => report.attachments && report.attachments.length)
		.asyncForEach(async report => {
			const xlsxs = report.attachments.filter(a => a.endsWith('.xlsx'));
			// const others = report.attachments.filter(a => !a.endsWith('.jpg') && !a.endsWith('.xlsx'));

			if (!xlsxs.length) return;

			const jpegs = report.attachments.filter(a => a.endsWith('.jpg'));
			const newJpegs = [];
			let isUpdated = false;

			await xlsxs.asyncForEach(async (url, index) => {
				if (jpegs[index]) {
					newJpegs.push(jpegs[index]);
					return;
				}

				const basedir = path.dirname(url);
				const fileName = path.basename(url);

				const folderPath = path.resolve(
					basedir.startsWith(UPLOAD_CONFIG.FULL_URI)
						? basedir.replace(UPLOAD_CONFIG.FULL_URI, UPLOAD_CONFIG.PATH)
						: `${UPLOAD_CONFIG.PATH}/${moment().format('YY/MM/DD')}`
				);

				try {
					const newRelPath = await runWorker({
						type: GENERATE_EXCEL_TO_IMG,
						data: {
							url,
							folderPath,
							fileName: fileName.replace('.xlsx', ''),
						},
					});

					isUpdated = true;
					newJpegs.push(newRelPath.replace(path.resolve(UPLOAD_CONFIG.PATH), UPLOAD_CONFIG.FULL_URI));
				} catch (e) {
					logger.error('generateImgReports', report._id, url, e);
				}
			});

			if (isUpdated) {
				await models.PayoutExport.updateOne(
					{
						_id: report._id,
					},
					{
						$addToSet: {
							attachments: { $each: newJpegs },
						},
					}
				);
			}
		});
}

eventEmitter.on(EVENTS.BANKING_SMS, onReceivedNewSMSBanking);

module.exports = {
	createAutoReports,
	confirmAutoReports,
	confirmAutoReportsWithFile,
	autoFiles,
	createAutoCollectorReports,
};
