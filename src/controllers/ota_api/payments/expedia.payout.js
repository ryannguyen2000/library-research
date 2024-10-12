const _ = require('lodash');
const vm = require('vm');
const moment = require('moment');
const cheerio = require('cheerio');

const fetchRetry = require('@utils/fetchRetry');
const { OTAs, Currency, PayoutType, PayoutStates, OTA_PAYMENT_METHODS } = require('@utils/const');
const { logger } = require('@utils/logger');
const { downloadContentFromUrl } = require('@utils/file');
const models = require('@models');
const { getExpediaHeader } = require('@controllers/ota_api/header_helper');

const OTAName = OTAs.Expedia;
const HOST = 'https://apps.expediapartnercentral.com/lodging';

async function getPayments(otaConfig, propertyId, from, to) {
	const uri = `${HOST}/accounting/getStatementsAndInvoicesSearchResults.json?htid=${propertyId}`;
	const body = {
		startDate: moment(from).format('Y-MM-DD'),
		endDate: moment(to).format('Y-MM-DD'),
	};

	try {
		const res = await fetchRetry(uri, { method: 'POST', body: JSON.stringify(body) }, otaConfig);
		const json = await res.json();

		if (!json.statements) {
			logger.error(`${OTAName} getPayments`, json);
			return;
		}

		return json;
	} catch (e) {
		logger.error(`${OTAName} getPayments`, e);
	}
}

async function getECInvoiceDetails(otaConfig, propertyId, payment) {
	const uri = `${HOST}/accounting/getECInvoiceDetails.json?htid=${propertyId}`;
	const body = {
		htid: propertyId,
		invoiceId: payment.invoiceId,
		invoiceSource: payment.source,
	};

	try {
		const res = await fetchRetry(uri, { method: 'POST', body: JSON.stringify(body) }, otaConfig);
		const result = await res.json();

		const rs = _.get(result, 'ecInvoiceDetailsRS.reservationSummaries');
		if (!rs) {
			logger.error(`${OTAName} getECInvoiceDetails`, result);
			return [];
		}

		return rs;
	} catch (e) {
		return [];
	}
}

async function getTransactions(otaConfig, property, from, to) {
	const paymentRes = await getPayments(otaConfig, property.propertyId, from, to);

	const paymentList = _.get(paymentRes, 'statements.paymentList') || [];

	const dayStart = '2022-12-28';

	const payoutsList = [];

	await paymentList
		.filter(p => p.dateRequested >= dayStart && p.amountProcessed)
		.asyncForEach(async payment => {
			const invoiceDetails = await getECInvoiceDetails(otaConfig, property.propertyId, payment);
			const { payouts } = await addPayments(payment, invoiceDetails, property);

			payoutsList.push({
				payment,
				payouts,
			});
		});

	await _.values(_.groupBy(payoutsList, p => p.payment.paymentNoticeId))
		.filter(payoutList => payoutList[0].payment.paymentNoticeId)
		.asyncForEach(payoutList => {
			return addPaymentReports({ property, payoutList });
		});
}

async function addPaymentReports({ payoutList, property }) {
	const payouts = _.flatten(_.map(payoutList, 'payouts'));

	if (!payouts.length) {
		logger.warn('Expedia addPaymentReports empty payouts', JSON.stringify(payoutList));
		return;
	}

	const payoutIds = _.map(payouts, '_id');

	const report = await models.PayoutExport.findOne({
		payouts: { $in: payoutIds },
		state: { $ne: PayoutStates.DELETED },
	});
	if (report) {
		// if (report.state !== PayoutStates.CONFIRMED && !isSamePayouts(report.payouts, payoutIds)) {
		// 	report.payouts = payoutIds;
		// 	await report.save();
		// }

		return;
	}

	const total = _.sumBy(payouts, 'currencyAmount.exchangedAmount');

	await models.PayoutExport.createExport({
		payoutType: PayoutType.RESERVATION,
		name: `Expedia Payment ${moment(payoutList[0].payment.datePaid).format('DD/MM/Y')} (${property.propertyName})`,
		payouts: payoutIds,
		currencyAmount: {
			VND: total,
		},
		source: OTAName,
		description: [
			`Tracking number: ${_.map(payoutList, 'payment.transmissionQueueID').join(', ')}`,
			`Payment request ID: ${_.map(payoutList, 'payment.invoiceId').join(', ')}`,
			`Payment statement: ${_.map(payoutList, 'payment.paymentNoticeId').join(', ')}`,
		].join('\n'),
		groupIds: property.groupIds,
	});
}

// function isSamePayouts(sourceIds, targetIds) {
// 	return _.map(sourceIds, _.toString).sort().toString() === _.map(targetIds, _.toString).sort().toString();
// }

async function addPayments(payment, invoiceDetails, property) {
	const bookings = await models.Booking.find({
		otaBookingId: _.map(invoiceDetails, inc => inc.reservationId.toString()),
		otaName: OTAName,
	})
		.select('_id blockId otaBookingId')
		.lean();

	const bookingsObj = _.keyBy(_.uniqBy(bookings, 'otaBookingId'), 'otaBookingId');

	const payouts = await invoiceDetails.asyncMap(invoice => {
		const booking = bookingsObj[invoice.reservationId];
		if (!booking) return;

		const currencyAmount = {
			amount: invoice.amountProcessed,
			currency: payment.amountProcessedCurrency || payment.amountPaidCurrency || Currency.VND,
		};

		return models.Payout.createOTAPayout({
			currencyAmount,
			otaName: OTAName,
			otaId: `${payment.invoiceId}_${invoice.reservationId}`,
			collectorCustomName: OTAName,
			description: `Tracking number: ${payment.transmissionQueueID} \n Payment request ID: ${payment.invoiceId}`,
			paidAt: new Date(payment.datePaid || payment.dateRequested),
			blockIds: [property.blockId || booking.blockId],
			bookingId: booking._id,
			fromOTA: true,
		}).catch(e => logger.error(e));
	});

	return {
		payouts: _.compact(payouts),
	};
}

