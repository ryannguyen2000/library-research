const moment = require('moment');
const _ = require('lodash');
const path = require('path');
const Client = require('ssh2-sftp-client');
const parseCsv = require('csv-parse/lib/sync');

const { checkFolder } = require('@utils/file');
const { PayoutType, PayoutStates, ThirdPartyPayment } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');

async function openFTP(config, { type, input, remote }) {
	const sftp = new Client();
	let data;

	try {
		await sftp.connect(config);

		if (type === 'upload') {
			data = await sftp.put(input, remote);
		} else {
			if (input) await checkFolder(path.dirname(input));

			data = await sftp.get(remote, input);
		}
	} catch (err) {
		console.log(err);
	}

	sftp.end();

	return data;
}

async function getFileReconcile({ account, date }) {
	const mdate = moment(date);
	const fileName = `PAY_REC_${account.partnerCode}_${mdate.format('YYYYMMDD')}.csv`;

	const fileData = await openFTP(account.configs.sftp, {
		remote: `${account.configs.sftpFolder}/${fileName}`,
	});

	if (!fileData) {
		return Promise.reject(`Không tìm thấy file đối soát ${fileName}`);
	}

	return fileData;
}

function processFileData(fileData) {
	const items = parseCsv(fileData);

	const transactions = [];

	items.forEach((data, index) => {
		if (index === 0 || !data[3]) return;

		transactions.push({
			time: moment(data[1], 'YYYY-MM-DD HH:mm:ss').toDate(),
			ref: data[3],
			description: data[4],
			type: data[6],
			amount: Number(data[10]) || 0,
			status: data[11],
			fee: Number(data[12]) || 0,
		});
	});

	return transactions;
}

async function getReconcileData({ account, date }) {
	const fileData = await getFileReconcile({ account, date });

	const transactions = processFileData(fileData);

	return transactions;
}

async function createAutoReports({ date } = {}) {
	date = date || moment().subtract(1, 'day').toDate();

	const source = ThirdPartyPayment.NEO_PAY;

	const account = await models.PaymentMethod.findOne({ name: source });

	const recTransactions = await getReconcileData({ account, date });

	if (!recTransactions || !recTransactions.length) {
		logger.warn('neopay not found reconcile file', date);
		return;
	}

	const payouts = await models.Payout.find({
		otaId: _.map(recTransactions, 'ref'),
		collectorCustomName: source,
	});

	if (!payouts.length) {
		logger.warn('neopay not found payouts', recTransactions);
		return;
	}

	const revObjs = _.keyBy(recTransactions, 'ref');

	await payouts.asyncMap(payout => {
		const rec = revObjs[payout.otaId];

		if (rec && rec.fee !== payout.transactionFee) {
			payout.transactionFee = rec.fee;
			return payout.save();
		}
	});

	let report;

	if (payouts.some(p => p.inReport)) {
		report = await models.PayoutExport.findOne({
			payoutType: PayoutType.RESERVATION,
			payouts: { $in: _.map(payouts, '_id') },
			state: { $ne: PayoutStates.DELETED },
			source,
			createdBy: null,
		});
	}

	if (!report) {
		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `${_.upperFirst(source)} ngày ${moment(date).format('DD/MM/YYYY')}`,
			payouts: _.map(payouts, '_id'),
			source,
		});
	}

	return report;
}

module.exports = {
	createAutoReports,
};
