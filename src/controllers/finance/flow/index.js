/* eslint-disable no-lonely-if */
const _ = require('lodash');

const { PayoutSources, Services, CASH_FLOW_OBJECT, GUARANTEE_REV_TYPE } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { OBJECT_NAME, GROUP, GROUP_NAME, GROUP_WITH_EXPENSE, REVENUE_OBJECTS, DETAIL_GROUP_KEY } = require('./const');

const Objects = require('./object');
const { parseQuery, mapDataToResponse, calcRevenue, sumData } = require('./utils');

function mergeObjs(blockObjects) {
	const mergeData = [];

	_.forEach(blockObjects, objs => {
		objs.forEach((obj, index) => {
			if (mergeData[index]) {
				mergeData[index].total += obj.total;
				mergeData[index].remaining += obj.remaining;
				mergeData[index].flows = mergeData[index].flows.map((f, fIndex) => ({
					...f,
					amount: f.amount + obj.flows[fIndex].amount,
				}));
			} else {
				mergeData.push(_.cloneDeep(obj));
			}
		});
	});

	mergeData.forEach(o => {
		o.flows = o.flows.filter(f => f.amount);
	});

	return mergeData;
}

async function getCashFlowV2(query, user, language) {
	const { blockIds, blocks, period, showExpense, otaBookingId } = await parseQuery(query, user);

	const groups = _.map(showExpense ? GROUP_WITH_EXPENSE : GROUP, g => ({
		...g,
		name: _.get(GROUP_NAME, [g.key, language], g.key),
	}));
	const objectKeys = _.flatten(_.map(groups, 'objects'));

	const flows = await models.CashFlow.aggregate()
		.match(
			_.pickBy({
				blockId: { $in: blockIds },
				period,
				otaBookingId,
			})
		)
		.unwind({
			path: '$flows',
			preserveNullAndEmptyArrays: true,
		})
		.match({
			'flows.destination': { $in: objectKeys },
			'flows.source': { $in: [...objectKeys, null] },
		})
		.group({
			_id: {
				blockId: '$blockId',
				serviceType: '$serviceType',
				destination: '$flows.destination',
				source: '$flows.source',
				payoutSource: '$flows.payoutSource',
			},
			total: { $sum: '$flows.total' },
			remaining: { $sum: '$flows.remaining' },
		});

	const blockFlows = _.groupBy(flows, f => f._id.blockId);
	const blockObjects = {};

	blockIds.forEach(blockId => {
		const bflows = blockFlows[blockId] || [];

		blockObjects[blockId] = objectKeys.map(objectName => {
			const lines = _.get(Objects, [objectName, 'LINES']);

			const sources = bflows.filter(f => f._id.destination === objectName);
			const transferred = bflows.filter(f => f._id.source === objectName);
			const total = sumData(sources);
			const totalTransferred = sumData(transferred);

			return {
				objectKey: CASH_FLOW_OBJECT[objectName],
				objectName: _.get(OBJECT_NAME[objectName], language, objectName),
				total,
				remaining: total - totalTransferred,
				flows: _.filter(lines, line => objectKeys.includes(line.to)).map(line => {
					const matchFlows = bflows.filter(m => m._id.source === line.from && m._id.destination === line.to);
					return {
						from: line.from,
						to: line.to,
						line: line.line,
						amount: sumData(matchFlows),
					};
				}),
			};
		});
	});

	const res = {
		groups,
	};

	if (showExpense) {
		res.expense = await calcExpense({ blockFlows, groups, blocks, period, blockObjects });
	}

	res.data = mergeObjs(blockObjects);
	res.revenue = calcRevenue(flows);

	return res;
}

