/* eslint-disable no-lonely-if */
const _ = require('lodash');
const moment = require('moment');

const { Services, REPORT_TYPE, GUARANTEE_REV_TYPE, EXTRA_FEE } = require('@utils/const');
const { getPayType, isHostCollect, hasTax } = require('./utils');
const { CASH_METHOD, PAY_METHOD, OTA_HAVE_VAT } = require('./const');
const textContent = require('./reportHost.json');

const ROMAN_INDEX = 'ROMAN_INDEX';
const OVERVIEW_KEYS_DEFAULT = {
	sonata: [
		{ key: 'revenue', title: '' },
		{ key: 'revenueForTax', title: '' },
		{ key: 'realRevenue', title: '' },
		{ key: 'czDebt', title: '' },
		{ key: 'fees', title: '' },
		{ key: 'NETRevenue', title: '' },
		{ key: 'costRate', title: '' },
		{ key: 'profit', title: '' },
		{ key: 'payment', title: '' },
	],
	default: [
		{ key: 'revenue', title: '' },
		{ key: 'revenueForTax', title: '' },
		{ key: 'OTAFee', title: '' },
		{ key: 'realRevenue', title: '' },
		{ key: 'NETRevenue', title: '' },
		{ key: 'manageFee', title: '' },
		{ key: 'income', title: '' },
		{ key: 'prepaid', title: '' },
		{ key: 'otherFee', title: '' },
		{ key: 'finalRevenue', title: '' },
	],
};

function getRevenues({ revenue, config, language, dateTxt }) {
	// const isSonataReportType = config.reportType === REPORT_TYPE.SONATA;

	const keyServices = [EXTRA_FEE.ELECTRIC_FEE, EXTRA_FEE.WATER_FEE];
	const _allRes = [...revenue.revenues.data, ...revenue.otherRevenues.data];

	// const allRes = isSonataReportType ? _allRes.filter(i => i.type !== 'vatFee') : _allRes;
	const allRes = _allRes;

	const shortTerms = allRes.filter(i => i.serviceType !== Services.Month);
	const shortTermsTM = shortTerms.filter(i => CASH_METHOD.includes(i.payType));
	const shortTermsNH = shortTerms.filter(i => !CASH_METHOD.includes(i.payType));

	const longTerms = allRes.filter(i => i.serviceType === Services.Month);
	const longTermsWithoutServices = longTerms.filter(i => !keyServices.includes(i.type));
	const longTermsTM = longTermsWithoutServices.filter(i => CASH_METHOD.includes(i.payType));
	const longTermsNH = longTermsWithoutServices.filter(i => !CASH_METHOD.includes(i.payType));

	const longTermsWithServices = longTerms.filter(i => keyServices.includes(i.type));
	const servicesTM = longTermsWithServices.filter(i => CASH_METHOD.includes(i.payType));
	const servicesNH = longTermsWithServices.filter(i => !CASH_METHOD.includes(i.payType));

	const stc1 = _.sumBy(shortTermsNH, 'vnd') || 0;
	const stc2 = _.sumBy(shortTermsTM, 'vnd') || 0;

	const ltc1 = _.sumBy(longTermsNH, 'vnd') || 0;
	const ltc2 = _.sumBy(longTermsTM, 'vnd') || 0;
	const svc1 = _.sumBy(servicesNH, 'vnd') || 0;
	const svc2 = _.sumBy(servicesTM, 'vnd') || 0;

	if (config.reportType === REPORT_TYPE.SONATA) {
		return {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.revenue.name[language]}`.toUpperCase(),
			total: revenue.total,
			data: {
				shortTerm: {
					name: `${textContent.UTILS.shortTermRevenue[language]} ${dateTxt}`,
					total: stc1 + stc2,
				},
				longTerm: {
					name: `${textContent.UTILS.longTermRevenue[language]} ${dateTxt}`,
					total: ltc1 + ltc2,
				},
				service: {
					name: `${textContent.UTILS.recievables[language]} ${dateTxt}`,
					total: svc1 + svc2,
				},
				groundRent: {
					name: `${textContent.UTILS.groundRent[language]} ${dateTxt}`,
					total: _.get(revenue, 'groundRentRevenues.total', 0),
				},
				otherFee: {
					name: `${textContent.UTILS.otherRevenue[language]} ${dateTxt}`,
					total: _.get(revenue, 'other.total', 0),
				},
			},
		};
	}

	return {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.revenue.name[language]}`.toUpperCase(),
		c1: `${textContent.UTILS.bankTransfer[language]}`.toUpperCase(),
		c2: `${textContent.UTILS.cash[language]}`.toUpperCase(),
		total: revenue.total,
		data: {
			shortTerm: {
				name: `${textContent.UTILS.shortTermRevenue[language]} ${dateTxt}`,
				c1: stc1,
				c2: stc2,
				total: stc1 + stc2,
			},
			longTerm: {
				name: `${textContent.UTILS.longTermRevenue[language]} ${dateTxt}`,
				c1: ltc1,
				c2: ltc2,
				total: ltc1 + ltc2,
			},
			service: {
				name: `${textContent.UTILS.longTermRecievables[language]} ${dateTxt}`,
				c1: svc1,
				c2: svc2,
				total: svc1 + svc2,
			},
		},
	};
}

