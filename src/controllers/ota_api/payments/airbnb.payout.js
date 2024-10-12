const _ = require('lodash');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
const { OTAs, Currency, PayoutStates, PayoutType } = require('@utils/const');
const { logger } = require('@utils/logger');
const URI = require('@utils/uri');
const models = require('@models');
const { AIRBNB_HOST } = require('@controllers/ota_api/header_helper');

const MICRO = 1000000;
const LIMIT = 50;
const MAX_PAGE = 50;
const OTA_NAME = OTAs.Airbnb;

async function fetchPayouts(from, to, otaConfig, pagination_token, page = 1) {
	const uri = URI(`${AIRBNB_HOST}/api/v2/fetch_payout_transactions`, {
		key: otaConfig.other.key,
	});
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify({
				payout_transaction_filters: {
					user_ids: [otaConfig.other.revieweeId],
					start_timestamp: new Date(from).toISOString(),
					end_timestamp: new Date(to).toISOString(),
					airbnb_product_type_filters: [],
				},
				product_transaction_attributes: [
					'LOCALIZED_PRODUCT_DETAILS',
					'LOCALIZED_PRODUCT_DESCRIPTIONS',
					'GUEST_NAMES',
					'ATTACHED_RESERVATION_DETAILS',
				],
				payout_transaction_attributes: [
					'LOCALIZED_PAYOUT_METHOD_DETAILS',
					'PRODUCT_TRANSACTIONS',
					'RELATED_PAYOUT_TOKENS',
					'PAYOUT_PRODUCTS',
				],
				meta_options: { limit: LIMIT, pagination_token },
			}),
		},
		otaConfig
	)
		.then(res => res.json())
		.catch(e => e);

	if (!result || !result.payoutTransactions) {
		logger.error(`${OTA_NAME} fetchPayouts error`, result);
	}

	if (result && result.paginationToken && page <= MAX_PAGE) {
		return [
			...result.payoutTransactions,
			...(await fetchPayouts(from, to, otaConfig, result.paginationToken, page + 1)),
		];
	}

	return result && result.payoutTransactions ? result.payoutTransactions : [];
}

async function getProductData(product) {
	const booking = await models.Booking.findOne({
		otaName: OTA_NAME,
		otaBookingId: product.productConfirmationCode,
	})
		.select('_id blockId listingId')
		.populate('listingId', 'blockId')
		.lean();

	let bookingBackupData = null;
	let blockId = null;

	if (!booking) {
		bookingBackupData = {
			from: new Date(product.bookingStartTimestamp),
			to: new Date(product.bookingEndTimestamp),
			price: product.currencyAmount.nativeCurrencyAmountFormatted.amountMicros / MICRO,
			currency: product.currencyAmount.nativeCurrencyAmountFormatted.currency,
			otaName: OTA_NAME,
			otaBookingId: product.productConfirmationCode,
			guestId: {
				fullName: _.head(product.guestNames) || '',
			},
			blockId: {
				info: {
					name: product.localizedProductDescription,
				},
			},
		};
	} else {
		blockId = _.get(booking.listingId, 'blockId') || booking.blockId;
	}

	return {
		currencyAmount: {
			amount: product.currencyAmount.nativeCurrencyAmountFormatted.amountMicros / MICRO,
			currency: product.currencyAmount.nativeCurrencyAmountFormatted.currency,
		},
		bookingId: booking ? booking._id : null,
		blockIds: blockId ? [blockId] : [],
		bookingBackupData,
		productId: product.token,
	};
}

async function createPayouts(transactions, otaConfig) {
	return await transactions
		.filter(transaction => transaction.productTransactions)
		.asyncForEach(async transaction => {
			const products = await transaction.productTransactions.asyncMap(getProductData);

			const exchangedAmount =
				transaction.transactionCurrencyAmount.nativeCurrencyAmountFormatted.amountMicros / MICRO;
			const amount = _.sumBy(products, 'currencyAmount.amount');
			const exchange = exchangedAmount / amount || 0;

			const currencyAmount = {
				amount,
				exchangedAmount,
				exchange,
				currency: transaction.transactionCurrencyAmount.nativeCurrencyAmountFormatted.currency || Currency.USD,
			};

			// calculate product currency amount
			let remainAmount = exchangedAmount;
			let index = 0;
			for (; index < products.length - 1; index++) {
				const currentExchange = products[index].currencyAmount.currency === Currency.VND ? 1 : exchange;
				const exchanged = Math.round(currentExchange * products[index].currencyAmount.amount);
				products[index].currencyAmount.exchangedAmount = exchanged;
				remainAmount -= exchanged;
			}
			products[index].currencyAmount.exchangedAmount = remainAmount;

			const payouts = await products.asyncMap(p => {
				const curAmount = { ...currencyAmount };
				curAmount.amount = p.currencyAmount.amount;
				curAmount.exchangedAmount = p.currencyAmount.exchangedAmount;
				curAmount.currency = p.currencyAmount.currency;

				const data = {
					...p,
					otaName: OTA_NAME,
					otaId: transaction.token,
					currencyAmount: curAmount,
					collectorCustomName: OTA_NAME,
					description: transaction.localizedTransactionCode,
					paidAt: new Date(transaction.payoutTimestamp),
					fromOTA: true,
				};

				return models.Payout.createOTAPayout(data).catch(e => logger.error('createPayouts', OTA_NAME, data, e));
			});

			const payoutIds = _.compact(_.map(payouts, '_id'));
			if (payoutIds.length) {
				const payoutExport = await models.PayoutExport.findOne({
					payouts: { $in: payoutIds },
					state: { $ne: PayoutStates.DELETED },
				}).select('_id');
				if (payoutExport) return;

				const total = _.sumBy(payouts, 'currencyAmount.exchangedAmount');

				await models.PayoutExport.createExport({
					payoutType: PayoutType.RESERVATION,
					name: `Airbnb Payment ${moment(transaction.payoutTimestamp).format('DD/MM/Y')}`,
					payouts: payoutIds,
					currencyAmount: {
						VND: total,
					},
					source: OTA_NAME,
					description: transaction.localizedTransactionCode,
					groupIds: otaConfig.groupIds,
				});
			}
		});
}

async function fetchAll(from, to) {
	const otas = await models.OTAManager.find({ name: OTA_NAME, active: true });

	from = from || moment().add(-30, 'day').toDate();
	to = to || moment().add(2, 'day').toDate();

	await otas.asyncForEach(async ota => {
		const transactions = await fetchPayouts(from, to, ota);

		await createPayouts(transactions, ota);
	});
}

module.exports = {
	fetchAll,
};
