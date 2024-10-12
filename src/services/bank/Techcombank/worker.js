const _ = require('lodash');
const { parentPort } = require('worker_threads');
const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const { v4: uuid } = require('uuid');
const path = require('path');

const { logger } = require('../../../utils/logger');
const { ACTIONS } = require('./const');

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.0 Safari/537.36';
const HOST = 'https://business.techcombank.com.vn';

const STATE = {};
const MAX_RETRY = 1;

async function onResponse(response) {
	const url = response.url();
	const method = response.request().method();

	if (method === 'POST' && url.includes('/meta-data-service/citad-bank-code')) {
		const rs = await response.json().catch(() => null);

		// abbreviation: 'TCB';
		// activeStatus: 'NO';
		// bankCitadCode: null;
		// bankLogo: 'TCB';
		// bankName: 'NH TMCP KY THUONG VN';
		// bankNameEn: 'Vietnam Technological and Commercial Joint-stock Bank';
		// bankNameVn: 'Ngân hàng TMCP Kỹ Thương Việt Nam';
		// bankShortName: 'Techcombank';
		// bankType: null;
		// bin: '970407';
		// citadBankListId: '310';
		// citadOrBidv: null;
		// napas: null;
		// orderSort: 1;
		if (rs && rs.data) {
			STATE.banks = rs.data;
		}
	}
}

function delay(ms) {
	return new Promise(rs => setTimeout(rs, ms));
}

async function waitForReady(timeout = 10000) {
	let start = Date.now();

	while (!STATE.banks) {
		if (Date.now() - start > timeout) {
			return Promise.reject('waitForReady timeout!');
		}
		await delay(200);
	}
}

async function loadBrowser({ username, password }) {
	if (!STATE.browser) {
		STATE.browser = await puppeteer.launch({
			headless: true,
			args: [
				'--no-sandbox', //
				'--disable-site-isolation-trials',
				'--disable-web-security',
			],
			defaultViewport: { width: 1024, height: 920 },
		});

		await STATE.browser.userAgent(USER_AGENT);

		const page = await STATE.browser.newPage();

		page.on('response', onResponse);

		const login = async (retried = 0) => {
			if (!page.url().includes('/dashboard')) {
				await page.goto(HOST, { waitUntil: 'networkidle0' });
				await page.waitForSelector('#kc-login');

				await page.type('#username', username);
				await page.type('#password', password);
				await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#kc-login')]);

				if (await page.evaluate(`document.querySelector('#kc-session-limits-form')`)) {
					await Promise.all([
						page.waitForNavigation({ waitUntil: 'networkidle0' }),
						page.click('#btn-submit'),
					]);
				}
			}

			const url = page.url();
			if (!url.includes('/dashboard')) {
				if (retried < MAX_RETRY) {
					await login();
				} else {
					return Promise.reject(`Techcombank login error ${url}`);
				}
			}
		};
		STATE.page = page;

		await login();
		await waitForReady();
	}

	return STATE;
}

async function close() {
	if (STATE.isFetchingTransactions || STATE.isCreatingTransfer) {
		return;
	}
	if (STATE.browser) {
		STATE.browser.close().catch(() => {});
		STATE.browser = null;
	}
}

async function getTransactions({ username, password, from, to, accountIds }) {
	try {
		const { page } = await loadBrowser({ username, password });

		const transactions = await Promise.all(
			accountIds.map(async accountId => {
				const uri = `${HOST}/api/transaction-manager/client-api/v2/transactions?bookingDateGreaterThan=${from}&bookingDateLessThan=${to}&arrangementsIds=${accountId}&from=0&size=50&orderBy=valueDate&direction=DESC`;

				const data = await page.evaluate(url => {
					// eslint-disable-next-line no-undef
					return fetch(url)
						.then(res => res.json())
						.catch(e => e.toString());
				}, uri);
				if (!_.isArray(data)) {
					logger.error('Techcombank fetch transactions', data);
					return [];
				}
				return data;
			})
		);

		return _.flatten(transactions);
	} catch (e) {
		logger.error(e);
		return [];
	}
}

function getPageCredentials(page) {
	return page.evaluate(() => {
		function getCookie(key) {
			// eslint-disable-next-line no-undef
			const cookies = document.cookie.split(';').map(c => c.trim());
			const val = cookies.find(c => c.startsWith(key));
			if (val) {
				return val.split('=')[1];
			}
		}

		return {
			Authorization: `Bearer ${getCookie('Authorization')}`,
			'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
		};
	});
}

