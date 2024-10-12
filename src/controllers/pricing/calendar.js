const _ = require('lodash');
const moment = require('moment');
const { rangeDate } = require('@utils/date');
const models = require('@models');

async function getCalendar({ blockId, roomTypeId, ratePlanId, showTrend, from, to }) {
	let calendars = await models.BlockCalendar.find({
		blockId,
		roomTypeId,
		ratePlanId,
		date: {
			$gte: from,
			$lte: to,
		},
	}).lean();

	if (showTrend === 'true') {
		calendars = await calendars.asyncMap(async calendar => {
			const date = new Date(calendar.date).zeroHours();
			const query = {
				blockId: calendar.blockId,
				roomTypeId: calendar.roomTypeId,
				ratePlanId: calendar.ratePlanId,
				daysOfWeek: _.toString(date.getDay() + 1),
				from: { $lte: date },
				to: { $gte: date },
			};

			const histories = await models.PriceHistory.find(query).sort({ createdAt: -1 }).limit(2).select('price');
			const rs = {};

			const diff = (histories[1] && histories[0].price - histories[1].price) || 0;
			if (diff % 1000 === 0) {
				rs.trendValue = diff;
				rs.trendType = 'value';
			} else {
				rs.trendValue = _.round((diff / histories[1].price) * 100, 1);
				rs.trendType = 'percent';
			}

			return {
				...calendar,
				...rs,
			};
		});
	}

	const calendarObj = _.keyBy(calendars, 'date');
	const data = rangeDate(from, to)
		.toArray()
		.map(date => {
			date = date.toDateMysqlFormat();
			return (
				calendarObj[date] || {
					date,
				}
			);
		});

	return { data };
}

async function getCalendarHistory({ blockId, roomTypeId, ratePlanId, from, to, time }) {
	time = time || moment().add(-7, 'day').format('Y-MM-DD-HH');

	const query = {
		blockId,
		roomTypeId,
		ratePlanId,
		date: {
			$gte: from,
			$lte: to,
		},
	};

	const [calendar, calendarHistory] = await Promise.all([
		models.BlockCalendar.find(query).then(rs => _.keyBy(rs, 'date')),
		models.BlockCalendarHistory.find({
			...query,
			time,
		}).then(rs => _.keyBy(rs, 'date')),
	]);

	const data = rangeDate(from, to)
		.toArray()
		.map(date => {
			date = date.toDateMysqlFormat();
			return (
				calendarHistory[date] ||
				calendar[date] || {
					date,
				}
			);
		});

	return { data };
}

module.exports = { getCalendar, getCalendarHistory };
