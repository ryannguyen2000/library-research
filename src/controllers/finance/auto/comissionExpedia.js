const _ = require('lodash');
const moment = require('moment');
const { UPLOAD_CONFIG } = require('@config/setting');

const { OTAs, BANK_ACCOUNT, PayoutAutoTypes } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const { expedia: Payment } = require('@controllers/ota_api/payments');
const utils = require('./utils');

async function findOrCreateBankAccount(bankInfo, block) {
	let bank = await models.Bank.findOne({
		citadCode: bankInfo.citadCode,
	});
	if (!bank) {
		// bank = await models.Bank.create({
		// 	name: bankInfo.bankName,
		// 	bankCode: 'SCVN',
		// 	citadCode: bankInfo.citadCode,
		// 	SWIFT: bankInfo.SWIFT,
		// });
		logger.error('comissionExpedia.runAuto findOrCreateBankAccount not found bank', bankInfo);
		return;
	}

	let account = await models.BankAccount.findOne({
		accountNos: bankInfo.accountNumber,
		bankId: bank._id,
		active: true,
	});
	if (!account) {
		account = await models.BankAccount.create({
			name: `${bankInfo.accountName} (${block.info.name})`,
			accountNos: [bankInfo.accountNumber],
			accountName: bankInfo.accountName,
			bankId: bank._id,
			validated: true,
			groupIds: block.groupIds,
			type: [BANK_ACCOUNT.PARTER],
		});
	}

	return account;
}

async function runAuto(auto, mtime, period) {
	if (!Payment) {
		logger.error('comissionExpedia.runAuto Not found module');
		return;
	}

	const categoryIds = _.compact(_.map(auto.payouts, 'categoryId'));
	const otaName = OTAs.Expedia;

	const bFilter = {
		active: true,
		isProperty: true,
		isTest: false,
		OTAProperties: {
			$elemMatch: {
				otaName,
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

	const blocks = await models.Block.find(bFilter).select('info.name OTAProperties groupIds');
	const debitAccounts = await models.BankAccount.find({
		_id: _.compact(_.map(auto.payouts, 'payDebitAccountId')),
	});

	const results = [];

	const from = moment().subtract(1, 'year').toDate();
	const to = new Date();

	await blocks.asyncForEach(async block => {
		let currentPayout = await auto.payouts.find(
			p => p.payDebitAccountId && p.blockId && p.blockId.equals(block._id)
		);

		if (!currentPayout) {
			currentPayout = await auto.payouts.find(p => !p.blockId && p.payDebitAccountId);
		}

		const debitAccount = currentPayout && debitAccounts.find(d => d._id.equals(currentPayout.payDebitAccountId));
		if (!debitAccount) {
			logger.error('comissionExpedia.runAuto Not found debitAccount', block._id, auto);
			return;
		}

		const property = block.getPropertyId(otaName);
		const [otaConfig] = await models.OTAManager.findByName(otaName, property.account);

		const paymentRes = await Payment.getPayments(otaConfig, property.propertyId, from, to);
		const invoices = _.filter(
			_.get(paymentRes, 'invoices.invoices'),
			invoice => invoice.balanceDue && invoice.payable
		);
		if (!invoices.length) return;

		const bankInvoiceInfo = await Payment.getBankAccount(otaConfig, property.propertyId);
		if (!bankInvoiceInfo || !bankInvoiceInfo.accountNumber) return;

		const payAccount = await findOrCreateBankAccount(bankInvoiceInfo, block);
		const payouts = [];

		await invoices.asyncForEach(async invoiceData => {
			const [payout] = await utils.findOrCreatePayout({
				amount: invoiceData.balanceDue,
				categoryId: categoryIds[0],
				description: `${auto.name} ${mtime.format('MM.YYYY')} - ${block.info.name}`,
				payAccountId: payAccount && payAccount._id,
				payDebitAccountId: debitAccount && debitAccount._id,
				payDescription: `PAYMENT FOR INVOICE ${invoiceData.transactionNumber} HTID${property.propertyId}`,
				auto,
				period,
				blockId: block._id,
				otaId: `${otaName}_${invoiceData.transactionId}`,
			});
			if (payout && !payout.images.length) {
				const filePath = `${moment(invoiceData.transactionDate).format('YY/MM/DD')}/invoice`;
				const fileName = `${invoiceData.pdfFilePath}.pdf`;

				await Payment.downloadInvoice({
					invoiceData,
					otaConfig,
					propertyId: property.propertyId,
					filePath: `${UPLOAD_CONFIG.PATH}/${filePath}/${fileName}`,
				})
					.then(() => {
						return models.Payout.updateOne(
							{ _id: payout._id },
							{
								$addToSet: { images: `${UPLOAD_CONFIG.FULL_URI}/${filePath}/${fileName}` },
								$set: { hasInvoice: true },
							}
						);
					})
					.catch(e => {
						logger.error(`${otaName} Payment.downloadInvoice`, invoiceData, e);
					});
			}
			if (payouts) {
				payouts.push(payout);
			}
		});

		let report;

		if (payouts.length && auto.isCreateReport) {
			report = await utils.findOrCreateReport({
				payouts,
				blockId: block._id,
				auto,
				mtime,
			});
		}

		results.push({
			blockId: block._id,
			report,
			payouts,
		});
	});

	let payRequests;

	const payouts = _.flatten(_.map(results, 'payouts'));

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