function findBank(data) {
	const bank =
		STATE.banks.find(b => b.bin === data.creditAccountBankBin) ||
		STATE.banks.find(b => b.abbreviation === data.creditAccountBankCode);

	if (!bank) {
		logger.error('findBank -> bank not found', data);
		throw new Error('Không tìm thấy thông tin ngân hàng!');
	}

	return bank;
}

async function getInternalAccount({ page, accountNumber, credentials }) {
	const data = await page.evaluate(
		(url, bodyData, hheaders) => {
			// eslint-disable-next-line no-undef
			return fetch(url, {
				method: 'POST',
				body: bodyData,
				headers: {
					...hheaders,
					'Content-Type': 'application/json',
				},
			})
				.then(res => res.json())
				.catch(e => e);
		},
		`${HOST}/api/tcb-bb-business-banking-payments-accounts-application/client-api/v2/account-detail/internal`,
		JSON.stringify({ accountNumber }),
		credentials
	);

	return data;
}

async function makeTranserRequest({
	username,
	password,
	date,
	accountId,
	accountOriginName,
	creditAccountNo,
	creditAccountName,
	creditAccountBankCode,
	creditAccountBankBin,
	transferAmount,
	remark,
}) {
	const { page } = await loadBrowser({ username, password });

	await waitForReady();

	const targetBank = findBank({ creditAccountBankBin, creditAccountBankCode });

	const uri = `${HOST}/api/payment-order-service/client-api/v2/payment-orders`;
	const isInternal = creditAccountBankCode === 'TCB';

	const credentials = await getPageCredentials(page);

	if (isInternal) {
		const data = await getInternalAccount({ page, accountNumber: creditAccountNo, credentials });
		if (data && data.accountName) {
			creditAccountName = data.accountName;
		}
	}

	const body = {
		originatorAccount: {
			identification: { identification: accountId, schemeName: 'ID' },
			name: accountOriginName, // 'VND-TGTT-CTCP DV CONG NGHE COZRUM',
		},
		requestedExecutionDate: date,
		paymentType: isInternal ? 'TCB_INTERNAL_PAYMENTS' : 'TCB_NAPAS_PAYMENTS',
		transferTransactionInformation: {
			instructedAmount: { amount: transferAmount.toString(), currencyCode: 'VND' },
			counterparty: { name: creditAccountName },
			counterpartyAccount: { identification: { identification: creditAccountNo, schemeName: 'BBAN' } },
			counterpartyBank: {
				name: `${targetBank.bankShortName} - ${targetBank.bankNameEn} (${targetBank.abbreviation})`, // 'Techcombank - Vietnam Technological and Commercial Joint-stock Bank (TCB)'
			},
			messageToBank: remark,
		},
		additions: {
			bankCitadCode: targetBank.bankCitadCode || '',
			bankShortName: targetBank.bankShortName,
			bankLogo: targetBank.bankLogo,
			bankNameVn: targetBank.bankNameVn,
			bankNameEn: targetBank.bankNameEn,
			partnerAcctNo: isInternal ? creditAccountNo : '',
		},
	};

	const data = await page.evaluate(
		(url, bodyData, hheaders) => {
			// eslint-disable-next-line no-undef
			return fetch(url, {
				method: 'POST',
				body: bodyData,
				headers: {
					...hheaders,
					'Content-Type': 'application/json',
				},
			})
				.then(res => res.json())
				.catch(e => e);
		},
		uri,
		JSON.stringify(body),
		credentials
	);

	if (!data || !data.id) {
		logger.error('Techcombank makeTranserRequest', data);
		return Promise.reject(data && data.message);
	}

	return data;
}

async function generateInternalFile(items, requestNo, page, credentials) {
	const wsData = [
		[
			'SỐ THAM CHIẾU (Không dấu, tối đa 16 ký tự)',
			'SỐ TIỀN',
			'HỌ TÊN NGƯỜI THỤ HƯỞNG',
			'TÀI KHOẢN ĐÍCH (Dãy số liền, không phân cách)',
			'DIỄN GIẢI (Dùng chữ không dấu. Tối đa 100 ký tự. Tránh các ký tự đặc biệt)',
		],
	];

	if (credentials) {
		for (const item of items) {
			const internalInfo = await getInternalAccount({ page, accountNumber: item.creditAccountNo, credentials });
			if (internalInfo && internalInfo.accountName) {
				item.creditAccountName = internalInfo.accountName;
			}
		}
	}

	items.forEach((item, index) => {
		wsData.push([
			`LC${requestNo}NO${index + 1}`,
			item.transferAmount,
			item.creditAccountName,
			item.creditAccountNo,
			item.remark,
		]);
	});

	const ws = xlsx.utils.aoa_to_sheet(wsData);
	const wb = xlsx.utils.book_new();
	xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');

	const fileName = `LC${requestNo}`;
	const filePath = path.resolve(`tmp/${fileName}.xlsx`);

	await xlsx.writeFile(wb, filePath);

	return { filePath, fileName };
}

