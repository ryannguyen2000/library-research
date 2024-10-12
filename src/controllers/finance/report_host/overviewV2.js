/* eslint-disable no-lonely-if */
const _ = require('lodash');
const moment = require('moment');

const { Services, EXTRA_FEE } = require('@utils/const');
const { hasTax, isHostCollect } = require('./utils');
const textContent = require('./reportHost.json');

function getGMV({ revenue, nameAffix, language, sharedOthers, totalSharedOther }) {
	const revenues = [
		..._.get(revenue, 'revenues.data', []),
		..._.get(revenue, 'otherRevenues.data', []),
		..._.get(revenue, 'groundRentRevenues.data', []),
		...sharedOthers,
	];

	const keyServices = [EXTRA_FEE.ELECTRIC_FEE, EXTRA_FEE.WATER_FEE];

	const shortTerms = revenues.filter(i => i.serviceType !== Services.Month);
	const totalShortTerm = _.sumBy(shortTerms, 'vnd') || 0;

	const longTerms = revenues.filter(i => i.serviceType === Services.Month);
	const longTermsWithoutServices = longTerms.filter(i => !keyServices.includes(i.type));
	const totalLongTerm = _.sumBy(longTermsWithoutServices, 'vnd') || 0;

	const longTermsWithServices = longTerms.filter(i => keyServices.includes(i.type));
	const totalService = _.sumBy(longTermsWithServices, 'vnd') || 0;

	const grv = _.get(revenue.groundRentRevenues, 'total', 0);

	return {
		key: 'gmv',
		total: revenue.total,
		transactionFees: {
			shortTerms: _.sumBy(shortTerms, 'transactionFee') || 0,
			longTerms: _.sumBy(longTerms, 'transactionFee') || 0,
		},
		data: _.compact([
			{
				key: 'shortTermRevenue',
				total: totalShortTerm,
				name: `${_.get(textContent.UTILS, ['shortTermRevenue', language])} ${nameAffix}`,
			},
			{
				key: 'longTermRevenue',
				total: totalLongTerm,
				name: `${_.get(textContent.UTILS, ['longTermRevenue', language])} ${nameAffix}`,
			},
			{
				key: 'longTermRecievables',
				total: totalService,
				name: `${_.get(textContent.UTILS, ['longTermRecievables', language])} ${nameAffix}`,
			},
			grv && {
				key: 'groundRent',
				total: grv,
			},
			totalSharedOther && {
				key: 'otherRevenue',
				total: totalSharedOther,
			},
		]),
	};
}

function getCommission({ revenue, realRevenue }) {
	const commissionAutoRedux = revenue.total - realRevenue.total;

	return {
		key: 'totalCommission',
		total: revenue.totalOTAFee,
		data: [
			{
				key: 'commissionAutoRedux',
				total: commissionAutoRedux,
				description:
					'(1) Các kênh qua áp dụng chính sách tự động cấn trừ: Agoda, Traveloka, Ctrip, Airbnb, Expedia thanh toán tại kênh',
			},
			{
				key: 'commissionNoAutoRedux',
				total: revenue.totalOTAFee - commissionAutoRedux,
				description:
					'(2) Các kênh phải thanh toán không qua hình thức cấn trừ: Booking, Go2joy, Expedia khách thanh toán tại khách sạn',
			},
		],
	};
}

function getRealRevenue({ revenue, sharedOthers }) {
	const revenues = [
		..._.get(revenue, 'revenues.data', []),
		..._.get(revenue, 'otherRevenues.data', []),
		..._.get(revenue, 'groundRentRevenues.data', []),
		...sharedOthers,
	];

	const revBankings = revenues.filter(r => hasTax(r.payType));
	// const revCashs = revenues.filter(r => !hasTax(r.payType));

	const totalRevBanking = _.sumBy(revBankings, 'vnd');
	// const totalRevCash = _.sumBy(revCashs, 'vnd');

	// const summer = r => (r.isReduxOTAFee && r.OTAFee) || 0;

	// const reduxBanking = _.sumBy(revBankings, summer) || 0;
	// const reduxCash = _.sumBy(revCashs, summer) || 0;

	const OTAFeeRedux = revenue.totalOTAFeeRedux;

	return {
		key: 'totalRealRevenue',
		total: revenue.total - OTAFeeRedux,
		description: '(3) %gmv% - %commissionAutoRedux%',
		data: [
			{
				key: 'realRevenueBanking',
				total: totalRevBanking - OTAFeeRedux,
			},
			{
				key: 'realRevenueCash',
				total: revenue.total - totalRevBanking,
			},
		],
	};
}