function getRealRevenueAndCzDebt({ revenue, dateTxt, language, config }) {
	const allRes = [
		..._.get(revenue, 'revenues.data', []),
		..._.get(revenue, 'otherRevenues.data', []),
		..._.get(revenue, 'groundRentRevenues.data', []),
		..._.get(revenue, 'other.data', []),
	];
	const ownerTotal = _.sumBy(
		allRes.filter(res => isHostCollect(res.payType, config)),
		'vnd'
	);

	const czTotal = revenue.total - ownerTotal;

	const uncollectedDebt = _.sumBy(
		allRes.filter(i =>
			_.includes([PAY_METHOD.OTA, PAY_METHOD.MOMO, PAY_METHOD.VNPAY, PAY_METHOD.APPOTAPAY], i.payType)
		),
		'vnd'
	);
	const receivable = czTotal - uncollectedDebt;

	const realRevenue = {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.realRevenue.name[language]}`.toUpperCase(),
		total: ownerTotal + czTotal,
		data: {
			owner: {
				name: `${textContent.UTILS.ownerRevenue[language]} ${dateTxt}`,
				total: ownerTotal,
			},
			tb: {
				name: `${textContent.UTILS.tbRevenue[language]} ${dateTxt}`,
				total: czTotal,
			},
		},
	};

	const czDebt = {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.tbDebt.name[language]}`.toUpperCase(),
		total: receivable + uncollectedDebt,
		data: {
			receivable: {
				name: `${textContent.UTILS.receivable[language]}`,
				total: receivable,
			},
			uncollectedDebt: {
				name: `${textContent.UTILS.uncollectedDebt[language]}`,
				total: uncollectedDebt,
			},
		},
	};

	return { realRevenue, czDebt };
}