function mergeFlows(target, newFlows) {
	newFlows.forEach(newFlow => {
		const obj = target.find(d => d.objectKey === newFlow.from);
		if (!obj) return;

		const flow = obj.flows.find(f => f.from === newFlow.from && f.to === newFlow.to);
		if (flow) {
			flow.amount += newFlow.amount;
			obj.remaining -= newFlow.amount;

			const targetObj = target.find(d => d.objectKey === newFlow.to);
			if (targetObj) {
				targetObj.total += newFlow.amount;
				targetObj.remaining += newFlow.amount;
			}
		}
	});
}

function detachServiceFlows(flows) {
	return [
		flows.filter(f => f._id.serviceType !== Services.Month),
		flows.filter(f => f._id.serviceType === Services.Month),
	];
}

async function calcTax(flows, from, to) {
	const taxRate = await models.Setting.getReportTax(from.toDateMysqlFormat(), to.toDateMysqlFormat());

	const sourceHasTax = {
		[PayoutSources.BANKING]: 1,
		[PayoutSources.SWIPE_CARD]: 1,
		[PayoutSources.ONLINE_WALLET]: 1,
		[PayoutSources.THIRD_PARTY]: 1,
	};
	const bankFees = {
		[CASH_FLOW_OBJECT.REFUND]: 1,
		[CASH_FLOW_OBJECT.COMMISSION_OTA]: 1,
		[CASH_FLOW_OBJECT.COMMISSION_COZRUM]: 1,
		[CASH_FLOW_OBJECT.TRANSACTION_FEE]: 1,
		[CASH_FLOW_OBJECT.BACKUP_CASH_FUND]: 1,
	};

	const otas = flows.filter(f => f._id.destination === CASH_FLOW_OBJECT.OTA_COLLECT);
	const tps = flows.filter(f => f._id.destination === CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT);
	const hasTaxFlows = flows.filter(f => sourceHasTax[f._id.payoutSource]);
	const accs = hasTaxFlows.filter(f => f._id.destination === CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM);

	const [shortTermOtas, longtermOtas] = detachServiceFlows(otas);
	const [shortTermTps, longtermTps] = detachServiceFlows(tps);
	const [shortTermAccs, longtermAccs] = detachServiceFlows(accs);
	const [shortTermHasTax, longtermHasTax] = detachServiceFlows(hasTaxFlows);

	const uncShortTerms =
		sumData(shortTermOtas, 'remaining') + sumData(shortTermTps, 'remaining') + sumData(shortTermAccs, 'remaining');
	const uncLongTerms =
		sumData(longtermOtas, 'remaining') + sumData(longtermTps, 'remaining') + sumData(longtermAccs, 'remaining');

	const bankKeys = [CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT, CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT];
	const newFlows = [];
	let longTermTax = 0;
	let shortTermTax = 0;

	bankKeys.forEach(key => {
		const longTermBanks = longtermHasTax.filter(f => f._id.destination === key);
		const longTermFees = longtermHasTax.filter(f => f._id.source === key && bankFees[f._id.destination]);

		const shortTermBanks = shortTermHasTax.filter(f => f._id.destination === key);
		const shortTermFees = shortTermHasTax.filter(f => f._id.source === key && bankFees[f._id.destination]);

		const totalLongTerm =
			(key === CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT ? uncLongTerms : 0) +
			(sumData(longTermBanks) - sumData(longTermFees));

		const totalShortTerm =
			(key === CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT ? uncShortTerms : 0) +
			(sumData(shortTermBanks) - sumData(shortTermFees));

		const total = totalLongTerm + totalShortTerm;
		if (total) {
			newFlows.push({
				from: key,
				to: CASH_FLOW_OBJECT.TAX,
				amount: _.round(taxRate * total),
			});
		}

		longTermTax += _.round(totalLongTerm * taxRate);
		shortTermTax += _.round(totalShortTerm * taxRate);
	});

	return { newFlows, longTermTax, shortTermTax, total: longTermTax + shortTermTax };
}