async function generateExternalFile(items, requestNo) {
	const template = 'payment_external.xlsx';

	const wb = await xlsx.readFile(path.join(__dirname, template));
	const ws = wb.Sheets.Sheet1;

	items.forEach((item, index) => {
		const row = index + 2;

		const targetBank = findBank(item);

		_.set(ws, [`A${row}`, 'v'], `LC${requestNo}NO${index + 1}`);
		_.set(ws, [`B${row}`, 'v'], item.transferAmount);
		_.set(ws, [`C${row}`, 'v'], item.creditAccountName);
		_.set(ws, [`D${row}`, 'v'], item.creditAccountNo);
		_.set(ws, [`E${row}`, 'v'], item.remark);
		// _.set(ws, [`F${row}`, 'v'], 'QUAN DOI (MB)-311');
		_.set(ws, [`F${row}`, 'v'], `${targetBank.bankName}-${targetBank.citadBankListId}`);
	});

	const fileName = `LC${requestNo}`;
	const filePath = path.resolve(`tmp/${fileName}.xlsx`);

	await xlsx.writeFile(wb, filePath);

	return { filePath, fileName };
}

async function makeBulkTranserRequest({
	username,
	password,
	accountId,
	accountOriginName,
	accountNo,
	requestNo,
	items,
	isPayroll,
}) {
	const internals = items.filter(item => item.creditAccountBankCode === 'TCB');
	const externals = items.filter(item => item.creditAccountBankCode !== 'TCB');

	if (internals.length && externals.length) {
		return Promise.reject('Các tài khoản thụ hưởng phải cùng ở trong hoặc ngoài Techcombank!');
	}

	const { page } = await loadBrowser({ username, password });
	await waitForReady();

	const credentials = await getPageCredentials(page);

	const { filePath, fileName } = internals.length
		? await generateInternalFile(internals, requestNo, page, credentials)
		: await generateExternalFile(externals, requestNo);

	const inputFileId = await page.evaluate(() => {
		// eslint-disable-next-line no-undef
		const input = document.createElement('input');
		input.type = 'file';
		input.id = 'fileUploadCz';
		// eslint-disable-next-line no-undef
		document.body.append(input);

		return input.id;
	});

	const uploadElem = await page.waitForSelector(`#${inputFileId}`);
	await uploadElem.uploadFile(filePath);
	await uploadElem.evaluate(upload => upload.dispatchEvent(new Event('change', { bubbles: true })));

	const fileId = uuid();

	const endpoint = `${HOST}/api/corp-batch-payment-dis/client-api/v1/batch-${isPayroll ? 'payrolls' : 'payments'}`;

	const fileUploaded = await page.evaluate(
		(url, uploadId, elemFileId, hheaders) => {
			// eslint-disable-next-line no-undef
			const input = document.querySelector(`#${elemFileId}`);

			// eslint-disable-next-line no-undef
			const formData = new FormData();
			formData.append('file', input.files[0]);
			formData.append('batchType', 'Payment');
			formData.append('uploadId', uploadId);

			// eslint-disable-next-line no-undef
			return fetch(url, {
				method: 'POST',
				body: formData,
				headers: hheaders,
			})
				.then(res => res.json())
				.catch(e => e.toString());
		},
		`${endpoint}/files/upload`,
		fileId,
		inputFileId,
		credentials
	);

	logger.info('fileUploaded', fileUploaded);

	if (!fileUploaded.fileId) {
		logger.error('Upload file error', fileUploaded);
		return Promise.reject('Upload file error');
	}

	const unSuccessTransactions = await page.evaluate(
		(url, body, hheaders) => {
			// eslint-disable-next-line no-undef
			return fetch(url, {
				method: 'POST',
				body,
				headers: {
					...hheaders,
					'Content-Type': 'application/json',
				},
			})
				.then(res => res.json())
				.catch(e => e);
		},
		`${endpoint}/files/payments?pageNumber=0&pageSize=10`,
		JSON.stringify({ fileId: fileUploaded.fileId, isSuccess: false }),
		credentials
	);

	logger.info('unSuccessTransactions', unSuccessTransactions);

	if (unSuccessTransactions.paymentList.length) {
		logger.error('Có giao dịch lỗi', unSuccessTransactions);
		return Promise.reject('Có giao dịch lỗi', unSuccessTransactions);
	}

	const order = await page.evaluate(
		(url, body, hheaders) => {
			// eslint-disable-next-line no-undef
			return fetch(url, {
				method: 'PUT',
				body,
				headers: {
					...hheaders,
					'Content-Type': 'application/json',
				},
			})
				.then(res => res.json())
				.catch(e => e);
		},
		`${endpoint}/orders`,
		JSON.stringify({
			fileId: fileUploaded.fileId,
			debitAccountNumber: accountNo, // '19033764681025',
			debitAccountName: accountOriginName, // 'VND-TGTT-CTCP DV CONG NGHE COZRUM',
			debitAccountId: accountId, // 'd64ec640-22ba-436b-803a-1eb0db5590ea',
			batchName: fileName,
			description: accountOriginName, // 'VND-TGTT-CTCP DV CONG NGHE COZRUM',
			approve: false,
		}),
		credentials
	);

	return { ...fileUploaded, ...order, isPayroll };
}