function getRealCollected({ revenue, realRevenue, config, totalFinalIncomeOther }) {
	const revenues = [
		..._.get(revenue, 'revenues.data', []),
		..._.get(revenue, 'otherRevenues.data', []),
		..._.get(revenue, 'other.data', []),
		..._.get(revenue, 'groundRentRevenues.data', []),
	];

	const hostCollected =
		_.sumBy(
			revenues.filter(i => isHostCollect(i.payType, config)),
			'vnd'
		) || 0;

	const total = realRevenue.total + totalFinalIncomeOther;

	return {
		key: 'realRevenue',
		total,
		data: _.compact([
			{
				key: 'tbRevenue',
				total: total - hostCollected,
			},
			{
				key: 'ownerRevenue',
				total: hostCollected,
			},
		]),
	};
}

function getSharedCost({ gmv, commission, nameAffix, language }) {
	const commissionOTA = commission.data[1].total;
	const { shortTerms, longTerms } = gmv.transactionFees;

	return {
		key: 'sharedCost',
		total: commissionOTA + shortTerms + longTerms,
		data: [
			{
				key: 'commissionNoAutoRedux',
				total: commissionOTA,
			},
			{
				key: 'transactionFee',
				total: shortTerms,
				name: `${_.get(textContent.UTILS, ['transactionFee', language])} ${nameAffix}`,
			},
			{
				key: 'transactionFeeLT',
				total: longTerms,
				name: `${_.get(textContent.UTILS, ['transactionFeeLT', language])} ${nameAffix}`,
			},
		],
	};
}

function getCzIncome({ revenue, config, taxRate, language, sharedOthers }) {
	const { hasTax: ht } = config;
	const cShortTerm = _.get(config, 'shortTerm') || 0;
	const cLongTerm = _.get(config, 'longTerm') || 0;

	const revenues = [
		..._.get(revenue, 'revenues.data', []),
		..._.get(revenue, 'otherRevenues.data', []),
		..._.get(revenue, 'groundRentRevenues.data', []),
		...sharedOthers,
	];

	const shortTerms = revenues.filter(i => i.serviceType !== Services.Month);
	const longTerms = revenues.filter(i => i.serviceType === Services.Month);

	const stFee = _.sumBy(shortTerms, 'manageFee') || 0;
	const ltFee = _.sumBy(longTerms, 'manageFee') || 0;

	const reduceFee = revenue.totalManageFee - revenue.totalManageFeeRedux || 0;

	const stPercentText = `${_.round(cShortTerm * 100)}%`;
	const ltermPercentText = `${_.round(cLongTerm * 100)}%`;
	const taxText = `${_.round(taxRate * 100)}%`;

	return {
		key: 'czIncome',
		total: stFee + ltFee - reduceFee,
		data: _.compact([
			{
				key: 'czIncomeSTManageFee',
				name: `${_.get(textContent.UTILS, ['czIncomeSTManageFee', language])}`,
				total: stFee,
				description: `(4) ${stPercentText} x [Doanh thu thực ngắn hạn]`,
			},
			{
				key: 'czIncomeLTManageFee',
				name: `${_.get(textContent.UTILS, ['czIncomeLTManageFee', language])}`,
				total: ltFee,
				description: `(5) ${ltermPercentText} x [Doanh thu thực dài hạn]`,
			},
			{
				key: ht ? 'czIncomeReductionWithTax' : 'czIncomeReduction',
				total: reduceFee ? -reduceFee : 0,
				description: ht
					? `(6) (${stPercentText} x (${taxText} x (%commissionNoAutoRedux% + %transactionFee%) + %commissionNoAutoRedux% + %transactionFee%)) + (${ltermPercentText} x (${taxText} x %transactionFeeLT% + %transactionFeeLT%))`
					: `(6) (${stPercentText} x (%commissionNoAutoRedux% + %transactionFee%)) + (${ltermPercentText} x %transactionFeeLT%)`,
			},
		]),
	};
}

function getHostIncome({ realRevenue, czIncome, totalFinalIncomeOther }) {
	const total = realRevenue.total - czIncome.total;

	return {
		key: 'hostIncome',
		total: total + totalFinalIncomeOther,
		data: _.compact([
			{
				key: 'hostIncome',
				total,
				description: `(7) %totalRealRevenue% - %czIncome%`,
			},
			totalFinalIncomeOther && {
				key: 'otherRevenue',
				total: totalFinalIncomeOther,
			},
		]),
	};
}