async function calcExpense({ blockFlows, blocks, period, blockObjects }) {
	let expense = 0;

	await _.entries(blockFlows).asyncMap(async ([blockId, bflows]) => {
		const block = blocks[blockId];
		const [from, to] = block.findDatesOfPeriod(period);
		const config = block.getManageFee(from.toDateMysqlFormat());

		let taxData;
		const objects = blockObjects[blockId];

		if (config.hasTax) {
			taxData = await calcTax(bflows, from, to);
			mergeFlows(objects, taxData.newFlows);
		}

		const sellingExpKeys = [
			CASH_FLOW_OBJECT.COMMISSION_OTA,
			CASH_FLOW_OBJECT.TRANSACTION_FEE,
			CASH_FLOW_OBJECT.COMMISSION_COZRUM,
		];
		const sellingExps = bflows.filter(f => sellingExpKeys.includes(f._id.destination));
		const expBackup = sellingExps.filter(
			f => f._id.source === CASH_FLOW_OBJECT.BACKUP_CASH_FUND && !REVENUE_OBJECTS.includes(f._id.destination)
		);
		const expKeys = [
			CASH_FLOW_OBJECT.SERVICES,
			CASH_FLOW_OBJECT.MAINTENANCE,
			CASH_FLOW_OBJECT.BUY_EQUIPMENT,
			CASH_FLOW_OBJECT.OTHER_FEE,
		];
		const expenses = bflows.filter(f => expKeys.includes(f._id.destination));
		const otherExp = sumData(expenses);

		let hostIncome = 0;
		let czIncome = 0;

		if (config.profits && config.profits.length) {
			const revenue = calcRevenue(bflows).total;

			const sExp = sumData(sellingExps) - sumData(expBackup) + _.get(taxData, 'total', 0);
			const netRev = revenue - otherExp - sExp;
			const profit =
				config.profits.find(c => (!c.min || c.min <= netRev) && (!c.max || c.max > netRev)) ||
				config.profits[0];

			// console.log({
			// 	revenue,
			// 	otherExp,
			// 	sExp,
			// 	netRev,
			// 	expBackup: sumData(expBackup),
			// 	sellingExps: sumData(sellingExps),
			// 	taxData: _.get(taxData, 'total', 0),
			// });

			if (profit.guaranteeRev === GUARANTEE_REV_TYPE.CZ) {
				czIncome = netRev - profit.max;
				hostIncome = profit.max;
			} else if (profit.guaranteeRev === GUARANTEE_REV_TYPE.SHARE) {
				const income = netRev - profit.min;
				czIncome = _.round(income * profit.czRate);
				hostIncome = netRev - czIncome;
			} else {
				czIncome = 0;
				hostIncome = netRev;
			}

			expense += czIncome + hostIncome + otherExp + sExp;
		} else {
			const [shortTerm, longTerm] = detachServiceFlows(bflows);
			const [saExp, laExp] = detachServiceFlows(sellingExps);
			const [sBk, lBk] = detachServiceFlows(expBackup);

			const sExp = sumData(saExp) - sumData(sBk) + _.get(taxData, 'shortTermTax', 0);
			const lExp = sumData(laExp) - sumData(lBk) + _.get(taxData, 'longTermTax', 0);
			const sNet = calcRevenue(shortTerm).total - sExp;
			const lNet = calcRevenue(longTerm).total - lExp;

			const internalExp = 0;

			// console.log({ sNet, lNet, sExp, lExp, config });

			czIncome = _.round(sNet * config.shortTerm) + _.round(lNet * config.longTerm);
			hostIncome = Math.max(sNet + lNet - czIncome - (otherExp - internalExp), 0);

			expense += czIncome + hostIncome + (otherExp - internalExp) + sExp + lExp;
		}

		autoTransfer({ objects, value: hostIncome, to: CASH_FLOW_OBJECT.HOST_INCOME });
		autoTransfer({ objects, value: czIncome, to: CASH_FLOW_OBJECT.MANAGE_FEE });
	});

	return {
		total: expense,
	};
}