function getOTAFee({ revenue, language, hasTax: hTax, dateTxt }) {
	const OTA_VAT =
		_.sumBy(
			revenue.revenues.data.filter(i => OTA_HAVE_VAT.includes(i.otaName)),
			'OTAFee'
		) || 0;
	const cardVAT = revenue.revenues.totalTransactionFee + revenue.otherRevenues.totalTransactionFee;
	const noOTAVAT = revenue.revenues.totalOTAFee - OTA_VAT;

	const OTAFee = {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.OTAFee.name[language]}`.toUpperCase(),
		c1: `${textContent.OVERVIEW.OTAFee.c1[language]}`.toUpperCase(),
		c2: `${textContent.OVERVIEW.OTAFee.c2[language]}`.toUpperCase(),
		total: OTA_VAT + cardVAT + noOTAVAT,
		data: {
			fee: {
				name: `${textContent.OVERVIEW.OTAFee.fees[language]} ${dateTxt}`,
				c1: OTA_VAT + cardVAT,
				c2: noOTAVAT,
				total: OTA_VAT + cardVAT + noOTAVAT,
			},
		},
	};

	if (hTax) {
		const tax = revenue.totalTax;
		OTAFee.data.tax = {
			name: `${textContent.UTILS.incomeTax[language]}`,
			c1: tax,
			c2: 0,
			total: tax,
		};
		OTAFee.total += tax;
	}

	return OTAFee;
}

function getGroupKey(feeGroup) {
	return _.chain(feeGroup).get('name.en').lowerCase().split(' ').join('_').value();
}

function getPrepaid({ feeGroupReport, fee, revenue, OTATaxFee, OTAFeeTotal, language, config }) {
	const prepaidData = {};
	const isSonataReportType = config.reportType === REPORT_TYPE.SONATA;

	_.forEach(feeGroupReport.groups, fg => {
		const categories = _.map(fg.categories, c => c.toString());

		// eslint-disable-next-line array-callback-return
		const groups = fee.data.filter(i => {
			const isInclude = _.includes(categories, _.get(i, 'category._id', '').toString());
			if (feeGroupReport.isSplitDistribute && fg.calcDistribute !== true)
				return isInclude && i.distribute !== true;
			if (feeGroupReport.isSplitDistribute && fg.calcDistribute === true) return i.distribute === true;
			if (!feeGroupReport.isSplitDistribute) return isInclude;
		});
		if (fg.hiddenOnNull && _.isEmpty(groups)) return;

		const tm = groups.filter(i => CASH_METHOD.includes(i.payType));
		const totalTM = _.sumBy(tm, 'vnd') || 0;
		const total = _.sumBy(groups, 'vnd') || 0;
		const key = getGroupKey(fg);

		// cz thu
		const cz = _.sumBy(
			_.filter(groups, i => i.isInternal === true),
			'vnd'
		);

		prepaidData[key] = {
			name: _.get(fg, `name.${language}`),
			isOther: fg.isOther,
			cz,
			owner: total - cz,
			...(isSonataReportType ? undefined : { c1: total - totalTM, c2: totalTM }),
			total,
		};
	});

	const arr = _.values(prepaidData);

	let prepaid = {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.prepaid.name[language]}`.toUpperCase(),
		...(isSonataReportType
			? undefined
			: {
				c1: _.sumBy(arr, 'c1') || 0,
				c2: _.sumBy(arr, 'c2') || 0,
			}),
		total: _.sumBy(arr, 'total') || 0,
		data: prepaidData,
	};

	if (config.reportType === REPORT_TYPE.SONATA) {
		if (_.get(prepaid, 'data.short_term_sale.name') && _.get(prepaid, 'data.long_term_sale.name')) {
			const ltRes = revenue.revenues.data.filter(i => i.serviceType === Services.Month);
			const stRes = revenue.revenues.data.filter(i => i.serviceType !== Services.Month);

			// List Res tb thu
			// const allRes = [
			// 	..._.get(revenue, 'revenues.data', []),
			// 	..._.get(revenue, 'otherRevenues.data', []),
			// 	..._.get(revenue, 'other.data', []),
			// 	..._.get(revenue, 'groundRentRevenues.data', []),
			// ].filter(i => i.payType && !isHostCollect(i.payType));
			const allRes = [
				..._.get(revenue, 'revenues.data', []),
				..._.get(revenue, 'otherRevenues.data', []),
				..._.get(revenue, 'other.data', []),
				..._.get(revenue, 'groundRentRevenues.data', []),
			].filter(i =>
				i.feePaidBy ? i.feePaidBy !== GUARANTEE_REV_TYPE.HOST : i.payType && !isHostCollect(i.payType)
			);

			// short_term_sale
			prepaid.data.short_term_sale.total += _.sumBy(stRes, 'OTAFee') || 0;
			prepaid.data.short_term_sale.cz +=
				_.sumBy(
					stRes.filter(i => !_.get(config, ['OTAs', i.otaName, 'isOwnerCollect'])),
					'OTAFee'
				) || 0;

			prepaid.data.short_term_sale.owner = prepaid.data.short_term_sale.total - prepaid.data.short_term_sale.cz;

			// long_term_sale
			prepaid.data.long_term_sale.total += _.sumBy(ltRes, 'OTAFee') || 0;
			prepaid.data.long_term_sale.cz +=
				_.sumBy(
					ltRes.filter(i => i.payType && !isHostCollect(i.payType)),
					'OTAFee'
				) || 0;
			prepaid.data.long_term_sale.owner = prepaid.data.long_term_sale.total + prepaid.data.long_term_sale.cz;

			// Transaction
			prepaid.data.payment_cost.total += revenue.totalTransactionFee || 0;
			prepaid.data.payment_cost.cz += _.sumBy(allRes, i => i.transactionFee || 0) || 0;
			prepaid.data.payment_cost.owner = prepaid.data.payment_cost.total - prepaid.data.payment_cost.cz;

			if (config.hasTax) {
				const others = _.find(prepaid.data, { isOther: true });
				if (others) {
					others.total += OTATaxFee || 0;
					others.cz += OTATaxFee || 0;
				}
			}

			const cz = _.sumBy(_.toArray(prepaid.data), 'cz');
			prepaid = {
				name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.fee.name[language]}`.toUpperCase(),
				total: _.sumBy(_.values(prepaid.data), 'total'),
				cz,
				owner: OTAFeeTotal + prepaid.total - cz,
				data: {
					...prepaid.data,
				},
			};
		}
	}

	return prepaid;
}

function getNETRevenue({ revenue, prepaid, realRevenue, OTAFee, language, dateTxt, config }) {
	let NETRevenue;

	if (config.reportType === REPORT_TYPE.SONATA) {
		const revenueTotal = _.get(realRevenue, 'data.owner.total') + _.get(realRevenue, 'data.tb.total');
		const netRevenueTotal = revenueTotal - _.get(prepaid, 'total', 0) || 0;

		NETRevenue = {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.netProfit.name[language]}`.toUpperCase(),
			total: netRevenueTotal,
			data: {
				revenue: {
					name: `${textContent.OVERVIEW.netProfit.c1[language]}`,
					total: netRevenueTotal,
				},
			},
		};
	} else {
		const shortTerm = _.get(revenue, 'data.shortTerm.total', 0) - OTAFee.total;
		const longTerm = _.get(revenue, 'data.longTerm.total', 0);
		const service = _.get(revenue, 'data.service.total', 0);

		const stc1 =
			_.get(revenue, 'data.shortTerm.c1', 0) - _.get(OTAFee, 'data.fee.c1', 0) - _.get(OTAFee, 'data.tax.c1', 0);
		const stc2 =
			_.get(revenue, 'data.shortTerm.c2', 0) - _.get(OTAFee, 'data.fee.c2', 0) - _.get(OTAFee, 'data.tax.c2', 0);

		NETRevenue = {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.netRevenue.name[language]}`.toUpperCase(),
			c1: `${textContent.UTILS.bankTransfer[language]}`.toUpperCase(),
			c2: `${textContent.UTILS.cash[language]}`.toUpperCase(),
			total: shortTerm + longTerm + service,
			data: {
				shortTerm: {
					name: `${textContent.UTILS.shortTermNetRevenue[language]} ${dateTxt}`,
					c1: stc1,
					c2: stc2,
					total: shortTerm,
				},
				longTerm: {
					name: `${textContent.UTILS.longTermNetRevenue[language]} ${dateTxt}`,
					c1: revenue.data.longTerm.c1,
					c2: revenue.data.longTerm.c2,
					total: longTerm,
				},
				service: {
					name: `${textContent.UTILS.longTermRecievables[language]} ${dateTxt}`,
					c1: revenue.data.service.c1,
					c2: revenue.data.service.c2,
					total: service,
				},
			},
		};
	}

	return NETRevenue;
}

function getManageFee({ config, NETRevenue, language }) {
	const cShortTerm = _.get(config, 'shortTerm') || 0;
	const cLongTerm = _.get(config, 'longTerm') || 0;

	const shortTerm = _.round(cShortTerm * NETRevenue.data.shortTerm.total);
	const longTerm = _.round(cLongTerm * NETRevenue.data.longTerm.total);

	return {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.manageFee.name[language]}`.toUpperCase(),
		c1: '',
		c2: '',
		total: shortTerm + longTerm,
		data: {
			shortTerm: {
				name: `${textContent.OVERVIEW.manageFee.data[language]} (${cShortTerm * 100}% ${textContent.UTILS.shortTermNetRevenue[language]
					})`,
				c1: '',
				c2: '',
				total: shortTerm,
			},
			longTerm: {
				name: `${textContent.OVERVIEW.manageFee.data[language]} (${cLongTerm * 100}% ${textContent.UTILS.longTermNetRevenue[language]
					})`,
				c1: '',
				c2: '',
				total: longTerm,
			},
		},
	};
}

