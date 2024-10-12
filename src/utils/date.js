const moment = require('moment');
const _ = require('lodash');
const { RuleDay, RuleDelay, CONTRACT_CALC_TYPE } = require('./const');

function* rangeDate(from, to, equal = true, autoReverse = false) {
	if (autoReverse && from > to) {
		[from, to] = [to, from];
	}

	let date = moment(from).startOf('days').set('hours', 7);
	const _to = moment(to).startOf('days').set('hours', 7).unix();

	while (date.unix() < _to || (equal && date.unix() === _to)) {
		yield date.toDate();

		date = date.add(1, 'days');
	}
}

rangeDate.prototype.toArray = function () {
	const arr = [];
	for (const date of this) {
		arr.push(date);
	}

	return arr;
};

rangeDate.prototype.forEach = function (callback) {
	let idx = 0;
	for (const date of this) {
		callback(date, idx++);
	}
};

rangeDate.prototype.asyncForEach = async function (callback) {
	let idx = 0;
	for (const date of this) {
		await callback(date, idx++);
	}
};

rangeDate.prototype.map = function (callback) {
	const arr = [];
	for (const date of this) {
		arr.push(callback(date));
	}

	return arr;
};

rangeDate.prototype.asyncMap = async function (callback) {
	const arr = [];
	for (const date of this) {
		arr.push(callback(date));
	}

	return await Promise.all(arr);
};

rangeDate.prototype.syncMap = async function (callback) {
	const arr = [];
	for (const date of this) {
		arr.push(await callback(date));
	}

	return arr;
};

const DATE_FORMAT = {
	hour: 'HH',
	day: 'DD-MM-YYYY',
	month: 'MM-YYYY',
};

function getRanges(from, to, unit) {
	if (!DATE_FORMAT[unit]) return [];

	const fromDate = moment(from);
	const toDate = moment(to);
	const ranges = [];

	while (toDate.isSameOrAfter(fromDate, 'date')) {
		const label = fromDate.format(DATE_FORMAT[unit]);
		ranges.push({ label: unit === 'hour' ? `${label}:00` : label, value: fromDate.toDate() });
		fromDate.add(1, unit);
	}
	return ranges;
}

function rangeMonth(from, to, format = 'MM-YYYY') {
	const fromDate = moment(from);
	const toDate = moment(to);
	const ranges = [];
	while (toDate.isSameOrAfter(fromDate, 'date')) {
		ranges.push(fromDate.format(format));
		fromDate.add(1, 'month');
	}
	return ranges;
}

/**
 *
 *
 * @param {Date} from
 * @param {Date} to
 * @param {number} [chunkStep=30]
 * @param {number} [padding=1]
 * @returns
 */
function chunkDate(from, to, step = 30, padding = 1) {
	const untilDate = moment(to).toDate();

	let cFrom = moment(from).toDate();

	const chunk = [];
	while (cFrom <= untilDate) {
		let newTo = moment(cFrom).add(step, 'days').toDate();

		if (newTo > untilDate) {
			newTo = untilDate;
		}

		chunk.push([cFrom, newTo]);

		if (padding) {
			cFrom = moment(newTo).add(padding, 'days').toDate();
		} else {
			cFrom = newTo;
		}
	}

	return chunk;
}

function getDayOfRange(from, to) {
	let cFrom = moment(from).startOf('day');
	let cto = moment(to).startOf('day');

	const days = [];

	while (cFrom <= cto && days.length < 7) {
		days.push(cFrom.day());
		cFrom.add(1, 'day');
	}

	return days.sort();
}

function groupDates(dates = [], daysOfWeek) {
	const queue = [];
	let firstDate = null;
	let preDate = null;

	if (daysOfWeek) dates = dates.filter(date => daysOfWeek.includes((date.getDay() + 1).toString()));

	dates
		.sort((a, b) => a - b)
		.forEach(date => {
			if (firstDate) {
				if (preDate.diffDays(date) > 1) {
					queue.push([firstDate, preDate]);
					firstDate = date;
					preDate = date;
				} else {
					preDate = date;
				}
			} else {
				firstDate = date;
				preDate = date;
			}
		});
	if (firstDate) {
		queue.push([firstDate, preDate]);
	}

	return queue;
}

function getTimeInOut(date, type) {
	const [hour, minute] = (type === 'out' ? RuleDay.to : RuleDay.from).split(':');

	return moment(date).hour(hour).minute(minute).toDate();
}

