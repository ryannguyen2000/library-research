const _ = require('lodash');

const { logger } = require('@utils/logger');
// const { PayoutType, PayoutStates } = require('@utils/const');
const models = require('@models');
const { getInvoices } = require('@services/fee/evnHcm');
const utils = require('./utils');

async function runAuto(auto, mtime, period) {
	if (!auto.configAccountId) {
		logger.error('electricFee.runAuto configAccountId not found', auto);
		return;
	}

	const codes = _.compact(_.map(auto.payouts, 'configValue'));
	if (!codes.length) {
		logger.error('electricFee.runAuto categoryId not found', auto);
		return;
	}

	const configAccount = await models.AccountConfig.findById(auto.configAccountId);

	const invoices = await getInvoices({
		username: configAccount.username,
		password: configAccount.password,
		codes: _.map(auto.payouts, 'configValue'),
		date: mtime.toDate(),
	});
	if (!invoices.length) {
		logger.error('electricFee.runAuto invoices not found', invoices);
		return;
	}

	const payments = [];

	await invoices.asyncForEach(async invoice => {
		const pay = auto.payouts.find(p => p.configValue === invoice.code);
		if (!pay) return;

		const blockId = pay.blockId || auto.blockIds[0];
		if (!blockId) return;

		const payouts = await utils.findOrCreatePayout({
			amount: invoice.amount,
			categoryId: pay.categoryId,
			description: `${pay.description || auto.name} ${mtime.format('MM.YYYY')} - ${invoice.code}`,
			payAccountId: pay.payAccountId,
			payDebitAccountId: pay.payDebitAccountId,
			payDescription: `${pay.payDescription || 'DIEN SINH HOAT'} ${mtime.format('MM YYYY')} MA KH ${
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
				mtime,
			});
		}

		payments.push({
			blockId,
			report,
			payouts,
		});
	});

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