async function fetchAll(from, to, blockId) {
	const otas = await models.OTAManager.findByName(OTAName);

	from = from || moment().add(-30, 'day').toDate();
	to = to || moment().add(2, 'day').toDate();

	await otas.asyncForEach(async ota => {
		const properties = await models.Block.getPropertiesId(OTAName, ota.account, true, blockId);
		return properties.asyncForEach(property => getTransactions(ota, property, from, to));
	});
}

async function getAwaitingCollections({ otaConfig, property, from, to }) {
	to = to || new Date();
	from = from || moment(to).subtract(30, 'day').toDate();

	const uri = `${HOST}/finance/getReservationDetailsByDates.json?htid=${
		property.propertyId
	}&start=${from.toDateMysqlFormat()}&end=${to.toDateMysqlFormat()}`;

	const res = await fetchRetry(uri, null, otaConfig);
	const json = await res.json();

	// StayLevelCost
	// StayLevelTaxes

	const transactions = _.map(json, tran => ({
		otaId: _.toString(tran.BookingItemId),
		amountToSale: tran.BillableAmount,
		amountFromOTA: tran.BillableAmount,
		amountToOTA: 0,
		amount: tran.BillableAmount,
		otaBookingId: _.toString(tran.BookingItemId),
		otaName: OTAName,
		booked: '',
		checkIn: new Date(tran.UseDateBegin).toDateMysqlFormat(),
		checkOut: new Date(tran.UseDateEnd).toDateMysqlFormat(),
		guestName: tran.PrimaryTravelerFullName,
		id: tran.BillableAmount,
		status: tran.Status,
		currency: tran.CurrencyCode,
		originData: tran,
	}));

	return {
		transactions,
		totalAmount: _.sumBy(transactions, 'amount'),
		currency: _.get(transactions[0], 'currency'),
		paymentMethod: OTA_PAYMENT_METHODS.BANK_TRANSFER,
		paymentMethodName: 'Bank Transfer',
		date: new Date().toDateMysqlFormat(),
		// status: 'awaiting',
		newPayout: true,
	};
}

async function confirmAwaitingCollections({ otaConfig, propertyId, transactions, paymentMethod, paymentMethodName }) {
	const uri = `${HOST}/finance/createInvoice.json?htid=${propertyId}`;
	// {"TransmissionQueID":25222191,"InputDocumentID":25244161}
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify({
				invoiceData: _.map(transactions, (tran, index) => {
					return {
						PaidAmount: 0,
						InvoiceAmt: tran.originData.BillableAmount,
						...tran.originData,
						checked: true,
						rowNum: index,
					};
				}),
			}),
		},
		otaConfig
	).then(res => res.json());

	if (!result && !result.TransmissionQueID) {
		return Promise.reject(result);
	}

	return {
		paymentMethod,
		paymentMethodName,
		...result,
	};
}

async function getBankAccount(otaConfig, propertyId) {
	try {
		const uri = `${HOST}/accounting/paymentSettings.html?htid=${propertyId}`;

		const res = await fetchRetry(uri, null, otaConfig);
		const html = await res.text();

		const sandbox = {
			window: {},
		};

		vm.createContext(sandbox);

		const $ = cheerio.load(html);

		const dataStr =
			$('script')
				.map((idx, e) => $(e).html())
				.filter((idx, d) => d.includes('window.paymentSettings'))[0] || '';

		vm.runInContext(dataStr, sandbox);

		const remittanceInstruction = _.get(
			sandbox.window,
			'paymentSettings.paymentSettingsPayload.paymentSettingsHc.hcPaymentInformation.remittanceInstruction'
		);
		if (!remittanceInstruction) {
			logger.error(`${OTAName} getBankAccount null`, sandbox);
			return;
		}

		const bankData = {};

		remittanceInstruction.split('<br>').forEach(content => {
			if (content.startsWith('Credit to')) {
				bankData.accountName = content.replace('Credit to:', '').trim();
			} else if (content.startsWith('Bank Name')) {
				bankData.bankName = content.replace('Bank Name:', '').trim();
			} else if (content.startsWith('Account Number')) {
				bankData.accountNumber = content.replace('Account Number:', '').trim();
			} else if (content.startsWith('Citad code')) {
				bankData.citadCode = content.replace('Citad code:', '').trim();
			} else if (content.startsWith('SWIFT')) {
				bankData.SWIFT = content.replace('SWIFT:', '').trim();
			}
		});

		return bankData;
	} catch (e) {
		logger.error(`${OTAName} getBankAccount`, e);
	}
}

function downloadInvoice({ invoiceData, otaConfig, propertyId, filePath }) {
	const url = `${HOST}/accounting/downloadInvoicePdf?htid=${propertyId}&invoiceId=${invoiceData.transactionNumber}&pdfFilePath=${invoiceData.pdfFilePath}`;

	return downloadContentFromUrl({
		url,
		filePath,
		options: {
			headers: getExpediaHeader(otaConfig),
		},
	});
}

module.exports = {
	fetchAll,
	getAwaitingCollections,
	confirmAwaitingCollections,
	getPayments,
	getBankAccount,
	downloadInvoice,
};
