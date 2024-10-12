const fs = require('fs');
const path = require('path');
const moment = require('moment');
const _ = require('lodash');

const models = require('@models');
const { convertNumber2VietnameseWord } = require('@utils/price');

async function getHtmlAttachment(transaction) {
	const html = await fs.promises.readFile(path.join(__dirname, 'attachment.html'), 'utf-8');

	const date = moment(transaction.tranTime).format('DD/MM/YYYY');
	const accountName = _.get(transaction.reqData, 'debitName') || _.get(transaction.accountId, 'accountName');
	const accountNo =
		_.get(transaction.reqData, 'debitResourceNumber') || _.get(transaction.accountId, 'accountNos[0]');
	const taxCode = _.get(transaction.accountId, 'taxCode');
	const transactionId = transaction.docNo;
	const branch = '';
	const amount = Math.abs(transaction.meta.amount).toLocaleString();
	const creditAccountNo = _.get(transaction.reqData, 'creditResourceNumber');
	const creditAccountName = _.get(transaction.reqData, 'creditName');

	const amountText = `${convertNumber2VietnameseWord(Math.abs(transaction.meta.amount))} đồng`;
	const remark = _.get(transaction.reqData, 'remark') || _.get(transaction.data, 'content');
	// const creditAccountName = '';
	let creditBankName = '';

	if (creditAccountNo && _.get(transaction.reqData, 'bankCode')) {
		const creditBank = await models.Bank.findOne({ bin: transaction.reqData.bankCode });
		if (creditBank) {
			creditBankName = `${creditBank.name} (${creditBank.bankCode})`;
		}
	}

	const parsedHtml = html
		.replaceAll('{{date}}', date)
		.replaceAll('{{accountName}}', accountName)
		.replaceAll('{{accountNo}}', accountNo)
		.replaceAll('{{taxCode}}', taxCode)
		.replaceAll('{{transactionId}}', transactionId)
		.replaceAll('{{branch}}', branch)
		.replaceAll('{{amount}}', amount)
		.replaceAll('{{creditAccountNo}}', creditAccountNo)
		.replaceAll('{{creditAccountName}}', creditAccountName)
		.replaceAll('{{creditBankName}}', creditBankName)
		.replaceAll('{{amountText}}', amountText)
		.replaceAll('{{remark}}', remark);

	return parsedHtml;
}

module.exports = {
	getHtmlAttachment,
};