function getProfit({ prepaid, realRevenue, config, dateTxt, language, costRate }) {
	const expenseAmount = prepaid.total || 0;
	const revenueTotal = _.get(realRevenue, 'data.tb.total', 0) + _.get(realRevenue, 'data.owner.total', 0);
	const netRev = revenueTotal - expenseAmount;

	let czProfit;
	let ownerProfit;

	const profit =
		_.find(config.profits, c => (!c.min || c.min <= netRev) && (!c.max || c.max > netRev)) ||
		_.head(config.profits);

	if (profit && profit.guaranteeRev === GUARANTEE_REV_TYPE.CZ) {
		czProfit = netRev - profit.max;
		ownerProfit = 0;
	} else if (profit && profit.guaranteeRev === GUARANTEE_REV_TYPE.SHARE) {
		const income = netRev - profit.min;
		const rate = costRate ? costRate.total / 100 : profit.czRate;

		czProfit = _.round(income * rate);
		ownerProfit = income - czProfit;
	} else {
		czProfit = 0;
		ownerProfit = 0;
	}

	return {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.shareProfit.name[language]}`.toUpperCase(),
		c1: '',
		c2: '',
		total: czProfit + ownerProfit,
		data: {
			tb: {
				name: `${textContent.OVERVIEW.shareProfit.c1[language]} ${dateTxt}`,
				c1: '',
				c2: '',
				total: czProfit,
			},
			owner: {
				name: `${textContent.OVERVIEW.shareProfit.c2[language]} ${dateTxt}`,
				c1: '',
				c2: '',
				total: ownerProfit,
			},
		},
	};
}

function getPayment({ prepaid, realRevenue, profit, dateTxt, costRate, language, config }) {
	const czAmount = _.round(
		_.get(profit, 'data.tb.total', 0) +
		_.get(prepaid, 'cz', 0) -
		(config.ignoreDebtPayment ? 0 : _.get(realRevenue, 'data.tb.total', 0))
	);

	const data = {};

	if (costRate) {
		data.tbEmployeeExpenses = {
			name: `${textContent.OVERVIEW.payment.c3[language]} ${dateTxt}`,
			c1: '',
			c2: '',
			total: costRate.totalCost,
		};
	}

	data.tb = {
		name: `${textContent.OVERVIEW.payment.c1[language]} ${dateTxt}`,
		c1: '',
		c2: '',
		total: czAmount,
	};

	return {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.payment.name[language]}`.toUpperCase(),
		c1: '',
		c2: '',
		// total: czAmount,
		data,
	};
}

