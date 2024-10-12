const schedule = require('node-schedule');
const moment = require('moment');

const { logger } = require('@utils/logger');
const { TransactionStatus } = require('@utils/const');
const models = require('@models');
const { runWorker } = require('@workers/index');
const CONSTANT = require('@workers/const');
const MBBank = require('@services/bank/MBBank/attachment');

function generatePdfPath(html, fileDir, fileName) {
	return runWorker({
		type: CONSTANT.GENERATE_PDF_PATH,
		data: {
			html,
			fileDir,
			fileName,
			options: {
				margin: {
					bottom: 1.5,
					left: 1.5,
					right: 1.5,
					top: 1.5,
				},
			},
		},
	});
}

let running = false;
const BANKS = ['MBBank'];

async function runJob() {
	try {
		if (running) return;

		running = true;

		const transaction = await models.BankTransaction.findOne({
			hasPayout: true,
			attachmentCreated: false,
			status: TransactionStatus.SUCCESS,
			bankName: BANKS,
		}).populate('accountId');

		if (transaction) {
			const html = await MBBank.getHtmlAttachment(transaction);
			const attachment = await generatePdfPath(
				html,
				`${moment().format('YY/MM/DD')}`,
				`${transaction.docNo}.pdf`
			);

			if (attachment) {
				await models.BankTransaction.updateOne(
					{
						_id: transaction._id,
					},
					{
						attachmentCreated: true,
						attachment,
					}
				);
				if (transaction.payoutIds && transaction.payoutIds.length) {
					await models.Payout.updateMany(
						{
							_id: { $in: transaction.payoutIds },
						},
						{
							$addToSet: { historyAttachments: attachment },
						}
					);
				} else if (transaction.payoutId) {
					await models.Payout.updateOne(
						{
							_id: transaction.payoutId,
						},
						{
							$addToSet: { historyAttachments: attachment },
						}
					);
				} else if (transaction.requestId) {
					const request = await models.PayoutRequest.findById(transaction.requestId).select(
						'mergeTransaction payouts'
					);
					if (request && request.mergeTransaction) {
						await models.Payout.updateMany(
							{
								_id: { $in: request.payouts.map(p => p.payoutId) },
							},
							{
								$addToSet: { historyAttachments: attachment },
							}
						);
					}
				}
			}
		}
	} catch (e) {
		logger.error('transactionFile runJob', e);
	} finally {
		running = false;
	}
}

schedule.scheduleJob('*/2 * * * * *', runJob);
