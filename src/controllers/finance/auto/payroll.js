const _ = require('lodash');
const xlsx = require('xlsx');

const ThrowReturn = require('@core/throwreturn');
const fetch = require('@utils/fetch');
const { BANK_ACCOUNT_TYPE, BANK_ACCOUNT_SOURCE_TYPE } = require('@utils/const');
const models = require('@models');
const utils = require('./utils');

async function getFileData(auto, sheetName) {
	const fileData = await fetch(auto.imports.url).then(res => res.buffer());

	const wb = await xlsx.read(fileData);

	const ws = wb.Sheets[sheetName];
	if (!ws) {
		throw new ThrowReturn(`Auto payout not found sheet ${sheetName}`);
	}

	const sheetObjs = {};
	const startRow = 2;

	_.forEach(ws, (cell, cKey) => {
		const row = Number(cKey.replace(/\D/g, ''));
		if (row >= startRow) {
			const col = cKey.replace(/\d/g, '');
			if (col === 'A') _.set(sheetObjs, [row, 'userNo'], cell.v);
			if (col === 'B') _.set(sheetObjs, [row, 'amount'], _.round(Number(cell.v)) || 0);
			if (col === 'C') _.set(sheetObjs, [row, 'bhxh'], cell.v);
			if (col === 'D') _.set(sheetObjs, [row, 'description'], cell.v);
		}
	});

	return _.values(sheetObjs);
}

async function runAuto(auto, mtime, period) {
	const items = await getFileData(auto, mtime.format('MM-Y'));

	const bankAccounts = await models.BankAccount.find({ no: _.map(items, 'userNo') }).lean();
	const debitAccounts = await models.BankAccount.find({ _id: _.compact(_.map(auto.payouts, 'payDebitAccountId')) });
	const accounts = _.keyBy(bankAccounts, 'no');

	const ctgs = await models.PayoutCategory.find({ _id: _.compact(_.map(auto.payouts, 'categoryId')) }).sort({
		order: 1,
	});
	const validItems = items.filter(item => accounts[item.userNo]);

	const result = await auto.blockIds.asyncForEach(async blockId => {
		const payouts = _.flatten(
			await validItems.asyncMap(item => {
				const debitAccountType = item.bhxh ? BANK_ACCOUNT_TYPE.COMPANY : BANK_ACCOUNT_TYPE.COMPANY_PERSONAL;
				const creditAccount = accounts[item.userNo];
				const debitAccount =
					creditAccount.sourceType === BANK_ACCOUNT_SOURCE_TYPE.BANKING
						? _.find(debitAccounts, a => a.accountType === debitAccountType) ||
						  _.find(debitAccounts, a => a.accountType === BANK_ACCOUNT_TYPE.PERSONAL)
						: null;

				const ctg =
					(_.get(creditAccount.payoutCategoryIds, 'length') &&
						ctgs.find(c => creditAccount.payoutCategoryIds.includesObjectId(c._id))) ||
					ctgs[0];

				const description = item.description || `${auto.name} ${mtime.format('MM.YYYY')}`;

				return utils.findOrCreatePayout({
					auto,
					period,
					blockId,
					payAccountId: creditAccount._id,
					amount: item.amount,
					description,
					payDescription: description,
					payDebitAccountId: _.get(debitAccount, '_id'),
					categoryId: ctg._id,
				});
			})
		);

		let report;

		if (auto.isCreateReport && payouts.length) {
			report = await utils.findOrCreateReport({
				payouts,
				blockId,
				auto,
				mtime,
			});
		}

		let payRequests;

		if (report && auto.isCreatePayRequest) {
			payRequests = await utils.findOrCreatePayRequest({
				payouts,
				description: report.name,
				debitAccounts,
				bankAccounts,
				auto,
			});
		}

		return {
			blockId,
			payouts,
			report,
			payRequests,
		};
	});

	return {
		importData: items,
		result,
	};
}

module.exports = {
	runAuto,
};
