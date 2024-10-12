const _ = require('lodash');

const { rangeDate } = require('@utils/date');
const { EXTRA_FEE, ONE_DAY, CurrencyConvert } = require('@utils/const');
const models = require('@models');

const MIN_DATE = '1970-01-01';
const MAX_DATE = '9999-12-31';

function dateToString(field) {
	return {
		$dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: '+07:00' },
	};
}

async function getBookingRevenues({ filter, from, to, blocks, dateType }) {
	const isFrom = !dateType || dateType === 'from';

	const dates = {};

	const rangeDates = rangeDate(from, to).toArray();
	rangeDates.forEach(date => {
		dates[date.toDateMysqlFormat()] = { revenue: {}, booked: {} };
	});

	if (isFrom) {
		filter.from = { $lte: to };
		filter.to = { $gt: from };
	} else {
		filter.createdAt = { $gte: from, $lte: to };
	}

	const groupBlocks = {
		[EXTRA_FEE.VAT_FEE]: [],
		[EXTRA_FEE.COMPENSATION]: [],
		[EXTRA_FEE.MANAGEMENT_FEE]: [],
	};
	_.forEach(blocks, block => {
		const feeConfig = models.Block.getFeeConfig(block.manageFee, new Date(from).toDateMysqlFormat());
		if (feeConfig.includeVAT) {
			groupBlocks[EXTRA_FEE.VAT_FEE].push(block._id);
		}
		if (feeConfig.includeCompensation) {
			groupBlocks[EXTRA_FEE.COMPENSATION].push(block._id);
		}
		if (feeConfig.includeManageFee) {
			groupBlocks[EXTRA_FEE.MANAGEMENT_FEE].push(block._id);
		}
	});

	const revenueKeys = [
		'roomPrice',
		EXTRA_FEE.ELECTRIC_FEE,
		EXTRA_FEE.WATER_FEE,
		EXTRA_FEE.EXTRA_FEE,
		EXTRA_FEE.EARLY_CHECKIN,
		EXTRA_FEE.LATE_CHECKOUT,
		EXTRA_FEE.ROOM_UPGRADE,
		EXTRA_FEE.EXTRA_PEOPLE,
		EXTRA_FEE.CHANGE_DATE_FEE,
		EXTRA_FEE.MINIBAR,
		EXTRA_FEE.CLEANING_FEE,
		EXTRA_FEE.SERVICE_FEE,
		EXTRA_FEE.INTERNET_FEE,
		EXTRA_FEE.DRINK_WATER_FEE,
		EXTRA_FEE.LAUNDRY_FEE,
		EXTRA_FEE.MOTOBIKE_FEE,
		EXTRA_FEE.CAR_FEE,
		EXTRA_FEE.BOOKING_FEE,
	].map(k => `$${k}`);

	const arrBlocks = _.values(blocks);

	const blocksHaveStartDate = arrBlocks.filter(b => b.startRunning);
	const blocksHaveEndDate = arrBlocks.filter(b => b.endRunning);

	const bookings = await models.Booking.aggregate(
		_.compact([
			{
				$match: filter,
			},
			{
				$project: _.pickBy({
					otaName: 1,
					amount: 1,
					blockId: 1,
					date: isFrom ? 0 : dateToString('createdAt'),
					from: isFrom ? dateToString('from') : 0,
					to: isFrom ? dateToString('to') : 0,
					nights: isFrom
						? {
								$max: [
									{
										$divide: [{ $subtract: ['$to', '$from'] }, ONE_DAY],
									},
									1,
								],
						  }
						: 0,
					revenue: {
						$multiply: [
							{
								$sum: [
									...revenueKeys,
									..._.entries(groupBlocks).map(([revKey, blockIds]) => ({
										$cond: [{ $in: ['$blockId', blockIds] }, `$${revKey}`, 0],
									})),
								],
							},
							{
								$ifNull: [
									'$currencyExchange',
									{
										$switch: {
											branches: _.entries(CurrencyConvert).map(([currency, exchanged]) => ({
												case: { $eq: ['$currency', currency] },
												then: exchanged,
											})),
											default: 1,
										},
									},
								],
							},
						],
					},
				}),
			},
			isFrom && {
				$addFields: {
					avgRev: {
						$divide: ['$revenue', '$nights'],
					},
				},
			},
			{
				$group: {
					_id: { otaName: '$otaName', blockId: '$blockId' },
					bookings: {
						$push: '$$ROOT',
					},
				},
			},
			{
				$addFields: {
					start:
						blocksHaveStartDate.length > 1
							? {
									$switch: {
										branches: blocksHaveStartDate.map(block => ({
											case: {
												$eq: ['$_id.blockId', block._id],
											},
											then: block.startRunning,
										})),
										default: MIN_DATE,
									},
							  }
							: _.get(blocksHaveStartDate[0], 'startRunning') || MIN_DATE,
					end:
						blocksHaveEndDate.length > 1
							? {
									$switch: {
										branches: blocksHaveEndDate.map(block => ({
											case: {
												$eq: ['$_id.blockId', block._id],
											},
											then: block.endRunning,
										})),
										default: MAX_DATE,
									},
							  }
							: _.get(blocksHaveEndDate[0], 'endRunning') || MAX_DATE,
				},
			},
			{
				$project: {
					_id: 1,
					results: {
						$map: {
							input: _.keys(dates),
							as: 'date',
							in: {
								date: '$$date',
								data: {
									$reduce: {
										input: {
											$filter: {
												input: '$bookings',
												as: 'booking',
												cond: isFrom
													? {
															$and: [
																{
																	$lte: [
																		{ $max: ['$$booking.from', '$start'] },
																		'$$date',
																	],
																},
																{
																	$gt: [{ $min: ['$$booking.to', '$end'] }, '$$date'],
																},
															],
													  }
													: {
															$eq: ['$$booking.date', '$$date'],
													  },
											},
										},
										initialValue: { rev: 0, amount: 0 },
										in: {
											rev: { $sum: ['$$value.rev', isFrom ? '$$this.avgRev' : '$$this.revenue'] },
											amount: { $sum: ['$$value.amount', '$$this.amount'] },
										},
									},
								},
							},
						},
					},
				},
			},
		])
	);

	return { bookings, dates };
}

module.exports = {
	getBookingRevenues,
};