function getHostFee({ revenue, sharedCost, fee, config, taxRate, language }) {
	const { hasTax: ht } = config;

	const cShortTerm = 1 - (_.get(config, 'shortTerm') || 0);
	const cLongTerm = 1 - (_.get(config, 'longTerm') || 0);

	// const tax = ht ? _.round(taxRate * hostIncome.total) : 0;
	const tax = ht ? revenue.totalTax : 0;
	const cFee = _.round((sharedCost.data[0].total + sharedCost.data[1].total) * cShortTerm);
	const ltFee = _.round(sharedCost.data[2].total * cLongTerm);

	const stPercentText = `${_.round(cShortTerm * 100)}%`;
	const ltermPercentText = `${_.round(cLongTerm * 100)}%`;

	return {
		key: 'hostFee',
		total: tax + cFee + fee.total,
		data: _.compact([
			ht && {
				key: 'incomeTax',
				total: tax,
				description: `(8) ${_.round(
					taxRate * 100
				)}% x %hostIncome% (Ở mục số 6, tb đã bù giảm trừ cho chủ nhà)`,
			},
			{
				key: 'commissionAndTransFee',
				name: `${_.get(textContent.UTILS, ['commissionAndTransFee', language])}`,
				total: cFee,
				description: `(9) ${stPercentText} x (%commissionNoAutoRedux% + %transactionFee%)`,
			},
			{
				key: 'commissionAndTransFeeLT',
				name: `${_.get(textContent.UTILS, ['commissionAndTransFeeLT', language])}`,
				total: ltFee,
				description: `(10) ${ltermPercentText} x %transactionFeeLT%`,
			},
			{
				key: 'operationFee',
				total: fee.total,
				description: `(11) Xem ở mục chi tiết Chi Hộ`,
			},
		]),
	};
}

function getNOI({ hostIncome, hostFee, realCollected }) {
	const total = hostIncome.total - hostFee.total;
	const ownerRevenue = realCollected.data[1].total;

	return {
		key: 'NOI',
		total,
		description: `(12) %hostIncome% - %hostFee%`,
		data: [
			{
				key: 'ownerRevenue',
				total: ownerRevenue,
			},
			{
				key: 'payForHost',
				total: total - ownerRevenue,
				description: `(13) %NOI% - %ownerRevenue%`,
				style: {
					bold: true,
					background: '#fffc7b',
				},
			},
		],
	};
}

function replaceDescription(description, language) {
	if (description) {
		_.forEach(textContent.OVERVIEW, (value, key) => {
			description = description.replaceAll(`%${key}%`, `[${_.get(value, ['name', language], key)}]`);
		});
		_.forEach(textContent.UTILS, (value, key) => {
			description = description.replaceAll(`%${key}%`, `[${_.get(value, language, key)}]`);
		});
	}

	return description;
}

function generate(items, language) {
	const romanIndexes = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

	const rs = items.map((item, index) => {
		// const isLast = index === items.length - 1;
		const isLast = false;

		if (!item.name) {
			item.name = `${isLast ? '' : `${romanIndexes[index]}. `}${_.get(
				textContent.OVERVIEW,
				[item.key, 'name', language],
				item.key
			)}`.toUpperCase();
		}

		return {
			...item,
			description: replaceDescription(item.description, language),
			data: _.map(item.data, sItem => {
				return {
					...sItem,
					description: replaceDescription(sItem.description, language),
					name: sItem.name || `${_.get(textContent.UTILS, [sItem.key, language], sItem.key)}`,
				};
			}),
		};
	});

	return rs;
}

function getOverview({ revenue, fee, from, to, config, language, taxRate }) {
	const textFrom = moment(from).format('DD/MM');
	const textTo = moment(to).format('DD/MM/YYYY');
	const labelFrom = textContent.UTILS.from[language];
	const labelTo = textContent.UTILS.to[language];
	const nameAffix = `${labelFrom} ${textFrom} ${labelTo} ${textTo}`;

	const others = _.get(revenue, 'other.data', []);
	const sharedOthers = _.filter(others, o => !o.isFinalIncome);
	const totalSharedOther = _.sumBy(sharedOthers, 'vnd') || 0;

	const finalIncomeOthers = _.filter(others, o => o.isFinalIncome);
	const totalFinalIncomeOther = _.sumBy(finalIncomeOthers, 'vnd') || 0;

	revenue.total -= totalFinalIncomeOther;

	// GMV
	const gmv = getGMV({ revenue, sharedOthers, totalSharedOther, totalFinalIncomeOther, nameAffix, language });

	// Doanh thu thực
	const realRevenue = getRealRevenue({ revenue, sharedOthers });

	// Hoa hồng
	const commission = getCommission({ revenue, realRevenue, nameAffix, language });

	// Thực trạng thu
	const realCollected = getRealCollected({ revenue, realRevenue, config, sharedOthers, totalFinalIncomeOther });

	// chi phí chung
	const sharedCost = getSharedCost({ commission, gmv, nameAffix, language });

	// OTAFee
	const czIncome = getCzIncome({
		revenue,
		config,
		taxRate,
		language,
		sharedOthers,
	});

	const hostIncome = getHostIncome({ realRevenue, czIncome, totalFinalIncomeOther });

	const hostFee = getHostFee({
		revenue,
		hostIncome,
		sharedCost,
		commission,
		fee,
		config,
		taxRate,
		language,
	});

	const NOI = getNOI({ hostIncome, hostFee, realCollected });

	return generate(
		[gmv, commission, realRevenue, realCollected, sharedCost, czIncome, hostIncome, hostFee, NOI],
		language
	);
}

module.exports = { getOverview };
