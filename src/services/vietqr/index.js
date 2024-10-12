const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { VIETQR_CONFIG } = require('@config/setting');

async function generateQr(data) {
	data.accountNo = _.trim(data.accountNo);
	data.accountName = _.trim(data.accountName);

	if (!data.accountNo) {
		throw new ThrowReturn('Số tài khoản không được để trống!');
	}
	if (!data.accountName) {
		throw new ThrowReturn('Tên tài khoản không được để trống!');
	}
	if (!data.acqId) {
		throw new ThrowReturn('Ngân hàng không hợp lệ!');
	}
	if (!_.isNumber(data.amount) || data.amount <= 0) {
		throw new ThrowReturn('Số tiền không hợp lệ!');
	}

	const body = {
		template: 'print',
		...data,
		// accountNo: '113366668888',
		// accountName: 'QUY VAC XIN PHONG CHONG COVID',
		// acqId: '970415',
		// addInfo: 'Ung Ho Quy Vac Xin',
		// amount: '79000',
	};

	const res = await fetch(`https://api.vietqr.io/v2/generate`, {
		method: 'POST',
		headers: {
			'x-client-id': VIETQR_CONFIG.clientId,
			'x-api-key': VIETQR_CONFIG.apiKey,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	const json = await res.json();

	if (json.code === '00') {
		return json.data;
	}

	logger.error('generateQr', data, json);
	throw new ThrowReturn(json.desc || json.error);
}

module.exports = {
	generateQr,
};
