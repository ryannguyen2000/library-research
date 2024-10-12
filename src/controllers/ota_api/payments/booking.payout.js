const parseCsv = require('csv-parse/lib/sync');
const moment = require('moment');
const _ = require('lodash');
// const cherrio = require('cheerio');
// const fetch = require('node-fetch');

const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');
const Uri = require('@utils/uri');
const models = require('@models');

// require('isomorphic-fetch');

const END_POINT = 'https://admin.booking.com/fresa/extranet';

async function fetchReport(period, propertyId, ota) {
	try {
		const uri = `${END_POINT}/finance/reservation_statement_download?hotel_id=${propertyId}&period=${period}-01&ses=${ota.other.ses}&lang=en&view=csv`;

		const res = await fetchRetry(
			uri,
			{
				headers: {
					Cookie: ota.cookie,
				},
			},
			ota
		);

		const resText = await res.text();

		if (res.status !== 200) {
			logger.error('Booking fetchReport', uri, resText);
			return [];
		}

		const records = parseCsv(resText, { columns: true, skip_empty_lines: true });
		const items = records.filter(record => record['Reservation number']);

		return items.map(record => {
			return {
				otaName: OTAs.Booking,
				otaBookingId: record['Reservation number'],
				fullName: record['Booker name'],
				price: Number(record['Final amount']),
				fee: Number(record['Commission amount']),
				status: record.Status,
				currency: record.Currency,
				invoiceId: record['Invoice number'],
				hotelId: record['Hotel id'],
			};
		});
	} catch (e) {
		logger.error(e);
	}
}

async function fetchInvoices(propertyId, ota) {
	try {
		const uri = `${END_POINT}/finance/invoice?hotel_id=${propertyId}&ses=${ota.other.ses}&lang=en&active_real_language_code_with_dialect=0`;

		const res = await fetchRetry(
			uri,
			{
				headers: {
					Cookie: ota.cookie,
				},
			},
			ota
		);

		const json = await res.json();

		if (!json.success) {
			logger.error('Booking fetchInvoices', uri, json);
			return;
		}

		return {
			invoices: json.data.invoices.filter(i => i.status === 'unpaid'),
			bankDetails: json.data.booking_bank_details_html,
		};
	} catch (e) {
		logger.error(e);
	}
}

async function downloadInvoice(invoiceName, propertyId, ota) {
	const uri = `${END_POINT}/finance/invoices/get_document?ses=${ota.other.ses}&hotel_id=${propertyId}&lang=en&invoice_name=${invoiceName}`;

	const res = await fetchRetry(
		uri,
		{
			headers: {
				Cookie: ota.cookie,
			},
		},
		ota
	);

	return res.buffer();
}

async function getReport(period, blockId) {
	const properties = await models.Block.findById(blockId)
		.select('OTAProperties')
		.then(res => (res ? res.OTAProperties.filter(p => p.otaName === OTAs.Booking) : null));

	if (!properties || !properties.length) return [];

	return await properties
		.asyncMap(async property => {
			const [otaConfig] = await models.OTAManager.findByName(OTAs.Booking, property.account);
			const reports = otaConfig ? await fetchReport(period, property.propertyId, otaConfig) : [];

			return { name: property.account, otaName: OTAs.Booking, reports };
		})
		.then(res => res.filter(report => report.reports.length > 0));
}

async function getPayInvoices(block) {
	const properties = block.OTAProperties.filter(p => p.otaName === OTAs.Booking);
	if (!properties || !properties.length) return [];

	const invs = await properties.asyncMap(async property => {
		const [otaConfig] = await models.OTAManager.findByName(OTAs.Booking, property.account);
		if (!otaConfig) return;

		const invoices = await fetchInvoices(property.propertyId, otaConfig);
		if (!invoices || !invoices.invoices.length) return;

		const data = await invoices.invoices.asyncMap(async invoice => {
			const rs = {
				id: invoice.id,
				amount: invoice.invoice_amount,
				name: invoice.invoice_name,
				date: invoice.date,
				dueDate: invoice.due_date,
			};

			const invoiceFile = await downloadInvoice(invoice.invoice_name, property.propertyId, otaConfig).catch(
				() => null
			);

			if (invoiceFile) {
				rs.invoiceFile = {
					data: invoiceFile,
					name: `${invoice.invoice_name}.pdf`,
				};
			}

			return rs;
		});

		return {
			property,
			invoices: data,
			payDescription: `Payment for invoice ${data.map(i => i.id).join(' ')} ID${property.propertyId} ${
				block.info.name
			}`,
			bankAccountName: 'Booking.com B.V.',
			bankDetail: invoices.bankDetails,
		};
	});

	return invs.filter(i => i);
}

function getInvalidCardReason(cardInfo) {
	// reason
	// no_cvc - CVC missing
	// name_missmatch - Card name different from guest
	// declined - Transaction declined
	// no_credit - Insufficient funds
	// expired - Card expired
	// invalid_nr - Invalid credit card number
	// call_company - "Call card company" message
	// debit_card - It's a debit card
	// fraud - Fraudulent
	// other - Other

	if (!cardInfo || !cardInfo.cardNumber) return 'invalid_nr';

	if (!cardInfo.cvc) return 'no_cvc';
	if (
		!cardInfo.expirationDate ||
		moment(cardInfo.expirationDate, 'MM/YYYY').format('YY-MM') < moment().format('YY-MM')
	)
		return 'expired';

	return 'declined';
}

async function markCardInvalid({ otaConfig, otaBookingId, propertyId, cardInfo }) {
	if (!cardInfo || !cardInfo.cardNumber) {
		return Promise.reject('Chưa có thông tin thẻ!');
	}

	const uri = Uri(`${END_POINT}/invalidcc/mark_invalid`, {
		ses: otaConfig.other.ses,
		lang: 'en',
		hotel_account_id: otaConfig.other.accountId,
		hotel_id: propertyId,
		hotelreservation_id: otaBookingId,
		last_digits: cardInfo && cardInfo.cardNumber ? cardInfo.cardNumber.slice(-4) : '',
		reason: getInvalidCardReason(cardInfo),
	});

	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			redirect: 'manual',
		},
		otaConfig
	);

	const json = await res.json();
	if (!json.success || !json.data || !json.data.success) {
		logger.error('markCardInvalid not success', JSON.stringify(json));
		return Promise.reject(_.get(json, 'data.errors[0]') || json.message || json);
	}

	return json;
}

async function getBookingPaymentInfo({ otaConfig, otaBookingId, propertyId }) {
	const uri = Uri(`${END_POINT}/reservations/details/credit_card_details`, {
		ses: otaConfig.other.ses,
		lang: 'en',
		hotel_account_id: otaConfig.other.accountId,
		hotel_id: propertyId,
		hres_id: otaBookingId,
	});

	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			headers: {
				// 'User-Agent':
				// 	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
				Cookie: otaConfig.cookie,
				Accept: '*/*',
				// 'Accept-Encoding': 'gzip, deflate, br',
				// Connection: 'keep-alive',
				Origin: 'https://admin.booking.com',
				Referer: 'https://admin.booking.com',
			},
		},
		otaConfig
	);

	if (!res.ok) {
		logger.error('getBookingPaymentInfo not success', res.status, await res.text());
		return Promise.reject(`${res.status}`);
	}

	const json = await res.json();

	if (!json.success) {
		logger.error('getBookingPaymentInfo not success', JSON.stringify(json));
		return Promise.reject(json);
	}

	return json;
}

module.exports = {
	getReport,
	getPayInvoices,
	markCardInvalid,
	getBookingPaymentInfo,
};