function autoTransfer({ objects, value, to }) {
	let transfered = 0;
	const newFlows = [];

	REVENUE_OBJECTS.forEach((from, index, sources) => {
		if (transfered !== value) {
			const isLastIndex = sources.length === index + 1;
			const obj = objects.find(o => o.objectKey === from);
			const diff = value - transfered;
			const amount = isLastIndex
				? diff
				: diff > 0
				? Math.min(obj.remaining, diff)
				: Math.max(obj.remaining, diff);

			newFlows.push({
				from,
				to,
				amount,
			});

			transfered += amount;
		}
	});

	mergeFlows(objects, newFlows);
}

async function getFlows(query, user, language) {
	let { blockIds, period, line, objectName, viewType, otaBookingId, groupValue } = await parseQuery(query, user);

	const filter = {};
	const rs = {};
	const isViewRemaining = viewType === 'remaining';

	if (line) {
		const lineNumber = parseInt(line);
		const currentObj = _.values(Objects).find(obj => obj.LINES.find(l => l.line === lineNumber));
		if (!currentObj) {
			throw new ThrowReturn('Line not found!');
		}
		const currentLine = currentObj.LINES.find(l => l.line === lineNumber);
		filter['flows.source'] = currentLine.from;
		filter['flows.destination'] = currentLine.to;
		rs.from = currentLine.from;
		rs.to = currentLine.to;
		rs.line = currentLine.line;
	} else if (objectName) {
		filter['flows.destination'] = objectName;
		rs.objectKey = objectName;
		rs.objectName = OBJECT_NAME[objectName][language];
		if (isViewRemaining) {
			filter['flows.remaining'] = { $ne: 0 };
		}
	}

	if (otaBookingId) {
		filter.otaBookingId = otaBookingId;
	}

	const groupType = getGroupType(rs.objectKey || rs.from);

	if (groupValue) {
		if (groupType === DETAIL_GROUP_KEY.HOME) {
			blockIds = blockIds.filter(b => b.toString() === groupValue);
		}
		if (groupType === DETAIL_GROUP_KEY.OTA) {
			filter.bookingId = { $ne: null };
		}
		if (groupType === DETAIL_GROUP_KEY.PAYMENT_COLLECTOR || groupType === DETAIL_GROUP_KEY.USER_COLLECT) {
			filter.$or = [
				{
					payoutId: { $ne: null },
				},
				{
					'flows.payoutId': { $ne: null },
				},
			];
		}
	}

	const flows = await models.CashFlow.aggregate()
		.match(
			_.pickBy({
				blockId: { $in: blockIds },
				period,
				otaBookingId,
			})
		)
		.unwind('$flows')
		.match(filter)
		.project({
			_id: { $ifNull: ['$flows._id', '$id'] },
			bookingId: 1,
			blockId: 1,
			createdAt: 1,
			total: '$flows.total',
			remaining: '$flows.remaining',
			payoutId: { $ifNull: ['$flows.payoutId', '$payoutId'] },
		});

	return {
		...rs,
		flows,
		groupType,
		groupValue,
	};
}

async function getCashFlowDetail(query, user, language) {
	const isViewRemaining = query.viewType === 'remaining';

	const { flows, groupType, groupValue, ...rs } = await getFlows(query, user, language);

	const isLine = !!query.line;
	const mapData = await mapDataToResponse(flows, {
		isLine,
		isViewRemaining: !query.line && isViewRemaining,
		groupType,
		groupValue,
	});

	return {
		...rs,
		...mapData,
		groupValue,
	};
}

