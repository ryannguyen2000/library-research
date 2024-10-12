const _ = require('lodash');
const { OTAs, PromotionCalcType } = require('@utils/const');

function toFixedNumber(result, toFixed = 2) {
	Object.keys(result).forEach(k => {
		result[k] = _.round(result[k], toFixed);
	});
}

function bookingCalc({
	fixedDeal = 0,
	basic = 0,
	lastMinute = 0,
	earlyBird = 0,
	flashSale = 0,
	nonRefund = 0,
	calcType,
}) {
	calcType = calcType || PromotionCalcType.Multi;

	const _basicDeal = 1 - basic;
	const _earlyBooker = 1 - Math.max(basic, earlyBird);
	const _lastMinute = 1 - Math.max(basic, lastMinute);
	const _flashSale = 1 - Math.max(basic, flashSale);

	const promo = {
		basicDeal: basic,
		earlyBird,
		lastMinute,
		flashSale,
	};
	const rate =
		calcType === PromotionCalcType.Multi
			? {
				nonPromo: (1 - fixedDeal) * _basicDeal,
				nonPromoNonRefund: (1 - fixedDeal) * _basicDeal * (1 - nonRefund),
				earlyBooker: (1 - fixedDeal) * _earlyBooker,
				earlyBookerNonRefund: (1 - fixedDeal) * _earlyBooker * (1 - nonRefund),
				lastMinuteDeal: (1 - fixedDeal) * _lastMinute,
				lastMinuteNonRefund: (1 - fixedDeal) * _lastMinute * (1 - nonRefund),
				flashSaleDeal: (1 - fixedDeal) * _flashSale,
				flashSaleNonRefund: (1 - fixedDeal) * _flashSale * (1 - nonRefund),
			}
			: {
				nonPromo: fixedDeal + _basicDeal,
				nonPromoNonRefund: fixedDeal + _basicDeal + nonRefund,
				earlyBooker: fixedDeal + _earlyBooker,
				earlyBookerNonRefund: fixedDeal + _earlyBooker + nonRefund,
				lastMinuteDeal: fixedDeal + _lastMinute,
				lastMinuteNonRefund: fixedDeal + _lastMinute + nonRefund,
				flashSaleDeal: fixedDeal + _flashSale,
				flashSaleNonRefund: fixedDeal + _flashSale + nonRefund,
			};

	toFixedNumber(promo);

	return {
		...promo,
		...rate,
	};
}

function otaCalc({ nonRefund = 0, fixedDeal = 0, toFixed, ratio, ref, calcType }) {
	ratio = (ratio && ratio.value) || 1;
	calcType = calcType || PromotionCalcType.Multi;

	if (calcType === PromotionCalcType.Multi) {
		fixedDeal = 1 - fixedDeal;

		const basic = 1 - (ref.nonPromo * ratio) / fixedDeal;
		const earlyBird = 1 - (ref.earlyBooker * ratio) / fixedDeal;
		const lastMinute = 1 - (ref.lastMinuteDeal * ratio) / fixedDeal;
		const flashSale = 1 - (ref.flashSaleDeal * ratio) / fixedDeal;

		const _basicDeal = 1 - basic;
		const _earlyBooker = 1 - Math.max(basic, earlyBird);
		const _lastMinute = 1 - Math.max(basic, lastMinute);
		const _flashSale = 1 - Math.max(basic, flashSale);

		const refund = 1 - nonRefund;

		const promo = {
			basicDeal: basic,
			earlyBird,
			lastMinute,
			flashSale,
		};
		const rate = {
			nonPromo: fixedDeal * _basicDeal,
			nonPromoNonRefund: fixedDeal * _basicDeal * refund,
			earlyBooker: fixedDeal * _earlyBooker,
			earlyBookerNonRefund: fixedDeal * _earlyBooker * refund,
			lastMinuteDeal: fixedDeal * _lastMinute,
			lastMinuteNonRefund: fixedDeal * _lastMinute * refund,
			flashSaleDeal: fixedDeal * _flashSale,
			flashSaleNonRefund: fixedDeal * _flashSale * refund,
		};

		toFixedNumber(promo, toFixed);
		return {
			...promo,
			...rate,
		};
	}

	const basicDeal = 1 - (fixedDeal + ref.nonPromo * ratio);
	const basicNonRefund = 1 - (fixedDeal + ref.nonPromoNonRefund * ratio + nonRefund);
	const earlyBird = 1 - (ref.earlyBooker * ratio + fixedDeal);
	const earlyBirdNonRefund = 1 - (ref.earlyBookerNonRefund * ratio + fixedDeal + nonRefund);
	const lastMinute = 1 - (ref.lastMinuteDeal * ratio + fixedDeal);
	const lastMinuteNonRefund = 1 - (ref.lastMinuteNonRefund * ratio + fixedDeal + nonRefund);
	const flashSale = 1 - (ref.flashSaleDeal * ratio + fixedDeal);
	const flashSaleNonRefund = 1 - (ref.flashSaleNonRefund * ratio + fixedDeal + nonRefund);

	const promo = {
		basicDeal: Math.max(basicDeal, 0.01),
		earlyBird: Math.max(earlyBird, 0.01),
		lastMinute: Math.max(lastMinute, 0.01),
		flashSale: Math.max(flashSale, 0.01),
	};
	const rate = {
		nonPromo: 1 - (fixedDeal + basicDeal),
		nonPromoNonRefund: 1 - (nonRefund + basicNonRefund + fixedDeal),
		earlyBooker: 1 - (fixedDeal + Math.max(basicDeal, earlyBird)),
		earlyBookerNonRefund: 1 - (fixedDeal + Math.max(basicNonRefund, earlyBirdNonRefund) + nonRefund),
		lastMinuteDeal: 1 - (fixedDeal + Math.max(basicDeal, lastMinute)),
		lastMinuteNonRefund: 1 - (fixedDeal + Math.max(basicDeal, lastMinuteNonRefund) + nonRefund),
		flashSaleDeal: 1 - (fixedDeal + Math.max(basicDeal, flashSale)),
		flashSaleNonRefund: 1 - (fixedDeal + Math.max(basicDeal, flashSaleNonRefund) + nonRefund),
	};

	toFixedNumber(promo, toFixed);

	return {
		...promo,
		...rate,
	};
}

