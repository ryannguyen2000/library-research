const moment = require('moment');
const _ = require('lodash');
const { v4: uuid } = require('uuid');

const fetch = require('@utils/fetch');
const createUri = require('@utils/uri');
const { URL_CONFIG } = require('@config/setting');

const { ThirdPartyPayment, ThirdPartyPaymentStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');

const PAYMENT_NAME = ThirdPartyPayment.KOVENA;

async function checkToken(config, type = 'privateAuth') {
	if (
		!config.configs ||
		!config.configs.auth ||
		!config.configs.auth.access_token ||
		!new Date(config.configs.auth.expires_at) < moment().subtract(10, 'minute').toDate()
	) {
		const url = `${config.endpoint}${type === 'privateAuth' ? '' : '/public'}/v1/token`;

		const data = await fetch(url, {
			headers: {
				'x-user-secret-key': config.secretKey,
			},
		}).then(res => res.json());

		if (!data.success) {
			logger.error('Kovena getToken error', url, data);
			return Promise.reject(data);
		}

		config.set(`configs.${type}`, data.data);

		await config.save();
	}

	return config.configs[type];
}

async function createPaymentUrl({ booking, otaBookingId, amount, currency = 'VND', paymentRef }) {
	const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

	const tokenData = await checkToken(config, 'publicAuth');

	let guest;

	if (!booking.populated('guestId')) {
		guest = await models.Guest.findById(booking.guestId).select('fullName');
	} else {
		guest = booking.guestId;
	}

	const booking_info = {
		booking_date: moment(booking.createdAt).format('DD/MM/Y'),
		booking_ref: booking.otaBookingId,
		check_in_date: moment(booking.from).format('DD/MM/Y'),
		check_out_date: moment(booking.to).format('DD/MM/Y'),
		customer_name: guest.fullName,
		// customer_email: guest.email,
		// customer_phone: guest.phone,
		surcharge_amount: 0,
		original_transaction_amount: paymentRef.amount,
		original_transaction_currency: paymentRef.currency,
	};

	const notify_tokenize_url = `${URL_CONFIG.SERVER}/web/v1/payment/kovena_tokenize`;

	const data = JSON.stringify({
		token: tokenData.access_token,
		merchantId: config.partnerCode,
		reference: paymentRef.ref,
		return_url: '',
		notify_url: config.notifyUrl,
		currency,
		amount,
		bookingId: otaBookingId,
		notify_tokenize_url,
		booking_info,
		// widgetScript: config.configs.widgetScript,
	});

	const paymentUrl = `${URL_CONFIG.SERVER}/static/kovena/${
		config.endpoint.includes('staging-api') ? 'payment-staging' : 'payment'
	}.html?data=${Buffer.from(data).toString('base64')}`;

	return {
		url: paymentUrl,
		notifyUrl: notify_tokenize_url,
	};
}

function safeParseJSON(txt) {
	try {
		return JSON.parse(txt);
	} catch (e) {
		return undefined;
	}
}

async function request(config, url, options, resApi) {
	const { access_token } = await checkToken(config);

	const { debug = true, ...opts } = options || {};

	logger.info('Kovena request', url);
	logger.info(opts);

	opts.headers = {
		accept: 'application/json',
		'content-type': 'application/json',
		authorization: `Bearer ${access_token}`,
		'idempotency-key': uuid(),
	};

	let apiDebugger;

	if (debug) {
		apiDebugger = await models.APIDebugger.create({
			from: 'kovena',
			request: opts,
			url,
			receiving: false,
		});
	}

	const res = await fetch(url, opts);

	if (resApi && res.headers.get('content-disposition')) {
		_.forEach(res.headers.raw(), (v, k) => {
			resApi.setHeader(k, _.toString(v));
		});

		res.body.pipe(resApi);
		return;
	}

	if (resApi) {
		resApi.sendData(await res.json());
		return;
	}

	const resData = await res.text();

	if (debug) {
		logger.info('Kovena response');
		logger.info(resData);
	}

	if (apiDebugger) {
		apiDebugger.response = {
			data: resData,
			headers: res.headers,
			status: res.status,
		};
		apiDebugger.save().catch(() => {});
	}

	const json = safeParseJSON(resData);

	if (!res.ok) {
		logger.error('Kovena request error', res.status, resData);

		return Promise.reject(_.get(json, 'friendly_message') || `Kovena request error ${res.status}`);
	}

	if (json && json.success) {
		return json;
	}

	return Promise.reject(_.get(json, 'friendly_message') || 'Kovena error');
}

async function retrieveVaultToken(vaultToken) {
	const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

	const { data } = await request(config, `${config.endpoint}/v1/vault/${vaultToken}`);

	return data;
}

async function createPayment(params) {
	const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

	const body = {
		merchant_id: config.partnerCode,
		...params,
	};

	const { data } = await request(config, `${config.endpoint}/v1/charges`, {
		body: JSON.stringify(body),
		method: 'POST',
	});

	return data;
}

async function refundPayment(config, { amount, transactionNo, originRef, booking }) {
	const guest = await models.Guest.findById(booking.guestId).select('fullName email phone');

	const body = {
		amount,
		is_sending_email: false,
		booking_info: {
			booking_date: moment(booking.createdAt).format('YYYY-MM-DD'),
			booking_ref: booking.otaBookingId,
			check_in_date: moment(booking.from).format('YYYY-MM-DD'),
			check_out_date: moment(booking.to).format('YYYY-MM-DD'),
			customer_name: guest.fullName,
			customer_email: guest.email,
			customer_phone: guest.phone,
			surcharge_amount: 0,
			original_transaction_amount: amount,
			original_transaction_currency: originRef.currency,
		},
	};

	const { data: dataRefund } = await request(
		config,
		`${config.endpoint}/v1/charges/${originRef.data.charge_id}/refunds/${transactionNo}`,
		{
			body: JSON.stringify(body),
			method: 'POST',
		}
	);

	if (!dataRefund.transaction_id) {
		logger.error('refundPayment', body, dataRefund);
		return Promise.reject(dataRefund);
	}

	return {
		status: ThirdPartyPaymentStatus.SUCCESS,
		transactionNo: dataRefund.transaction_id,
		data: dataRefund,
	};
}

// for report

async function getPayments(config, query) {
	const params = {
		// merchants: config.partnerCode,
		...query,
	};

	// params.page = start / limit/
	delete params.start;

	logger.info('getPayments');
	logger.info(params);

	const uri = createUri(`${config.endpoint}/v1/charges`, params);

	// reference
	// date_type - date_from, date_to, updated_at, created_at
	// date_from
	// date_to
	// page
	// limit
	// sort_by - reference, amount, currency, updated_at, created_at
	// order - desc, asc

	const data = await request(config, uri, {
		method: 'GET',
		debug: false,
	});

	return data;
}

async function getPayouts(config, req, res) {
	const params = {
		// merchants: config.partnerCode,
		...req.query,
	};

	// params.page = start / limit/
	delete params.start;

	logger.info('getPayouts');
	logger.info(params);

	const uri = createUri(`${config.endpoint}/v1/disbursements`, params);

	// reference
	// date_type - date_from, date_to, updated_at, created_at
	// date_from
	// date_to
	// page
	// limit
	// sort_by - reference, amount, currency, updated_at, created_at
	// order - desc, asc

	const data = await request(
		config,
		uri,
		{
			method: 'GET',
			debug: false,
		},
		res
	);

	return data;
}

async function getPayment(config, charge_id) {
	const uri = createUri(`${config.endpoint}/v1/charges/${charge_id}`);

	const data = await request(config, uri, {
		method: 'GET',
		debug: false,
	});

	return data;
}

async function getTransactions(config, req, res) {
	const params = {
		// merchants: config.partnerCode,
		// include: ['charge', 'customer'],
		include: 'merchant,customer,charge',
		...req.query,
	};

	delete params.start;

	logger.info('getTransactions');
	logger.info(params);

	const uri = createUri(`${config.endpoint}/v1/transactions`, params);

	// include - charge, customer
	// reference
	// date_type - date_from, date_to, updated_at, created_at
	// date_from
	// date_to
	// page
	// limit
	// sort_by - reference, amount, currency, updated_at, created_at
	// order - desc, asc

	const data = await request(
		config,
		uri,
		{
			method: 'GET',
			debug: false,
		},
		res
	);

	return data;
}

async function getTransaction(config, id) {
	const uri = createUri(`${config.endpoint}/v1/transactions/${id}`, {
		include: 'merchant,customer,charge',
	});

	// include - charge, customer
	// reference
	// date_type - date_from, date_to, updated_at, created_at
	// date_from
	// date_to
	// page
	// limit
	// sort_by - reference, amount, currency, updated_at, created_at
	// order - desc, asc

	const data = await request(config, uri, {
		method: 'GET',
		debug: false,
	});

	return data;
}

module.exports = {
	createPaymentUrl,
	createPayment,
	retrieveVaultToken,
	refundPayment,
	getPayments,
	getPayment,
	getTransactions,
	getTransaction,
	getPayouts,
};