function getCostRate({ prepaid, dateTxt, language, feeGroupReport }) {
	const costs = feeGroupReport.groups
		.filter(g => g.costRate)
		.map(g => _.get(prepaid.data[getGroupKey(g)], 'total', 0) * g.costRate);

	if (!costs.length) return;

	const totalCost = _.sum(costs);
	const total = _.round((totalCost / prepaid.total) * 100, 2);

	return {
		name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.czCostRate.name[language]} (%)`.toUpperCase(),
		c1: '',
		c2: '',
		total,
		totalCost,
		data: {
			tb: {
				name: `${textContent.OVERVIEW.czCostRate.name[language]} ${dateTxt}`,
				c1: '',
				c2: '',
				total,
			},
		},
	};
}

function generate(data, config) {
	const romanIndexes = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
	const reportType = config.reportType === REPORT_TYPE.SONATA ? REPORT_TYPE.SONATA : 'default';
	const overviewKeys = _.get(config.overviewKeys, 'length') ? config.overviewKeys : OVERVIEW_KEYS_DEFAULT[reportType];

	const rs = {};
	overviewKeys.forEach(({ key }) => {
		const _key = key === 'fees' ? 'prepaid' : key;
		rs[key] = _.get(data, _key);
	});

	let currentRIndex = 0;
	const getRomanIndex = () => {
		const txt = romanIndexes[currentRIndex];
		currentRIndex++;
		return txt;
	};

	if (config.reportType === REPORT_TYPE.SONATA) {
		_.forEach(rs, (value, key) => {
			if (!_.isEmpty(value)) {
				const index = getRomanIndex();
				const name = _.replace(_.get(value, 'name'), ROMAN_INDEX, index);
				_.set(rs, `${key}.name`, name);
			}
		});
	} else {
		_.forEach(rs, (value, key) => {
			if (key === 'prepaid') currentRIndex = 0;
			if (!_.isEmpty(value)) {
				const index = getRomanIndex();
				const name = _.replace(_.get(value, 'name'), ROMAN_INDEX, index);
				_.set(rs, `${key}.name`, name);
			}
		});
	}

	return rs;
}

function getOverview({ revenue, hostRevenues, fee, from, to, config, feeGroupReport, language }) {
	const data = {};
	const textFrom = moment(from).format('DD/MM');
	const textTo = moment(to).format('DD/MM/YYYY');
	const labelFrom = textContent.UTILS.from[language];
	const labelTo = textContent.UTILS.to[language];
	const dateTxt = `${labelFrom} ${textFrom} ${labelTo} ${textTo}`;
	const isSonataReportType = config.reportType === REPORT_TYPE.SONATA;

	// Revenue
	data.revenue = getRevenues({
		revenue,
		config,
		language,
		dateTxt,
	});

	// OTAFee
	data.OTAFee = getOTAFee({
		revenue,
		language,
		hasTax: _.get(config, 'hasTax', false),
		dateTxt,
		config,
	});

	// Prepaid - thu chi ho/ ds chi phi (sonata)
	data.prepaid = getPrepaid({
		feeGroupReport,
		fee,
		revenue,
		OTAFeeTotal: _.get(data, 'OTAFee.total', 0),
		OTATaxFee: _.get(data, 'OTAFee.data.tax.total', 0),
		language,
		config,
	});

	// Other Fee
	{
		let childData = {};
		let c1 = 0;
		let c2 = 0;

		hostRevenues.forEach((payout, index) => {
			childData[index] = {
				name: payout.description,
				c1: 0,
				c2: 0,
			};

			if (hasTax(getPayType(null, payout))) {
				childData[index].c1 = payout.currencyAmount.exchangedAmount;
				c1 += childData[index].c1;
			} else {
				childData[index].c2 = payout.currencyAmount.exchangedAmount;
				c2 += childData[index].c2;
			}
			childData[index].total = childData[index].c1 + childData[index].c2;
		});

		data.otherFee = {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.otherFee.name[language]}`.toUpperCase(),
			c1,
			c2,
			total: c1 + c2,
			data: childData,
		};
	}

	// has TAX
	if (config && config.hasTax) {
		const stc1 = revenue.totalRevenueForTax;
		data.revenueForTax = {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.revenueForTax.name[language]}`.toUpperCase(),
			c1: '',
			c2: '',
			total: stc1,
			data: {
				revenueForTax: {
					name: `${textContent.OVERVIEW.revenueForTax.name[language]}`,
					...(isSonataReportType ? undefined : { c1: stc1, c2: 0 }),
					total: stc1,
				},
			},
		};
	}

	// Real revenue/thuc trang thu va Debt/cong no tb
	const { realRevenue, czDebt } = getRealRevenueAndCzDebt({
		revenue,
		dateTxt,
		language,
		config,
	});
	data.czDebt = czDebt; // Cong no tb
	data.realRevenue = realRevenue; // Thuc trang thu

	if (isSonataReportType) {
		// cost rate
		const costRate = getCostRate({
			prepaid: data.prepaid,
			dateTxt,
			language,
			feeGroupReport,
		});
		if (costRate) {
			data.costRate = costRate;
		}

		// Profit - Loi nhuan duoc chia
		data.profit = getProfit({
			prepaid: data.prepaid,
			OTAFee: data.OTAFee,
			realRevenue: data.realRevenue,
			costRate: data.costRate,
			config,
			dateTxt,
			language,
		});

		// Payment
		data.payment = getPayment({
			prepaid: data.prepaid,
			realRevenue: data.realRevenue,
			profit: data.profit,
			costRate: data.costRate,
			fee,
			dateTxt,
			language,
			config,
		});
	}

	// NETRevenue - Loi nhuan chung
	data.NETRevenue = getNETRevenue({
		revenue: data.revenue,
		OTAFee: data.OTAFee,
		prepaid: data.prepaid,
		realRevenue: data.realRevenue,
		language,
		dateTxt,
		config,
	});

	if (!isSonataReportType) {
		// Manage Fee
		data.manageFee = getManageFee({ config, NETRevenue: data.NETRevenue, language });

		// Income
		data.income = {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.income.name[language]}`.toUpperCase(),
			c1: '',
			c2: '',
			total: data.NETRevenue.total - _.get(data, 'manageFee.total', 0),
			data: {
				income: {
					name: `${textContent.OVERVIEW.income.name[language]} ${labelFrom} ${textFrom} ${labelTo} ${textTo}`,
					c1: '',
					c2: '',
					total: data.NETRevenue.total - _.get(data, 'manageFee.total', 0),
				},
			},
		};

		/*
		Final Revenue
			- CT1:
				c1: Doanh thu báo cáo thuế - thuế TNCN
				c2: Thu nhập thực chủ nhà - thu chi hộ/trả trước của tb - c1 + phần thu khác chủ nhà
			- CT2:
				c1: Thu nhập thực chủ nhà - thu chi hộ/trả trước của tb + phần thu khác chủ nhà
				c2: 0
		*/
		const { shortTerm, longTerm, service } = data.NETRevenue.data;
		const cashRevenue = shortTerm.c2 + longTerm.c2 + service.c2;
		const prepaid = data.prepaid.total;
		const revenueForTax = revenue.revenues.totalRevenueForTax;
		const fromOwner = data.realRevenue.data.owner.total;

		const income = data.income.total - fromOwner;
		const tax = _.get(data, 'OTAFee.data.tax.total', 0);

		let c1 = 0;
		let c2 = 0;
		let total = 0;
		let calcType = '';
		if (config.hasTax) {
			if (prepaid > cashRevenue) {
				calcType = 'CT2';
			} else {
				calcType = income - prepaid > revenueForTax ? 'CT1' : 'CT2';
			}
		} else {
			calcType = 'CT2';
		}

		if (calcType === 'CT1') {
			c1 = revenueForTax - tax;
			c2 = income - prepaid - c1 + data.otherFee.total;
			total = c1 + c2;
		} else {
			c1 = income - prepaid + data.otherFee.total;
			c2 = 0;
			total = c1 + c2;
		}

		data.finalRevenue = {
			name: `${ROMAN_INDEX}. ${textContent.OVERVIEW.finalRevenue.name[language]}`.toUpperCase(),
			c1: `${textContent.OVERVIEW.finalRevenue.c1[language]}`.toUpperCase(),
			c2: `${textContent.OVERVIEW.finalRevenue.c2[language]}`.toUpperCase(),
			total,
			data: {
				finalRevenue: {
					name: `${textContent.OVERVIEW.finalRevenue.name[language]} ${labelFrom} ${textFrom} ${labelTo} ${textTo}`,
					c1,
					c2,
					total,
				},
			},
		};
	}

	return generate(data, config);
}

module.exports = { getOverview };