const defaultRates = {
	traveloka: {
		val: {
			member: 0.15,
			mobile: 0.15,
			combo: 0.25,
			nonRefund: 0.1,
		},
		def: val => Math.max(val.member, val.mobile),
	},
	agoda: {
		val: {
			member: 0.15,
			mobile: 0.15,
			combo: 0,
			nonRefund: 0.1,
			domestic: 0.2,
		},
		def: val => Math.max(val.member, val.mobile, val.combo, val.domestic),
	},
	booking: {
		val: {
			member: 0,
			mobile: 0.15,
			combo: 0,
		},
		valGenius: {
			member: 0.1,
			mobile: 0.15,
			combo: 0,
		},
		def: val => 1 - (1 - val.member) * (1 - val.mobile) * (1 - val.combo),
	},
	expedia: {
		val: {
			member: 0.1,
			mobile: 0.15,
			combo: 0.2,
			nonRefund: 0.1,
		},
		def: val => Math.max(val.member, val.mobile),
	},
};

function calcPromotionConfig({ basic = 0, lastMinute = 0, earlyBird = 0, flashSale = 0 }, other = {}) {
	// const { price_change_type } = other;

	const data = {
		basic: basic / 100,
		lastMinute: lastMinute / 100,
		earlyBird: earlyBird / 100,
		flashSale: flashSale / 100,
	};

	const ratios = _.keyBy(other.ratio, 'otaName');
	const rateChannels = {};

	_.forEach(other.rateChannels, (v, k) => {
		rateChannels[k] = {
			...v,
			value: v.value / 100 || 0,
			geniusValue: v.geniusValue / 100 || 0,
		};
	});

	const rootOTA = OTAs.Booking;
	const rootRate = rateChannels[rootOTA];

	const bookingGenius = bookingCalc({
		...data,
		...defaultRates.booking.valGenius,
		fixedDeal: _.isUndefined(rootRate)
			? defaultRates.booking.def(defaultRates.booking.valGenius)
			: rootRate.geniusValue,
		calcType: rootRate && rootRate.calcType,
	});
	const booking = otaCalc({
		...data,
		...defaultRates.booking.val,
		ref: bookingGenius,
		fixedDeal: _.isUndefined(rootRate) ? defaultRates.booking.def(defaultRates.booking.val) : rootRate.value,
		calcType: rootRate && rootRate.calcType,
	});

	const rs = {
		...other,
		booking,
		bookingGenius,
	};

	const otherOTAs = [
		OTAs.Agoda,
		OTAs.Traveloka,
		OTAs.Expedia,
		OTAs.tb,
		OTAs.tbWeb,
		OTAs.Airbnb,
		OTAs.Ctrip,
		OTAs.Mytour,
		OTAs.Go2joy,
		OTAs.Tiket,
	];

	otherOTAs.forEach(ota => {
		const defaultRate = _.get(defaultRates, [ota, 'val']) || null;
		const configRate = rateChannels[ota];

		rs[ota] = otaCalc({
			...defaultRate,
			ref: bookingGenius,
			ratio: ratios[ota],
			fixedDeal:
				_.isUndefined(configRate) && defaultRate
					? defaultRates[ota].def(defaultRate)
					: _.get(configRate, 'value'),
			calcType: _.get(configRate, 'calcType'),
		});
	});

	return rs;
}

module.exports = {
	calcPromotionConfig,
};