async function cancelTransferRequest({ username, password, id, status, orderId, amount, isPayroll }) {
	const { page } = await loadBrowser({ username, password });

	await waitForReady();

	const credentials = await getPageCredentials(page);

	if (orderId) {
		const data = await page.evaluate(
			(url, headers) => {
				// eslint-disable-next-line no-undef
				return fetch(url, {
					method: 'PUT',
					headers,
				})
					.then(res => res.json())
					.catch(e => e);
			},
			`${HOST}/api/corp-batch-payment-dis/client-api/v1/batch-${
				isPayroll ? 'payrolls' : 'payments'
			}/orders/${orderId}/cancellation`,
			credentials
		);

		if (!data) {
			logger.error('Techcombank cancelTransferRequest', data);
			return Promise.reject(_.get(data, 'message') || data);
		}

		return data;
	}

	const orderEp = `${HOST}/api/payment-order-service/client-api/v2/payment-orders`;

	const orders = await page.evaluate(
		(url, headers) => {
			// eslint-disable-next-line no-undef
			return fetch(url, {
				headers,
			})
				.then(res => res.json())
				.catch(e => e);
		},
		`${orderEp}?status=${status}&amountFrom=${amount}&amountTo=${amount}&paymentMode=SINGLE&from=0&size=50`,
		credentials
	);

	const order = orders.find(o => o.id === id);
	if (!order) return;

	const data = await page.evaluate(
		(url, headers, body) => {
			// eslint-disable-next-line no-undef
			return fetch(url, {
				method: 'POST',
				body,
				headers: {
					...headers,
					'Content-Type': 'application/json',
				},
			})
				.then(res => res.json())
				.catch(e => e);
		},
		`${orderEp}/${id}/cancel`,
		credentials,
		JSON.stringify({ version: order.version })
	);

	if (!data || !data.accepted) {
		logger.error('Techcombank cancelTransferRequest', data);
		return Promise.reject(_.get(data, 'message') || data);
	}

	return data;
}

async function onMessage({ action, payload, ...params }) {
	try {
		let result;

		if (action === ACTIONS.FETCH_TRANSACTIONS) {
			if (STATE.isFetchingTransactions) {
				result = [];
			} else {
				STATE.isFetchingTransactions = true;
				result = await getTransactions(payload);
			}
		}
		if (action === ACTIONS.MAKE_TRANSFER_REQUEST) {
			result = await makeTranserRequest(payload);
		}
		if (action === ACTIONS.MAKE_BULK_TRANSFER_REQUEST) {
			result = await makeBulkTranserRequest(payload);
		}
		if (action === ACTIONS.CANCEL_TRANSFER_REQUEST) {
			result = await cancelTransferRequest(payload);
		}

		parentPort.postMessage({ result, ...params });
	} catch (error) {
		logger.error('Techcombank', action, payload, error);
		parentPort.postMessage({ error, ...params });
	} finally {
		if (STATE.isFetchingTransactions) {
			STATE.isFetchingTransactions = false;
		}
		if (STATE.isCreatingTransfer) {
			STATE.isCreatingTransfer = false;
		}
		await close();
	}
}

parentPort.on('message', onMessage);
