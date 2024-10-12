const moment = require('moment');
const mongoose = require('mongoose');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { Services } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

function getDatesRange(from, to) {
	const date = moment(from).startOf('days');
	const t = moment(to).startOf('days');

	const dates = [];
	while (date.unix() < t.unix()) {
		dates.push(date.toDate());
		date.add(1, 'days');
	}
	return dates;
}

async function getHourlyPrice({
	ratePlan,
	checkIn,
	fromHour,
	toHour,
	VATPercent,
	vatRate,
	// roomIds,
	numRoom,
	roomTypeId,
}) {
	let defaultPrice = 0;
	let promoPrice = 0;

	const price = await models.tbPrice.findPrices({
		roomTypeId,
		ratePlanId: ratePlan._id,
		checkIn,
		fromHour,
		toHour,
	});

	defaultPrice = price.priceOrigin;
	promoPrice = price.price;

	const { priceAdditionalHours, additionalHours } = price;

	const result = {
		defaultPrice,
		promoPrice,
		date: checkIn,
		fromHour,
		toHour,
		VATPercent,
		noVATPrice: defaultPrice / vatRate,
		noVATPromoPrice: promoPrice / vatRate,
		discount: (promoPrice / defaultPrice) * 100 || 0,
	};

	defaultPrice = parseNumber(defaultPrice * numRoom);
	promoPrice = parseNumber(promoPrice * numRoom);

	const noVATPrice = defaultPrice / vatRate;
	const noVATPromoPrice = promoPrice / vatRate;

	return {
		defaultPrice,
		promoPrice,
		priceAdditionalHour: priceAdditionalHours,
		VATPercent,
		noVATPrice,
		noVATPromoPrice,
		additionalHours,
		prices: result,
		ratePlan,
	};
}

async function getDailyPrice({
	roomTypeId,
	ratePlan,
	otaListingId,
	checkIn,
	checkOut,
	VATPercent,
	vatRate,
	// roomIds,
	numRoom,
}) {
	await models.tbPrice.calcPromotionPrice({
		// otaListingId,
		from: checkIn,
		to: checkOut,
		roomTypeId,
		ratePlanId: ratePlan._id,
	});

	let defaultPrice = 0;
	let promoPrice = 0;

	const dates = getDatesRange(checkIn, checkOut);

	const data = await models.tbPrice.aggregate()
		.match({
			roomTypeId: mongoose.Types.ObjectId(roomTypeId),
			ratePlanId: ratePlan._id,
			date: { $gte: checkIn, $lte: checkOut },
		})
		.group({
			_id: { roomTypeId: '$roomTypeId', ratePlanId: '$ratePlanId', date: '$date' },
			promotionPrice: { $max: '$promotionPrice' },
			price: { $max: '$price' },
			available: { $max: '$available' },
			promotionId: { $max: '$promotionId' },
		});

	// pricesData
	await models.tbPromotion.populate(data, {
		path: 'promotionId',
		select: 'discount type name',
	});

	const pricesData = _.keyBy(data, p => p._id.date.toDateMysqlFormat());
	// .populate('promotionId', 'discount type name')
	// .then(rs => _.keyBy(rs, p => p.date.toDateMysqlFormat()));

	const basePrice = ratePlan.getBasePrice();

	const prices = dates
		.map(date => {
			const formattedDate = date.toDateMysqlFormat();

			const tbPrice = _.get(pricesData, formattedDate) || {};

			if (!tbPrice.price) {
				_.set(tbPrice, 'price', basePrice);
			}

			if (!tbPrice.price) {
				logger.warn(
					`Not found tb price for ${otaListingId} ${roomTypeId} ${ratePlan._id} at ${formattedDate}`
				);
				return;
			}

			const singlePromoPrice = tbPrice.promotionPrice || tbPrice.price;

			const result = {
				defaultPrice: tbPrice.price,
				promoPrice: singlePromoPrice,
				date,
				VATPercent,
				noVATPrice: tbPrice.price / vatRate,
				noVATPromoPrice: singlePromoPrice / vatRate,
				discount: _.get(tbPrice, 'promotionId.discount', 0),
				promoType: _.get(tbPrice, 'promotionId.type', 0),
				promoName: _.get(tbPrice, 'promotionId.name'),
			};

			defaultPrice += result.defautlPrice;
			promoPrice += singlePromoPrice;

			return result;
		})
		.filter(d => d);

	if (prices.length && prices.length !== dates.length) {
		throw new ThrowReturn(`Listing price not available! ${otaListingId}`);
	}

	defaultPrice = parseNumber(defaultPrice * numRoom);
	promoPrice = parseNumber(promoPrice * numRoom);
	const noVATPrice = defaultPrice / vatRate;
	const noVATPromoPrice = promoPrice / vatRate;

	const rates = prices.map(r => ({
		date: r.date.toDateMysqlFormat(),
		price: (r.promoPrice || r.defaultPrice) * numRoom,
		discount: r.discount,
		promotion: r.promoName,
	}));

	return {
		defaultPrice,
		promoPrice,
		VATPercent,
		noVATPrice,
		noVATPromoPrice,
		nights: dates.length,
		rates,
		prices,
		ratePlan,
	};
}

async function getPromotionPrice({
	blockId,
	// roomIds,
	checkIn,
	checkOut,
	otaListingId,
	numRoom,
	fromHour,
	toHour,
	roomTypeId,
	ratePlanId,
}) {
	checkIn = checkIn ? new Date(checkIn) : new Date();
	checkIn.zeroHours();
	checkOut = moment(checkOut ? new Date(checkOut) : moment(checkIn).add(1, 'days')).toDate();
	checkOut.zeroHours();
	numRoom = parseInt(numRoom) || 1;
	ratePlanId = parseInt(ratePlanId);
	if (numRoom <= 0) numRoom = 1;

	let VATPercent = 0;

	const selector = 'ref.ratePlanId name nameEn benefits policies';

	const populate = [
		{
			path: 'ref.ratePlanId',
			select: 'roomBasePrice',
		},
		{
			path: 'policies.policyId',
			select: 'displayName displayNameEn type description',
		},
	];

	const ratePlan = ratePlanId
		? await models.RatePlan.findOne({ _id: ratePlanId, active: true }).select(selector).populate(populate)
		: await models.RatePlan.findDefaultRatePlan({ blockId }).select(selector).populate(populate);

	if (!ratePlan) {
		throw new ThrowReturn(`RatePlan not found!`);
	}

	if (blockId) {
		const block = await models.Block.findById(blockId).select('manageFee rules');
		if (_.get(block, 'manageFee.hasVAT')) {
			VATPercent = await models.Setting.getVATPercent();
		}
	}

	const vatRate = 1 + VATPercent;

	if (ratePlan.serviceType === Services.Hour) {
		return getHourlyPrice({
			ratePlan,
			otaListingId,
			checkIn,
			fromHour,
			toHour,
			VATPercent,
			vatRate,
			// roomIds,
			numRoom,
			roomTypeId,
		});
	}

	return getDailyPrice({
		ratePlan,
		otaListingId,
		checkIn,
		checkOut,
		VATPercent,
		vatRate,
		// roomIds,
		numRoom,
		roomTypeId,
	});
}

function parseNumber(number) {
	return (number / 1000).toFixed(0) * 1000;
}

module.exports = {
	getPromotionPrice,
};
