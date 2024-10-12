const _ = require('lodash');
const moment = require('moment');
// const mongoose = require('mongoose');

const {
	OTAs,
	PromotionType,
	PromotionRuleSetType,
	PromotionRuleSetBlockType,
	OTAHasGeniusPromotion,
	LocalOTA,
	PromotionExecType,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const algorithms = require('./algorithms');
const { calcPromotionConfig } = require('./promotionOtasCalc');
const APIs = require('./otas');
const { PROMOTION_NAME, PROMOTION_MAP_TYPE, PROMOTION_MAP } = require('./const');

function getDiscountByType(promoType, otaData) {
	let value = 0;

	switch (promoType) {
		case PromotionType.Basic: {
			value = otaData.basicDeal;
			break;
		}
		case PromotionType.EarlyBird: {
			value = otaData.earlyBird;
			break;
		}
		case PromotionType.LastMinute: {
			value = otaData.lastMinute;
			break;
		}
		case PromotionType.NightFlashSale: {
			value = otaData.flashSale;
			break;
		}
		case PromotionType.HourlySale: {
			value = otaData.hourlySale;
			break;
		}
		default:
			break;
	}

	return Math.round(value * 10000) / 100;
}

function getRealDiscountByType(promoType, promoConfig, ota) {
	let value = 0;

	const otaData = promoConfig[ota];

	if (!otaData) {
		value = 1 - promoConfig.threshold_one / 100;
	} else {
		switch (promoType) {
			case PromotionType.Basic: {
				value = 1 - otaData.nonPromo || otaData.basicDeal;
				break;
			}
			case PromotionType.EarlyBird: {
				value = 1 - otaData.earlyBooker || otaData.earlyBird;
				break;
			}
			case PromotionType.LastMinute: {
				value = 1 - otaData.lastMinuteDeal || otaData.lastMinute;
				break;
			}
			case PromotionType.NightFlashSale: {
				value = 1 - otaData.flashSaleDeal || otaData.flashSale;
				break;
			}
			default:
				break;
		}
	}

	return Math.round(value * 10000) / 100;
}

function getOtaPromotionData(promoType, promoConfig, ota) {
	const rs = {
		early_booker_amount: promoConfig.threshold_one,
		last_minute_amount_days: promoConfig.threshold_one,
		isSpec: promoConfig.isSpec,
		last_minute_amount_hours: 0,
		last_minute_unit: 1,
		min_stay_through: 1,
		secretDeal: false,
		discount_type: promoConfig.price_change_type,
	};

	if (promoType === PromotionType.NightFlashSale) {
		rs.discount_amount = promoConfig.price_change;
		rs.numOfRoom = promoConfig.threshold_one;
	} else if (promoType === PromotionType.HourlySale) {
		rs.discount_amount = promoConfig.price_change;
		rs.additional_discount_amount = promoConfig.threshold_one;
	} else {
		const otaData = promoConfig[ota] || promoConfig.traveloka;
		rs.discount_amount = getDiscountByType(promoType, otaData, rs.discount_type);
	}

	return rs;
}

function genPromotionData({ name, rule, promoType, promoConfig, genius, other = null }) {
	const promoName = rule ? getName(name, rule, genius) : name;

	promoType = promoType || PROMOTION_MAP[rule.rule_type];

	const data = {
		...other,
		name: promoName,
		promoType,
		manual: false,
		active: true,
		genius,
		startDate: promoConfig.startDate,
		endDate: promoConfig.endDate,
		timeFormat: promoConfig.timeFormat,
		activeOTAs: promoConfig.activeOTAs,
		dayOfWeeks: promoConfig.dayOfWeeks,
		bookStartDate: promoConfig.bookStartDate,
		bookEndDate: promoConfig.bookEndDate,
		bookDayOfWeeks: promoConfig.bookDayOfWeeks,
		tags: [{ text: 'rule-set', color: '#4482ff' }],
	};

	data.config = promoConfig;

	data.activeOTAs.forEach(ota => {
		let configKey = ota;

		if (genius) {
			const geniusKey = `${ota}Genius`;
			if (promoConfig[geniusKey]) configKey = geniusKey;
		}

		const otaData = getOtaPromotionData(promoType, promoConfig, configKey);

		if (otaData.discount_amount <= 0 && ota !== OTAs.Go2joy) {
			delete data.data;
			data.activeOTAs = data.activeOTAs.filter(o => o !== ota);
		}

		const moduleAPI = ota.startsWith(LocalOTA) ? APIs[LocalOTA] : APIs[ota];
		if (moduleAPI && moduleAPI.generate) {
			data.data = moduleAPI.generate({ ...data, ...otaData });
		}

		if (!data.data) return;

		const real = getRealDiscountByType(promoType, promoConfig, configKey);

		data.discount = real;
	});

	return data;
}

function getName(name, rule, genius) {
	if (
		rule.rule_type === PromotionRuleSetType.HOURLY_SALE ||
		rule.rule_type === PromotionRuleSetType.NIGHT_FLASH_SALE
	) {
		return name;
	}

	const n = rule.threshold_one ? `(${rule.threshold_one}d)` : '';
	const type = genius ? '-G' : '-B';
	const smart = rule.smart ? `-SR${rule.price_change}%` : '';
	return `${name}-${PROMOTION_NAME[rule.promoType]}${n}${smart}${type}`;
}

function addGeniusPromotion({ activeOTAs, name, airbnb, otherConfig, rule, promotions, basic, lastMinute, earlyBird }) {
	if (rule.rate && (!OTAHasGeniusPromotion.includes(rule.rate.otaName) || !rule.rate.genius)) {
		return;
	}

	activeOTAs.forEach(otaName => {
		if (!OTAHasGeniusPromotion.includes(otaName)) return;
		if (rule.rate && rule.rate.otaName !== otaName) return;

		const promoConfig = calcPromotionConfig(
			{
				basic,
				lastMinute,
				earlyBird,
			},
			{
				...otherConfig,
				...rule,
				activeOTAs: [otaName],
			}
		);
		const promo = genPromotionData({ name, rule, promoConfig, genius: true });
		promo.airbnb = airbnb;
		promo.genius = true;

		promotions.push({ rule, promo, genius: true });
	});
}

function genAirbnbPromotions({ otherConfig, name, airbnb }) {
	const airbnbPromotions = [];

	airbnb.title = name;

	const basic = airbnb.pricing_rules.find(r => r.rule_type === PROMOTION_MAP_TYPE[PromotionType.Basic]);
	const lastMinute = airbnb.pricing_rules.find(r => r.rule_type === PROMOTION_MAP_TYPE[PromotionType.LastMinute]);
	const earlyBird = airbnb.pricing_rules.find(r => r.rule_type === PROMOTION_MAP_TYPE[PromotionType.EarlyBird]);

	const promoConfig = calcPromotionConfig(
		{
			basic: Math.abs(basic && basic.price_change),
			lastMinute: Math.abs(lastMinute && lastMinute.price_change),
			earlyBird: Math.abs(earlyBird && earlyBird.price_change),
		},
		{ ...otherConfig, activeOTAs: [OTAs.Airbnb] }
	);

	const pricing_rules = airbnb.pricing_rules.map(rule => {
		const price_change =
			(rule.rule_type === PROMOTION_MAP_TYPE[PromotionType.Basic]
				? promoConfig.airbnb.basicDeal
				: rule.rule_type === PROMOTION_MAP_TYPE[PromotionType.EarlyBird]
				? promoConfig.airbnb.earlyBird
				: rule.rule_type === PROMOTION_MAP_TYPE[PromotionType.LastMinute]
				? promoConfig.airbnb.lastMinute
				: Math.abs(rule.price_change) / 100) * 100;
		return {
			...rule,
			price_change: -Math.abs(Math.round(price_change)),
		};
	});

	const promo = genPromotionData({
		name: airbnb.title,
		promoType: PromotionType.RuleSet,
		promoConfig,
		other: {
			airbnb: { ...airbnb, pricing_rules },
		},
	});

	promo.genius = false;
	airbnbPromotions.push({ rule: pricing_rules, promo, genius: false });

	return airbnbPromotions;
}

function getKeyType(promoType) {
	if (promoType === PromotionType.LastMinute) return 'lastMinute';
	if (promoType === PromotionType.EarlyBird) return 'earlyBird';
	if (promoType === PromotionType.Basic) return 'basic';
	if (promoType === PromotionType.NightFlashSale) return 'flashSale';
	if (promoType === PromotionType.HourlySale) return 'hourlySale';
}

function genPromotions({ otherConfig, activeOTAs, name, rules, airbnb }) {
	const promos = _.map(rules, rule => {
		const promotions = [];

		if (!activeOTAs.includes(rule.rate.otaName)) {
			return promotions;
		}

		const keyType = getKeyType(rule.promoType);

		const geniusData = {
			activeOTAs,
			name,
			airbnb,
			otherConfig,
			rule,
			promotions,
		};
		const configs = {};

		if (keyType) {
			geniusData[keyType] = rule.price_change;
			configs[keyType] = rule.price_change;
		}

		const enabledOTAs = [rule.rate.otaName];

		if (rule.rate.genius) {
			addGeniusPromotion(geniusData);
			return promotions;
		}

		const promoConfig = calcPromotionConfig(configs, {
			...otherConfig,
			...rule,
			activeOTAs: enabledOTAs,
		});

		const promo = genPromotionData({ name, rule, promoConfig });
		promo.airbnb = airbnb;
		promo.genius = false;

		promotions.push({ rule, promo, genius: false });

		return promotions;
	});

	return _.flatten(promos);
}

function genPromotionsData({ group = {}, name, activeOTAs, airbnb, otherConfig }) {
	if (activeOTAs.length === 0) {
		return {};
	}

	const data = {
		otherConfig,
		activeOTAs,
		name,
		airbnb,
	};

	const basicDealPromotions = genPromotions({
		...data,
		rules: group[PromotionType.Basic],
	});

	const lastMinutePromotions = genPromotions({
		...data,
		rules: group[PromotionType.LastMinute],
	});

	const earlyBirdPromotions = genPromotions({
		...data,
		rules: group[PromotionType.EarlyBird],
	});

	const flashSalePromotions = genPromotions({
		...data,
		rules: group[PromotionType.NightFlashSale],
	});

	const hourlySalePromotions = genPromotions({
		...data,
		rules: group[PromotionType.HourlySale],
	});

	return {
		basicDealPromotions,
		earlyBirdPromotions,
		lastMinutePromotions,
		flashSalePromotions,
		hourlySalePromotions,
	};
}

function getAlgorithmForRule(rule) {
	if (rule.algorithm && algorithms.Algorithms[rule.algorithm]) {
		return algorithms.Algorithms[rule.algorithm];
	}

	if (rule.threshold_one === 1 && rule.rule_type === PROMOTION_MAP_TYPE[PromotionType.EarlyBird]) {
		return algorithms.Algorithms.lastMinuteOneDay;
	}

	return null;
}

async function calcRules({ blockId, fromDate, toDate, rateData, smartRules, hour }) {
	let rooms = [];
	let availableRooms = [];

	if (smartRules.some(rule => rule.smart && rule.algorithm)) {
		rooms = await models.Room.find({
			blockId,
			virtual: false,
		})
			.select('_id')
			.then(rs => rs.map(r => r._id));

		availableRooms = await models.BlockScheduler.findAvailableRooms(rooms, blockId, fromDate, toDate);
	}

	const newRules = await rateData.syncMap(rate => {
		return smartRules.syncMap(async sRule => {
			if (!sRule.smart) {
				return { ...rate, ...sRule, blockId, smart: false };
			}

			if (!sRule.algorithm || availableRooms.length === 0) {
				return null;
			}

			try {
				const totalRooms = rooms.length;
				const price_change = await sRule.algorithm.exec({
					hour,
					total_room: totalRooms,
					available_room: availableRooms.length,
					minimum_promotion: sRule.minDiscount / 100,
					maximum_promotion: sRule.maxDiscount / 100,
				});

				return {
					...rate,
					...sRule,
					price_change,
					blockId,
					hour,
					totalRooms,
					availableRooms: availableRooms.length,
				};
			} catch (err) {
				logger.error('TCL: calcRules -> err', err);
				return null;
			}
		});
	});

	return _.flattenDeep(newRules).filter(r => r);
}

async function calcSmartRules(rules, blockId, roomTypeIds, ratePlanIds, otaNames) {
	if (rules.length === 0) return [];

	const smartRules = rules.map(rule => ({
		...rule,
		algorithm: getAlgorithmForRule(rule),
		calcByRoomType: false,
	}));

	const filter = {
		blockId,
		OTAs: {
			$elemMatch: {
				active: true,
				otaName: { $in: otaNames },
				'rates.ratePlanId': { $in: ratePlanIds },
			},
		},
	};
	if (roomTypeIds && roomTypeIds.length) {
		filter.roomTypeId = { $in: roomTypeIds };
	}

	const listings = await models.Listing.aggregate()
		.match(filter)
		.unwind('$OTAs')
		.match({
			'OTAs.active': true,
			'OTAs.otaName': { $in: otaNames },
			'OTAs.rates.ratePlanId': { $in: ratePlanIds },
		})
		.unwind('$OTAs.rates')
		.match({
			'OTAs.rates.ratePlanId': { $in: ratePlanIds },
		})
		.project({
			blockId: 1,
			otaName: '$OTAs.otaName',
			account: '$OTAs.account',
			otaListingId: '$OTAs.otaListingId',
			ratePlanId: '$OTAs.rates.ratePlanId',
			genius: '$OTAs.genius',
		});

	let rateData = await listings.asyncMap(async listing => {
		const propertyId =
			listing.otaName === OTAs.Agoda
				? listing.otaListingId.split(',')[0]
				: await models.Block.getPropertyIdOfABlock(listing.blockId, listing.otaName, listing.account);

		return { rate: listing, propertyId };
	});

	rateData = _.chain(rateData)
		.groupBy(v => `${v.rate.otaName}|${v.rate.account || ''}|${v.rate.genius || false}|${v.propertyId || ''}`)
		.values()
		.map(arr => ({
			...arr[0],
			ratePlanIds: _.uniq(_.compact(arr.map(r => r.rate.ratePlanId))),
			roomType: null,
		}))
		.value();

	const fromDate = moment().startOf('days').add(7, 'hours').toDate();
	const toDate = moment(fromDate).add(1, 'days').toDate();
	const hour = moment().get('hours');

	return calcRules({
		blockId,
		fromDate,
		toDate,
		rateData,
		smartRules,
		hour,
	});
}

function mapAirbnbSmartPromotions({ rules, airbnb, pricingRules, name, otherConfig }) {
	const airbnbPromotions = _.chain(rules)
		.filter(r => _.get(r, 'rate.otaName') === OTAs.Airbnb)
		.groupBy(a => a.rate.account)
		.values()
		.map(rr => {
			const pricing_rules = _.uniqBy(
				[...rr, ...pricingRules]
					.filter(
						rule =>
							rule.rule_type !== PROMOTION_MAP_TYPE[PromotionType.NightFlashSale] &&
							rule.rule_type !== PROMOTION_MAP_TYPE[PromotionType.HourlySale]
					)
					.map(rule =>
						_.pick(rule, [
							'rule_type',
							'price_change',
							'price_change_type',
							'threshold_one',
							'threshold_two',
							'threshold_three',
						])
					),
				r => r.rule_type + r.threshold_one
			);

			const airbnbPromos = genAirbnbPromotions({
				name: `${name} Smart(${rr[0].rate.account})`,
				airbnb: { ...airbnb, pricing_rules },
				otherConfig,
			});

			const ratePlanIds = _.uniq(_.flatten(_.map(rr, 'ratePlanIds')));

			return _.map(airbnbPromos, promo => ({
				...promo,
				rule: {
					ratePlanIds,
					blockId: rr[0].blockId,
					rate: {
						otaName: rr[0].rate.otaName,
						account: rr[0].rate.account,
					},
				},
			}));
		})
		.flatten()
		.value();

	return airbnbPromotions;
}

function isMatchRule(pricingRule, currentRule) {
	const singleRules = [
		PromotionRuleSetType.SEASONAL_ADJUSTMENT,
		PromotionRuleSetType.NIGHT_FLASH_SALE,
		PromotionRuleSetType.HOURLY_SALE,
	];

	return (
		pricingRule.rule_type === currentRule.rule_type &&
		(!pricingRule.threshold_one ||
			pricingRule.threshold_one === currentRule.threshold_one ||
			singleRules.includes(pricingRule.rule_type))
	);
}

async function getActiveRules({ ruleSet, ruleSetBlock }) {
	const activeRules = [];

	if (ruleSetBlock.ruleBlockType === PromotionRuleSetBlockType.Timer) {
		ruleSetBlock.activeRules.forEach(activeRule => {
			if (!activeRule.otas || !activeRule.otas.length) return;

			const currentRules = ruleSetBlock.currentRules.filter(cr => cr.rule_type === activeRule.ruleType);
			if (currentRules.length) {
				const pricingRules = [];

				currentRules.forEach(currentRule => {
					const defaultRule = ruleSet.airbnb.pricing_rules.find(pricingRule =>
						isMatchRule(pricingRule, currentRule)
					);
					if (defaultRule) {
						pricingRules.push({
							...defaultRule,
							...currentRule,
						});
					}
				});

				if (pricingRules.length) {
					activeRules.push({
						otas: activeRule.otas,
						pricingRules,
					});
				}
			}
		});

		return activeRules;
	}

	if (ruleSetBlock.ruleBlockType === PromotionRuleSetBlockType.Dynamic) {
		const autos = await models.PromotionAuto.find({
			promotionRulesetBlockId: ruleSetBlock._id,
			active: true,
			deleted: false,
			execType: PromotionExecType.ValueChange,
		}).lean();

		ruleSetBlock.activeRules.forEach(activeRule => {
			if (!activeRule.otas || !activeRule.otas.length) return;

			const pricingRules = _.cloneDeep(
				ruleSet.airbnb.pricing_rules.filter(pricingRule => pricingRule.rule_type === activeRule.ruleType)
			);

			if (pricingRules.length) {
				const newRules = pricingRules
					.map(pricingRule => {
						let autoRules = ruleSetBlock.currentRules.filter(currentRule =>
							isMatchRule(pricingRule, currentRule)
						);

						if (autoRules.some(r => r.autoState === PromotionExecType.OnOff)) {
							return;
						}

						if (autoRules.some(r => r.autoState === PromotionExecType.Reset)) {
							return pricingRule;
						}

						let newDiscount = Math.abs(pricingRule.price_change);

						const autoRuleSet = _.findLast(autoRules, r => r.autoState === PromotionExecType.ValueSet);

						if (autoRuleSet) {
							newDiscount = autoRuleSet.price_change;
						} else {
							autoRules = autoRules.filter(r => r.autoState === PromotionExecType.ValueChange);

							newDiscount += _.sumBy(autoRules, r => r.price_change || 0) || 0;

							const matchAutos = autos.filter(auto =>
								auto.promotionRuleTypes.some(ruleType => isMatchRule(pricingRule, ruleType))
							);

							if (matchAutos.length) {
								const { minValue } = _.maxBy(matchAutos, 'minValue');
								const { maxValue } = _.minBy(matchAutos, 'maxValue');

								if (_.isNumber(minValue)) {
									newDiscount = Math.max(newDiscount, minValue);
								}
								if (_.isNumber(maxValue)) {
									newDiscount = Math.min(newDiscount, maxValue);
								}
							}
						}

						return {
							...pricingRule,
							price_change: -newDiscount,
						};
					})
					.filter(r => r);

				if (newRules.length) {
					activeRules.push({
						otas: activeRule.otas,
						pricingRules: newRules,
					});
				}
			}
		});

		return activeRules;
	}

	ruleSetBlock.activeRules.forEach(activeRule => {
		if (!activeRule.otas || !activeRule.otas.length) return;

		const pricingRules = ruleSet.airbnb.pricing_rules.filter(
			pricingRule => pricingRule.rule_type === activeRule.ruleType
		);
		if (pricingRules.length) {
			activeRules.push({
				otas: activeRule.otas,
				pricingRules,
			});
		}
	});

	return activeRules;
}

async function generateRuleSetBlockPromotions({ ruleSet, ruleSetBlock }) {
	ruleSet = ruleSet.toJSON();

	const activeRules = await getActiveRules({
		ruleSet,
		ruleSetBlock,
	});

	if (!activeRules.length) return [];

	const rateChannels = await models.PromotionRateChannel.find({ blockId: ruleSetBlock.blockId }).lean();

	const { _id: rulesetId, airbnb, startDate, endDate, name, ratio } = ruleSet;

	const promotions = await activeRules.asyncMap(async activeRule => {
		const { pricingRules, otas } = activeRule;

		const srules = await calcSmartRules(
			pricingRules,
			ruleSetBlock.blockId,
			ruleSetBlock.roomTypeIds,
			ruleSetBlock.ratePlanIds,
			otas
		);

		const enabledOTAs = otas.filterNotIn([OTAs.Airbnb]);

		const otherConfig = {
			startDate,
			endDate,
			ratio,
			dayOfWeeks: ruleSet.dayOfWeeks || '1111111',
			bookStartDate: ruleSet.bookStartDate || startDate,
			bookEndDate: ruleSet.bookEndDate || endDate,
			bookDayOfWeeks: ruleSet.bookDayOfWeeks || '1111111',
			activeOTAs: enabledOTAs,
			rateChannels: _.keyBy(rateChannels, 'otaName'),
		};

		airbnb.pricing_rules = airbnb.pricing_rules.filter(rule => !rule.smart);

		const rules = _.compact(srules).map(rule => ({
			...rule,
			price_change: Math.abs(rule.price_change),
			promoType: PROMOTION_MAP[rule.rule_type],
		}));

		const airbnbPromotions = otas.includes(OTAs.Airbnb)
			? mapAirbnbSmartPromotions({
					rules,
					airbnb,
					pricingRules: pricingRules.filter(rule => !rule.smart),
					name,
					otherConfig,
			  })
			: [];

		const group = _(rules)
			.filter(r => _.get(r, 'rate.otaName') !== OTAs.Airbnb)
			.groupBy(a => a.promoType)
			.value();

		const {
			basicDealPromotions,
			lastMinutePromotions,
			earlyBirdPromotions,
			flashSalePromotions,
			hourlySalePromotions,
		} = genPromotionsData({
			group,
			name,
			airbnb,
			otherConfig,
			rulesetId,
			activeOTAs: enabledOTAs,
		});

		return [
			..._.map(airbnbPromotions, data => mapType(data, PromotionType.RuleSet, ruleSetBlock)),
			..._.map(basicDealPromotions, data => mapType(data, PromotionType.Basic, ruleSetBlock)),
			..._.map(lastMinutePromotions, data => mapType(data, PromotionType.LastMinute, ruleSetBlock)),
			..._.map(earlyBirdPromotions, data => mapType(data, PromotionType.EarlyBird, ruleSetBlock)),
			..._.map(flashSalePromotions, data => mapType(data, PromotionType.NightFlashSale, ruleSetBlock)),
			..._.map(hourlySalePromotions, data => mapType(data, PromotionType.HourlySale, ruleSetBlock)),
		];
	});

	return _.flatten(promotions);
}

async function genPromotionsDataFromRuleSet(ruleSet) {
	if (!ruleSet || !ruleSet._id) return [];

	const rulesetBlocks = await models.PromotionRuleSetBlocks.find({
		rulesetId: ruleSet._id,
		active: true,
	}).lean();

	const rulesetPromotions = await rulesetBlocks.syncMap(ruleSetBlock =>
		generateRuleSetBlockPromotions({
			ruleSetBlock,
			ruleSet,
		})
	);

	return _.flatten(rulesetPromotions);
}

function mapType(data, type, rulesetBlock) {
	return {
		promotion: data.promo,
		otaName: data.promo.activeOTAs[0],
		type,
		smart: !!data.rule.smart,
		genius: data.genius,
		ratePlanIds: data.rule.ratePlanIds,
		blockId: data.rule.blockId,
		propertyId: data.rule.propertyId,
		account: data.rule.rate.account,
		rulesetBlockId: rulesetBlock._id,
	};
}

module.exports = {
	genPromotionsDataFromRuleSet,
};
