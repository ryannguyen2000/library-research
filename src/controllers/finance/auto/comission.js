const _ = require('lodash');
const moment = require('moment');
const fs = require('fs');
const { UPLOAD_CONFIG } = require('@config/setting');

const { OTAs, PayoutAutoTypes } = require('@utils/const');
const { logger } = require('@utils/logger');
const { checkFolder } = require('@utils/file');
const models = require('@models');
const { booking: BookingPayment } = require('@controllers/ota_api/payments');
const utils = require('./utils');

async function runAuto(auto, mtime, period) {
	if (!BookingPayment) {
		logger.error('comission.runAuto Not found module booking');
		return;
	}

	const categoryIds = _.compact(_.map(auto.payouts, 'categoryId'));

	const bFilter = {
		active: true,
		isProperty: true,
		isTest: false,
		OTAProperties: {
			$elemMatch: {
				otaName: OTAs.Booking,
			},
		},
	};
	if (auto.blockIds && auto.blockIds.length) {
		bFilter._id = auto.blockIds;
	} else {
		const autoHaveBlockIds = await models.PayoutAuto.find({
			_id: { $ne: auto._id },
			type: PayoutAutoTypes.BOOKING_COMMISSION,
			'blockIds.0': { $exists: true },
		}).select('blockIds');

		const ignoreBlockIds = _.flatten(_.map(autoHaveBlockIds, 'blockIds'));
		if (ignoreBlockIds.length) {
			bFilter._id = { $nin: ignoreBlockIds };
		}
	}

	const blocks = await models.Block.find(bFilter).select('info.name OTAProperties');
	const debitAccounts = await models.BankAccount.find({
		_id: _.compact(_.map(auto.payouts, 'payDebitAccountId')),
	});

	const results = [];

	await blocks.asyncForEach(async block => {
		let currentPayout = await auto.payouts.find(
			p => p.payDebitAccountId && p.blockId && p.blockId.equals(block._id)
		);

		if (!currentPayout) {
			currentPayout = await auto.payouts.find(p => !p.blockId && p.payDebitAccountId);
		}

		const debitAccount = currentPayout && debitAccounts.find(d => d._id.equals(currentPayout.payDebitAccountId));
		if (!debitAccount) {
			logger.error('comission.runAuto Not found debitAccount', block._id, auto);
			return;
		}

		const invoices = await BookingPayment.getPayInvoices(block);
		await invoices.asyncForEach(async invoiceData => {
			const bankAccounts = await models.BankAccount.find({ accountName: invoiceData.bankAccountName }).lean();
			const payAccount = bankAccounts.find(a => invoiceData.bankDetail.includes(a.accountNos[0]));

			if (!payAccount) {
				logger.error('comission.runAuto Not found payAccount', block._id, invoiceData);
				return;
			}

			const [payout] = await utils.findOrCreatePayout({
				amount: _.sumBy(invoiceData.invoices, 'amount'),
				categoryId: categoryIds[0],
				description: `${auto.name} ${mtime.format('MM.YYYY')} - ${block.info.name}`,
				payAccountId: payAccount._id,
				payDebitAccountId: debitAccount._id,
				payDescription: invoiceData.payDescription,
				auto,
				period,
				blockId: block._id,
			});
			if (payout && !payout.images.length && invoiceData.invoices) {
				const invoiceUrls = [];

				await invoiceData.invoices
					.filter(i => i.invoiceFile && i.invoiceFile.data)
					.asyncMap(async invoice => {
						const filePath = `${moment().format('YY/MM/DD')}/invoice`;

						await checkFolder(`${UPLOAD_CONFIG.PATH}/${filePath}`);

						await fs.promises.writeFile(
							`${UPLOAD_CONFIG.PATH}/${filePath}/${invoice.invoiceFile.name}`,
							invoice.invoiceFile.data
						);
						invoiceUrls.push(`${UPLOAD_CONFIG.FULL_URI}/${filePath}/${invoice.invoiceFile.name}`);
					});

				if (invoiceUrls.length) {
					await models.Payout.updateOne(
						{ _id: payout._id },
						{
							$addToSet: { images: { $each: invoiceUrls } },
							$set: { hasInvoice: true },
						}
					);
				}
			}

			let report;

			if (payout && auto.isCreateReport) {
				report = await utils.findOrCreateReport({
					payouts: [payout],
					blockId: block._id,
					auto,
					mtime,
				});
			}

			results.push({
				blockId: block._id,
				report,
				payout,
			});
		});
	});

	let payRequests;

	const payouts = _.compact(_.map(results, 'payout'));

	if (payouts.length && auto.isCreatePayRequest) {
		payRequests = await utils.findOrCreatePayRequest({
			payouts,
			description: `${auto.name} ${mtime.format('MM.YYYY')}`,
			auto,
		});
	}

	return {
		payments: results,
		payRequests,
	};
}

module.exports = {
	runAuto,
};