function getGroupType(objectName) {
	const OTAs = [
		CASH_FLOW_OBJECT.OTA_COLLECT,
		CASH_FLOW_OBJECT.UNPAID,
		CASH_FLOW_OBJECT.REFUND,
		CASH_FLOW_OBJECT.IGNORE_PRICE,
		CASH_FLOW_OBJECT.GUEST,
		CASH_FLOW_OBJECT.COMMISSION_OTA,
		CASH_FLOW_OBJECT.COMMISSION_COZRUM,
		CASH_FLOW_OBJECT.B2B,
	];

	if (OTAs.includes(objectName)) {
		return DETAIL_GROUP_KEY.OTA;
	}

	const collectors = [
		CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
		CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
		CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
		CASH_FLOW_OBJECT.CASH_FUND,
	];

	if (collectors.includes(objectName)) {
		return DETAIL_GROUP_KEY.PAYMENT_COLLECTOR;
	}

	const users = [
		CASH_FLOW_OBJECT.USER_CONFIRMED,
		CASH_FLOW_OBJECT.USER_UNCONFIRMED,
		CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
	];

	if (users.includes(objectName)) {
		return DETAIL_GROUP_KEY.USER_COLLECT;
	}

	return DETAIL_GROUP_KEY.HOME;
}

async function populateBookings(flows) {
	await models.Booking.populate(flows, { path: 'bookingId', select: 'otaName', options: { lean: true } });
}

async function populatePayouts(flows) {
	await models.Payout.populate(flows, {
		path: 'payoutId',
		select: 'collector collectorCustomName payoutType source createdBy',
		populate: {
			path: 'export',
			select: 'createdBy',
		},
		options: { lean: true },
	});
}

async function mapGroup({ flows, groupF, targetKey, targetLabel, isViewRemaining, model }) {
	const dataGroup = _.entries(_.groupBy(flows, groupF));

	const sources = await model
		.find({ [targetKey]: { $in: _.map(dataGroup, 0).filter(d => d) } })
		.select(`${targetKey} ${targetLabel}`)
		.then(rs => _.keyBy(rs, targetKey));

	return dataGroup.map(([key, items]) => {
		return {
			groupValue: key,
			label: _.get(sources[key], targetLabel) || key,
			amount: isViewRemaining ? _.sumBy(items, 'remaining') : _.sumBy(items, 'total'),
		};
	});
}

async function getCashFlowDetailV2(query, user, language) {
	const { flows, objectKey, from, to, line, groupType } = await getFlows(query, user, language);

	const isViewRemaining = !line && query.viewType === 'remaining';
	const opts = {
		flows,
		isViewRemaining,
	};

	if (groupType === DETAIL_GROUP_KEY.OTA) {
		await populateBookings(flows);

		_.assign(opts, {
			groupF: 'bookingId.otaName',
			targetKey: 'name',
			targetLabel: 'label',
			model: models.BookingSource,
		});
	}

	if (groupType === DETAIL_GROUP_KEY.PAYMENT_COLLECTOR) {
		await populatePayouts(flows);

		_.assign(opts, {
			groupF: f => _.get(f.payoutId, 'collectorCustomName') || _.get(f.payoutId, 'source') || '_',
			targetKey: 'tag',
			targetLabel: 'name',
			model: models.PaymentCollector,
		});
	}

	if (groupType === DETAIL_GROUP_KEY.USER_COLLECT) {
		await populatePayouts(flows);

		_.assign(opts, {
			groupF: f =>
				_.get(f.payoutId, 'export.createdBy') ||
				_.get(f.payoutId, 'collector') ||
				_.get(f.payoutId, 'createdBy') ||
				'_',
			targetKey: '_id',
			targetLabel: 'name',
			model: models.User,
		});
	}

	if (groupType === DETAIL_GROUP_KEY.HOME) {
		_.assign(opts, {
			groupF: 'blockId',
			targetKey: '_id',
			targetLabel: 'info.name',
			model: models.Block,
		});
	}

	const data = await mapGroup(opts);

	return { data, objectKey, from, to, line };
}

module.exports = {
	getCashFlow: getCashFlowV2,
	getCashFlowDetail,
	getCashFlowDetailV2,
};