function chunkMonthRanges(from, to, type) {
	const oFrom = new Date(from).zeroHours();
	const cFrom = moment(new Date(from).zeroHours());
	const cto = moment(new Date(to).zeroHours()).add(1, 'day');
	const isEndMonthCalc = type === CONTRACT_CALC_TYPE.toEndOfMonth;

	const ranges = [];
	let month = 1;

	while (cFrom < cto) {
		let _from = cFrom.toDate();
		let _to = _.min([moment(cFrom).add(1, 'month').toDate(), cto.toDate()]);

		// tính tới cuối tháng
		if (isEndMonthCalc) {
			_to = _.min([moment(cFrom).endOf('month').add(1, 'day').toDate().zeroHours(), cto.toDate()]);
			if (month > 1) _from = _.max([cFrom.date(1).toDate(), oFrom]);
		}

		if (moment(_from).isBefore(_to)) {
			ranges.push({
				from: _from,
				to: _to,
			});
		}

		month++;
		cFrom.add(1, 'month');
		if (cFrom >= cto && isEndMonthCalc && _to < cto) {
			ranges.push({ from: _to, to: cto.toDate() });
		}
	}
	return ranges;
}

function roundTime(time) {
	if (!time) return time;

	const mTime = moment(time, 'HH:mm');
	const minutes = mTime.minutes();
	const hours = mTime.hours();
	let _minute = 0;
	if (minutes > 0) _minute = 30;
	if (minutes > 30) _minute = hours === 23 ? 59 : 60;

	return mTime.minutes(_minute).format('HH:mm');
}

// HOUR
function isAdjacent(t1, t2, step = RuleDelay) {
	if (t1 === '23:30' && t2 === '23:59') return true;
	return moment(t2, 'HH:mm').diff(moment(t1, 'HH:mm'), 'minutes') === step;
}

function chunkTime(fromHour, toHour, step = RuleDelay) {
	const rs = [];
	let iter = fromHour;
	while (iter <= toHour && iter < '23:30') {
		rs.push(iter);
		iter = moment(iter, 'HH:mm').add(step, 'minutes').format('HH:mm');
		if (iter === '23:30') {
			rs.push(iter);
			rs.push('23:59');
		}
	}
	return rs;
}

function convertTimeChunkToRanges(timeChunks, step = RuleDelay) {
	const rs = [];
	let fromHour = timeChunks[0];
	timeChunks.forEach((item, index) => {
		if (index === 0) return;
		const _isAdjacent = isAdjacent(timeChunks[index - 1], item, step);
		const isLastItem = index === timeChunks.length - 1;
		if (_isAdjacent && isLastItem) {
			rs.push({ fromHour, toHour: item });
		}
		if (!_isAdjacent && (!isLastItem || item === '23:59')) {
			if (fromHour !== timeChunks[index - 1]) rs.push({ fromHour, toHour: timeChunks[index - 1] });
			fromHour = item;
		}
	});

	return rs;
}

/**
 * Ranges = [{ fromHour, toHour }]
 * @param {[Ranges]} ranges
 */
function timeRangeIntersection(ranges, step = RuleDelay) {
	const timeChunks = _.map(ranges, range => {
		const chunkArr = _.map(range, item => chunkTime(item.fromHour, item.toHour, step));
		return _.flatten(chunkArr);
	});
	const duplicateChunks = _.sortBy(_.intersection(...timeChunks));
	const rs = convertTimeChunkToRanges(duplicateChunks);
	return rs;
}

// type: [ADD, SUBTRACT]
function setDelayTime(time, delay = RuleDelay, type = 'ADD') {
	const regex = /^(?:[01]\d|2[0-3]):[0-5]\d$/; // validate "HH:mm"
	if (!regex.test(time)) return '00:00';

	const mTime = moment(time, 'HH:mm');
	const hours = mTime.hours();
	let rs = '';

	if (type.toUpperCase() === 'SUBTRACT') {
		rs = mTime.subtract(delay, 'minutes');
		if (hours < rs.hours()) return '00:00';
	}
	if (type.toUpperCase() === 'ADD') {
		rs = mTime.add(delay, 'minutes');
		if (hours > rs.hours()) return '23:59';
	}

	return rs.format('HH:mm');
}

module.exports = {
	rangeDate,
	rangeMonth,
	chunkDate,
	getDayOfRange,
	groupDates,
	chunkMonthRanges,
	getTimeInOut,
	roundTime,
	timeRangeIntersection,
	setDelayTime,
	getRanges,
};
