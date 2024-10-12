const _ = require('lodash');

const { logger } = require('@utils/logger');
// const { PayoutType, PayoutStates } = require('@utils/const');
const models = require('@models');
const invoiceServives = require('@services/fee/water');
const utils = require('./utils');

async function runWithService({ auto, configAccount, period, time }) {
	const payments = [];

	const invoices = await invoiceServives[configAccount.provider].getInvoices({
		codes: _.map(auto.payouts, 'configValue'),
		date: time.toDate(),
	});
	if (!invoices.length) {
		logger.error('waterFee.runAuto invoices not found', invoices);
		return payments;
	}

	await invoices.asyncForEach(async invoice => {
		const pay = auto.payouts.find(p => p.configValue === invoice.code);
		if (!pay) return;

		const blockId = pay.blockId || auto.blockIds[0];
		if (!blockId) return;

		const payouts = await utils.findOrCreatePayout({
			amount: invoice.amount,
			vat: 0,
			categoryId: pay.categoryId,
			description: `${pay.description || auto.name} ${time.format('MM.YYYY')} - ${invoice.code}`,
			payAccountId: pay.payAccountId,
			payDebitAccountId: pay.payDebitAccountId,
			payDescription: `${pay.payDescription || 'CHI HO TIEN NUOC'} ${time.format('MM YYYY')} MA KH ${
				invoice.code
			}`,
			auto,
			period,
			blockId,
			images: invoice.invoiceUrl ? [invoice.invoiceUrl] : undefined,
		});

		let report;

		if (payouts.length && auto.isCreateReport) {
			report = await utils.findOrCreateReport({
				payouts,
				blockId,
				auto,
				mtime: time,
			});
		}

		payments.push({
			blockId,
			report,
			payouts,
		});
	});

	return payments;
}

async function runManual({ auto, period, time }) {
	const payments = [];

	await auto.payouts.asyncForEach(async pay => {
		const blockId = pay.blockId || auto.blockIds[0];
		if (!blockId) return;

		const payouts = await utils.findOrCreatePayout({
			allowNullAmount: true,
			amount: pay.amount || 0,
			vat: pay.vat,
			categoryId: pay.categoryId,
			description: `${pay.description || auto.name} ${time.format('MM.YYYY')} - Mã KH ${pay.configValue}`,
			payAccountId: pay.payAccountId,
			payDebitAccountId: pay.payDebitAccountId,
			payDescription: `${pay.payDescription || 'CHI HO TIEN NUOC'} ${time.format('MM YYYY')} MA KH ${
				pay.configValue
			}`,
			auto,
			period,
			blockId,
		});

		let report;

		if (payouts.length && auto.isCreateReport) {
			report = await utils.findOrCreateReport({
				payouts,
				blockId,
				auto,
				mtime: time,
			});
		}

		payments.push({
			blockId,
			report,
			payouts,
		});
	});

	return payments;
}

async function runAuto(auto, mtime, period) {
	let payments = [];

	const configAccount = auto.configAccountId && (await models.AccountConfig.findById(auto.configAccountId));

	if (
		configAccount &&
		configAccount.provider &&
		invoiceServives[configAccount.provider] &&
		invoiceServives[configAccount.provider].getInvoices
	) {
		payments = await runWithService({ auto, configAccount, period, time: mtime });
	} else {
		payments = await runManual({ auto, period, time: mtime });
	}

	let payRequests;

	const payouts = _.compact(_.flatten(_.map(payments, 'payouts')));

	if (payouts.length && auto.isCreatePayRequest) {
		payRequests = await utils.findOrCreatePayRequest({
			payouts,
			description: `${auto.name} ${mtime.format('MM.YYYY')}`,
			auto,
		});
	}

	return {
		payments,
		payRequests,
	};
}

module.exports = {
	runAuto,
};
