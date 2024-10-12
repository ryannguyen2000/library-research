const moment = require('moment');
const _ = require('lodash');
const path = require('path');
const Client = require('ssh2-sftp-client');

const { checkFolder } = require('@utils/file');

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

async function getFileReconcile({ serviceAccount, date }) {
	const mdate = moment(date);
	const fileName = `${serviceAccount.configs.channel}_${mdate.format('YYYYMMDD')}_TC.txt`;

	const fileData = await openFTP(serviceAccount.configs.ftp, {
		remote: `IN/${fileName}`,
	});

	if (!fileData) {
		return Promise.reject(`Không tìm thấy file đối soát ${fileName}`);
	}

	return fileData.toString();
}

function processFileData(fileData) {
	const arrData = fileData.split('\n').map(r => _.trim(r));
	const transactions = [];

	arrData.forEach((item, index) => {
		if (index === 0) return;

		const data = item.split('|');

		if (!data[0]) return;

		const trans = {
			no: parseInt(data[0]),
			channel: data[1],
			channelName: data[2],
			transactionType: data[3],
			transactionId: data[4],
			bankTransId: data[5],
			ft: data[6],
			time: moment(data[7], 'DD/MM/YYYY HH:mm:ss').toDate(),
			amount: Number(data[8]),
			currency: data[9],
			remark: data[10],
			status: data[11],
			debitAccountNo: data[12],
			debitAccountName: data[13],
			creditAccountNo: data[14],
			creditAccountName: data[15],
			accountNo: data[16],
			bankName: data[17],
			napasKey: data[18],
			addInfo: data[19],
			checkSum: data[20],
		};
		transactions.push(trans);
	});

	return transactions;
}

async function getReconcileData({ serviceAccount, date }) {
	const fileData = await getFileReconcile({ serviceAccount, date });

	const transactions = processFileData(fileData);

	return transactions;
}

function editAddInfo(addInfo, newData) {
	const infoObjs = {};

	addInfo.split(';').forEach(valStr => {
		const [k, v] = valStr.split('=');
		if (!k) return;
		infoObjs[k] = v || '';
	});

	_.assign(infoObjs, newData);

	const newAddInfo = _.entries(infoObjs)
		.map(([k, v]) => `${k}=${v}`)
		.join(';');

	return `${newAddInfo};`;
}

async function sendReconcileData({ serviceAccount, date, diffTransactions, missingTransactions, matchTransactions }) {
	const fDate = moment(date).format('YYYYMMDD');
	const fnPrefix = `${serviceAccount.configs.channel}_${fDate}`;

	const diffs = [];

	if (diffTransactions.length || missingTransactions.length) {
		const diffFileName = `${fnPrefix}_CL.txt`;

		const title = `STT|Channel|Channel name|Loai giao dich|Request id|Bank trans id|FT|Ngay giao dich|So tien giao dich|Loai tien te|Noi dung giao dich|Trang thai giao dich|Tai khoan ghi no|Ten chu tai khoan ghi no|Tai khoan ghi co|Ten chu tai khoan ghi co|So tai khoan don vi thu huong|Ten ngan hang nhan|Key doi soat napas|Trang thai giao dich|Add_Info|Check sum`;

		diffTransactions.forEach((trans, index) => {
			const diffType = trans.diffKey === 'NOT_FOUND_LOCAL' ? 'THUA MB' : 'SAI LECH';
			diffs.push([
				index + 1,
				_.get(trans.bankTransaction, 'channel'),
				_.get(trans.bankTransaction, 'channelName'),
				_.get(trans.bankTransaction, 'transactionType'),
				_.get(trans.bankTransaction, 'transactionId'),
				_.get(trans.bankTransaction, 'bankTransId'),
				_.get(trans.bankTransaction, 'ft'),
				moment(
					trans.diffKey === 'TIME'
						? _.get(trans.localTransaction, 'tranTime')
						: _.get(trans.bankTransaction, 'time')
				).format('DD/MM/YYYY HH:mm:ss'),
				trans.diffKey === 'AMOUNT'
					? Math.abs(_.get(trans.localTransaction, 'meta.amount'))
					: _.get(trans.bankTransaction, 'amount'),
				_.get(trans.bankTransaction, 'currency'),
				_.get(trans.bankTransaction, 'remark'),
				_.get(trans.bankTransaction, 'status'),
				_.get(trans.bankTransaction, 'debitAccountNo'),
				_.get(trans.bankTransaction, 'debitAccountName'),
				_.get(trans.bankTransaction, 'creditAccountNo'),
				_.get(trans.bankTransaction, 'creditAccountName'),
				_.get(trans.bankTransaction, 'accountNo'),
				_.get(trans.bankTransaction, 'bankName'),
				_.get(trans.bankTransaction, 'napasKey'),
				diffType,
				diffType === 'SAI LECH'
					? editAddInfo(_.get(trans.bankTransaction, 'addInfo'), {
							OTHER: trans.diffKey === 'TIME' ? 'SAI LECH NGAY' : 'SAI LECH TIEN',
					  })
					: _.get(trans.bankTransaction, 'addInfo'),
				_.get(trans.bankTransaction, 'checkSum'),
			]);
		});

		missingTransactions.forEach((trans, index) => {
			diffs.push([
				diffTransactions.length + index + 1,
				serviceAccount.configs.channel,
				serviceAccount.configs.partnerCode,
				trans.meta.transferType === 'INHOUSE' ? '6001' : '6003',
				trans.meta.transactionId,
				trans.docNo,
				trans.docNo,
				moment(trans.tranTime).format('DD/MM/YYYY HH:mm:ss'),
				Math.abs(trans.meta.amount),
				'VND',
				'',
				'',
				'',
				'',
				'',
				'',
				'',
				'',
				'',
				'THUA DOI TAC',
				'',
				'',
			]);
		});

		const fileData = Buffer.from([title, ...diffs.map(d => d.join('|'))].join('\n'));

		await openFTP(serviceAccount.configs.ftp, {
			type: 'upload',
			remote: `OUT/${diffFileName}`,
			input: fileData,
		});
	}

	const THFileName = `${fnPrefix}_TH.txt`;
	const services = _.uniq([..._.map(matchTransactions, 'bankTransaction.transactionType'), ..._.map(diffs, 3)]);

	const THLines = [
		`STT|Ngay giao dich|Dich vu|So luong can khop|Gia tri can khop|So luong chenh lech|Gia tri chenh lech|Ket qua|Add_Info|Check sum`,
		...services.map((s, i) => {
			const cmatchs = matchTransactions.filter(m => m.bankTransaction.transactionType === s);
			const cdiffs = diffs.filter(m => m[3] === s);

			return [
				i + 1,
				fDate,
				s,
				cmatchs.length,
				_.sumBy(cmatchs, 'bankTransaction.amount'),
				cdiffs.length,
				_.sumBy(cdiffs, 8),
				cdiffs.length ? 1 : 0,
				'',
				'',
			].join('|');
		}),
	];

	await openFTP(serviceAccount.configs.ftp, {
		type: 'upload',
		remote: `OUT/${THFileName}`,
		input: Buffer.from(THLines.join('\n')),
	});
}

module.exports = {
	getReconcileData,
	sendReconcileData,
};
