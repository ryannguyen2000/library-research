const _ = require('lodash');
const moment = require('moment');

const models = require('@models');
const { UPLOAD_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');
const { Types } = require('mongoose');

const { ObjectId } = Types;

const REPLACE_KEYS = {
	// Số liệu buồng, phòng lưu trú
	ROOM: { TOTAL_ROOM: 'TOTAL_ROOM', AVAILABLE_ROOM: 'AVAILABLE_ROOM', SOLD_ROOM: 'SOLD_ROOM' },
	// Số lượt khách nghỉ qua đêm
	GUEST: { TOTAL_GUEST: 'TOTAL_GUEST', INTERNATIONAL_GUEST: 'INTERNATIONAL_GUEST', DOMESTIC_GUEST: 'DOMESTIC_GUEST' },
	// Tổng số đêm nghỉ của khách
	NIGHT: { TOTAL_NIGHT: 'TOTAL_NIGHT', INTERNATIONAL_NIGHT: 'INTERNATIONAL_NIGHT', DOMESTIC_NIGHT: 'DOMESTIC_NIGHT' },
	// Tổng doanh thu
	REVENUE: {
		TOTAL_REVENUE: 'TOTAL_REVENUE',
		BOOKING_REVENUE: 'BOOKING_REVENUE',
		MINIBAR_REVENUE: 'MINIBAR_REVENUE',
		OTHER_REVENUE: 'OTHER_REVENUE',
	},
	// Tổng số lao động
	EMPLOYEE: {
		TOTAL_EMPLOYEE: 'TOTAL_EMPLOYEE',
		MANAGER_EMPLOYEE: 'MANAGER_EMPLOYEE',
		ADMIN_EMPLOYEE: 'ADMIN_EMPLOYEE',
		HOUSEKEEPING_EMPLOYEE: 'HOUSEKEEPING_EMPLOYEE',
		MINIBAR_EMPLOYEE: 'MINIBAR_EMPLOYEE',
		OTHER_EMPLOYEE: 'OTHER_EMPLOYEE',
	},
};

function calcDataCompareCurAndPrev(cur = 0, prev = 0) {
	if (prev === 0) return 0;
	const rs = ((cur - prev) / prev) * 100;
	return `${Number(Math.floor(rs)).toLocaleString()}`;
}

async function getPrevData(filters) {
	const tourismAccomodationReports = await models.TourismAccommodationReport.find(filters)
		.sort({ createdAt: -1 })
		.limit(1)
		.lean();
	const tourismAccomodationReport = _.get(tourismAccomodationReports, [0, 'data'], {});
	return {
		room: {
			total: _.get(tourismAccomodationReport, 'room.total', 0),
			available: _.get(tourismAccomodationReport, 'room.available', 0),
			sold: _.get(tourismAccomodationReport, 'room.sold', 0),
		},
		guest: {
			total: _.get(tourismAccomodationReport, 'room.total', 0),
			international: _.get(tourismAccomodationReport, 'guest.international', 0),
			domestic: _.get(tourismAccomodationReport, 'guest.domestic', 0),
		},
		night: {
			total: _.get(tourismAccomodationReport, 'night.total', 0),
			international: _.get(tourismAccomodationReport, 'night.international', 0),
			domestic: _.get(tourismAccomodationReport, 'night.domestic', 0),
		},
		revenue: {
			total: _.get(tourismAccomodationReport, 'revenue.total', 0),
			booking: _.get(tourismAccomodationReport, 'revenue.booking', 0),
			minibar: _.get(tourismAccomodationReport, 'revenue.minibar', 0),
			other: _.get(tourismAccomodationReport, 'revenue.other', 0),
		},
		employee: {
			total: _.get(tourismAccomodationReport, 'employee.total', 0),
			manager: _.get(tourismAccomodationReport, 'employee.manager', 0),
			admin: _.get(tourismAccomodationReport, 'employee.admin', 0),
			housekeeping: _.get(tourismAccomodationReport, 'employee.housekeeping', 0),
			minibar: _.get(tourismAccomodationReport, 'employee.minibar', 0),
			other: _.get(tourismAccomodationReport, 'employee.other', 0),
		},
	};
}

async function getStatistic({ key, filters, prevData }) {
	switch (key) {
		case 'ROOM':
			return await getRoomStatistic(filters, prevData);
		case 'GUEST':
			return await getGuestStatistic(filters, prevData);
		case 'NIGHT':
			return await getNightStatistic(filters, prevData);
		case 'REVENUE':
			return await getRevenueStatistic(filters, prevData);
		default:
			return [];
	}
}

async function getRoomStatistic(filters, prevData) {
	const { to, from, blockId } = filters;
	const roomPrevData = prevData.room;
	const rooms = await models.Room.countDocuments({
		blockId,
		active: true,
		isSelling: true,
	});
	const daysInMonth = moment(from).daysInMonth();
	const roomTotal = rooms * daysInMonth;

	const soldRoom = await models.Reservation.aggregate([
		{
			$match: {
				blockId: ObjectId(blockId),
				'dates.date': { $gte: new Date(from).zeroHours() },
			},
		},
		{
			$project: {
				night: {
					$size: {
						$filter: {
							input: '$dates',
							as: 'dateItem',
							cond: { $lte: ['$$dateItem.date', new Date(to).zeroHours()] },
						},
					},
				},
			},
		},
		{ $group: { _id: null, total: { $sum: '$night' } } },
	]);

	const soldRoomTotal = _.get(soldRoom, '0.total', 0);
	const availableRoomTotal = roomTotal - soldRoomTotal;

	// previous
	const prevTotal = calcDataCompareCurAndPrev(roomTotal, roomPrevData.total);
	const prevAvailable = calcDataCompareCurAndPrev(availableRoomTotal, roomPrevData.available);
	const prevSold = calcDataCompareCurAndPrev(soldRoomTotal, roomPrevData.sold);

	const { TOTAL_ROOM, AVAILABLE_ROOM, SOLD_ROOM } = REPLACE_KEYS.ROOM;
	return {
		_variableReplace: [
			// previous
			{ searchValue: `%PREV_${TOTAL_ROOM}%`, replaceValue: prevTotal },
			{ searchValue: `%PREV_${AVAILABLE_ROOM}%`, replaceValue: prevAvailable },
			{ searchValue: `%PREV_${SOLD_ROOM}%`, replaceValue: prevSold },
			// Current
			{ searchValue: `%CUR_${TOTAL_ROOM}%`, replaceValue: Number(roomTotal).toLocaleString() },
			{ searchValue: `%CUR_${AVAILABLE_ROOM}%`, replaceValue: Number(availableRoomTotal).toLocaleString() },
			{ searchValue: `%CUR_${SOLD_ROOM}%`, replaceValue: Number(soldRoomTotal).toLocaleString() },
		],
		_tourismAccomodationData: {
			room: {
				total: roomTotal,
				available: availableRoomTotal,
				sold: soldRoomTotal,
			},
		},
	};
}

async function getGuestStatistic(filters, prevData) {
	const { from, to, blockId } = filters;
	const prevGuest = prevData.guest;
	const { TOTAL_GUEST, INTERNATIONAL_GUEST, DOMESTIC_GUEST } = REPLACE_KEYS.GUEST;

	const reservations = await models.Reservation.find({
		blockId,
		'dates.date': { $gte: new Date(from).zeroHours() },
	})
		.select('guests')
		.lean();
	const guestIds = reservations.reduce((acc, guest) => {
		guest.guests.forEach(_guest => acc.push(_guest.guestId));
		return acc;
	}, []);

	const guests = await models.Guest.find({ _id: guestIds, country: { $ne: null } }).lean();
	const guestStatistic = guests.reduce(
		(acc, guest) => {
			acc.total += 1;
			const key = guest.country === 'VN' ? 'domestic' : 'international';
			acc[key] += 1;
			return acc;
		},
		{ total: 0, international: 0, domestic: 0 }
	);

	const guestTotal = guestStatistic.total;
	const internationalGuestTotal = guestStatistic.international;
	const domesticGuestTotal = guestStatistic.domestic;

	const prevGuestTotal = calcDataCompareCurAndPrev(guestTotal, prevGuest.total);
	const prevInternationalGuestTotal = calcDataCompareCurAndPrev(internationalGuestTotal, prevGuest.international);
	const prevDomesticGuestTotal = calcDataCompareCurAndPrev(domesticGuestTotal, prevGuest.domestic);

	return {
		_variableReplace: [
			// previous
			{ searchValue: `%PREV_${TOTAL_GUEST}%`, replaceValue: prevGuestTotal },
			{ searchValue: `%PREV_${INTERNATIONAL_GUEST}%`, replaceValue: prevInternationalGuestTotal },
			{ searchValue: `%PREV_${DOMESTIC_GUEST}%`, replaceValue: prevDomesticGuestTotal },
			// Current
			{ searchValue: `%CUR_${TOTAL_GUEST}%`, replaceValue: Number(guestTotal).toLocaleString() },
			{
				searchValue: `%CUR_${INTERNATIONAL_GUEST}%`,
				replaceValue: Number(internationalGuestTotal).toLocaleString(),
			},
			{ searchValue: `%CUR_${DOMESTIC_GUEST}%`, replaceValue: Number(domesticGuestTotal).toLocaleString() },
		],
		_tourismAccomodationData: {
			guest: {
				total: guestTotal,
				international: internationalGuestTotal,
				domestic: domesticGuestTotal,
			},
		},
	};
}

async function getNightStatistic(filters, prevData) {
	const { from, to, blockId } = filters;
	const prevNight = prevData.night;
	const nightStatistic = await models.Reservation.aggregate([
		{
			$match: {
				blockId: ObjectId(blockId),
				'dates.date': { $gte: new Date(from).zeroHours() },
			},
		},
		{
			$project: {
				guests: 1,
				night: {
					$size: {
						$filter: {
							input: '$dates',
							as: 'dateItem',
							cond: { $lte: ['$$dateItem.date', new Date(to).zeroHours()] },
						},
					},
				},
			},
		},
		{ $unwind: '$guests' },
		{
			$lookup: {
				from: 'guest',
				let: { guestId: '$guests.guestId' },
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [{ $eq: ['$$guestId', '$_id'] }, { $ne: ['country', null] }],
							},
						},
					},
					{ $project: { country: 1 } },
				],
				as: 'guests',
			},
		},
		{
			$project: { night: 1, country: { $arrayElemAt: ['$guests.country', 0] } },
		},
		{
			$match: { country: { $ne: null } },
		},
		{
			$group: {
				_id: null,
				international: { $sum: { $cond: { if: { $eq: ['$country', 'VN'] }, then: '$night', else: 0 } } },
				domestic: { $sum: { $cond: { if: { $ne: ['$country', 'VN'] }, then: '$night', else: 0 } } },
				total: { $sum: '$night' },
			},
		},
	]);

	const nightTotal = _.get(nightStatistic, '0.total', 0);
	const internationalNightTotal = _.get(nightStatistic, '0.international', 0);
	const domesticNightTotal = _.get(nightStatistic, '0.domestic', 0);

	const prevNightTotal = calcDataCompareCurAndPrev(nightTotal, prevNight.total);
	const prevInternationalNightTotal = calcDataCompareCurAndPrev(internationalNightTotal, prevNight.international);
	const prevDomesticNightTotal = calcDataCompareCurAndPrev(domesticNightTotal, prevNight.domestic);

	const { TOTAL_NIGHT, INTERNATIONAL_NIGHT, DOMESTIC_NIGHT } = REPLACE_KEYS.NIGHT;

	return {
		_variableReplace: [
			// Previos
			{ searchValue: `%PREV_${TOTAL_NIGHT}%`, replaceValue: prevNightTotal },
			{ searchValue: `%PREV_${INTERNATIONAL_NIGHT}%`, replaceValue: prevInternationalNightTotal },
			{ searchValue: `%PREV_${DOMESTIC_NIGHT}%`, replaceValue: prevDomesticNightTotal },
			// Current
			{ searchValue: `%CUR_${TOTAL_NIGHT}%`, replaceValue: Number(nightTotal).toLocaleString() },
			{
				searchValue: `%CUR_${INTERNATIONAL_NIGHT}%`,
				replaceValue: Number(internationalNightTotal).toLocaleString(),
			},
			{ searchValue: `%CUR_${DOMESTIC_NIGHT}%`, replaceValue: Number(domesticNightTotal).toLocaleString() },
		],
		_tourismAccomodationData: {
			night: {
				total: nightTotal,
				international: internationalNightTotal,
				domestic: domesticNightTotal,
			},
		},
	};
}

function sumObjByKeys(obj, keys) {
	return keys.reduce((acc, key) => {
		acc += _.get(obj, key, 0);
		return acc;
	}, 0);
}

async function getRevenueStatistic(filters, prevData) {
	const { from, to, blockId } = filters;
	const prevRevenueData = prevData.revenue;
	const BOOKING_FEE_KEYS = [
		'roomPrice',
		'extraFee',
		'earlyCheckin',
		'lateCheckout',
		'roomUpgrade',
		'extraPeople',
		'bookingFee',
		'changeDateFee',
		'managementFee',
		'serviceFee',
	];
	const OTHER_FEE_KEYS = [
		'electricFee',
		'waterFee',
		'compensation',
		'cleaningFee',
		'vatFee',
		'internetFee',
		'motobikeFee',
		'carFee',
		'laundryFee',
		'drinkWaterFee',
	];
	const { TOTAL_REVENUE, BOOKING_REVENUE, MINIBAR_REVENUE, OTHER_REVENUE } = REPLACE_KEYS.REVENUE;
	const select = ['minibar', ...BOOKING_FEE_KEYS, ...OTHER_FEE_KEYS, 'from', 'to'].join(' ');

	const bookings = await models.Booking.find({
		blockId,
		from: {
			$gte: from,
			$lt: to,
		},
	})
		.select(select)
		.lean();
	const revenue = bookings.reduce(
		(acc, booking) => {
			let rate = 1;
			const isBookingAfterFilterFrom = moment(booking.to).isAfter(to);
			if (isBookingAfterFilterFrom) {
				rate = moment(booking.from).diffDays(to) / moment(booking.from).diffDays(booking.to);
			}
			acc.booking += sumObjByKeys(booking, BOOKING_FEE_KEYS) * rate;
			acc.other += sumObjByKeys(booking, OTHER_FEE_KEYS) * rate;
			acc.minibar += _.get(booking, 'minibar', 0) * rate;
			return acc;
		},
		{ booking: 0, minibar: 0, other: 0 }
	);
	const totalRevenue = sumObjByKeys(revenue, ['booking', 'minibar', 'other']);

	const prevTotalRevenue = calcDataCompareCurAndPrev(totalRevenue, prevRevenueData.total);
	const prevBookingRevenue = calcDataCompareCurAndPrev(revenue.booking, prevRevenueData.booking);
	const prevMinibarRevenue = calcDataCompareCurAndPrev(revenue.minibar, prevRevenueData.minibar);
	const prevOtherRevenue = calcDataCompareCurAndPrev(revenue.other, prevRevenueData.other);

	return {
		_variableReplace: [
			// Previos
			{ searchValue: `%PREV_${TOTAL_REVENUE}%`, replaceValue: prevTotalRevenue },
			{ searchValue: `%PREV_${BOOKING_REVENUE}%`, replaceValue: prevBookingRevenue },
			{ searchValue: `%PREV_${MINIBAR_REVENUE}%`, replaceValue: prevMinibarRevenue },
			{ searchValue: `%PREV_${OTHER_REVENUE}%`, replaceValue: prevOtherRevenue },
			// Current
			{ searchValue: `%CUR_${TOTAL_REVENUE}%`, replaceValue: Number(totalRevenue).toLocaleString() },
			{ searchValue: `%CUR_${BOOKING_REVENUE}%`, replaceValue: Number(revenue.booking).toLocaleString() },
			{ searchValue: `%CUR_${MINIBAR_REVENUE}%`, replaceValue: Number(revenue.minibar).toLocaleString() },
			{ searchValue: `%CUR_${OTHER_REVENUE}%`, replaceValue: Number(revenue.other).toLocaleString() },
		],
		_tourismAccomodationData: {
			revenue: {
				total: totalRevenue,
				booking: revenue.booking,
				minibar: revenue.minibar,
				other: revenue.other,
			},
		},
	};
}

function getReportCustomVariableByBlockId(customVariables, blockId) {
	if (!_.get(customVariables, 'length', 0)) return '';
	const { value: defaultValue } = customVariables.find(({ blockIds }) => !blockIds);
	const result = customVariables.find(({ value, blockIds }) => {
		if (!_.get(blockIds, 'length', 0)) return;
		const isValid = blockIds.some(_blockId => _blockId.toString() === blockId);
		if (!isValid) return;
		return value;
	});
	return _.get(result, 'value', defaultValue);
}

function getEmployeeStatistic(blockId, data, prevData) {
	const prevEmployee = prevData.employee;
	const {
		TOTAL_EMPLOYEE,
		MANAGER_EMPLOYEE,
		ADMIN_EMPLOYEE,
		HOUSEKEEPING_EMPLOYEE,
		MINIBAR_EMPLOYEE,
		OTHER_EMPLOYEE,
	} = REPLACE_KEYS.EMPLOYEE;
	const defaultDataKeyBy = _.keyBy(data, ({ name }) => name);

	const employeeStatisic = _.values(REPLACE_KEYS.EMPLOYEE).reduce(
		(acc, key) => {
			key = `%CUR_${key}%`;
			const values = _.get(defaultDataKeyBy, [key, 'values'], []);
			acc[key] = getReportCustomVariableByBlockId(values, blockId);
			return acc;
		},
		{
			..._.values(REPLACE_KEYS.EMPLOYEE).reduce((acc, key) => {
				acc[`%CUR_${key}%`] = 0;
				return acc;
			}, {}),
		}
	);

	const prevTotal = calcDataCompareCurAndPrev(employeeStatisic[`%CUR_${TOTAL_EMPLOYEE}%`], prevEmployee.total);
	const prevManagerTotal = calcDataCompareCurAndPrev(
		employeeStatisic[`%CUR_${MANAGER_EMPLOYEE}%`],
		prevEmployee.total
	);
	const prevAdminTotal = calcDataCompareCurAndPrev(employeeStatisic[`%CUR_${ADMIN_EMPLOYEE}%`], prevEmployee.total);
	const prevHousekeepingTotal = calcDataCompareCurAndPrev(
		employeeStatisic[`%CUR_${HOUSEKEEPING_EMPLOYEE}%`],
		prevEmployee.total
	);
	const prevMinibarTotal = calcDataCompareCurAndPrev(
		employeeStatisic[`%CUR_${MINIBAR_EMPLOYEE}%`],
		prevEmployee.total
	);
	const prevOtherTotal = calcDataCompareCurAndPrev(employeeStatisic[`%CUR_${OTHER_EMPLOYEE}%`], prevEmployee.total);

	return {
		_variableReplace: [
			// Previos
			{ searchValue: `%PREV_${TOTAL_EMPLOYEE}%`, replaceValue: prevTotal },
			{ searchValue: `%PREV_${MANAGER_EMPLOYEE}%`, replaceValue: prevManagerTotal },
			{ searchValue: `%PREV_${ADMIN_EMPLOYEE}%`, replaceValue: prevAdminTotal },
			{ searchValue: `%PREV_${HOUSEKEEPING_EMPLOYEE}%`, replaceValue: prevHousekeepingTotal },
			{ searchValue: `%PREV_${MINIBAR_EMPLOYEE}%`, replaceValue: prevMinibarTotal },
			{ searchValue: `%PREV_${OTHER_EMPLOYEE}%`, replaceValue: prevOtherTotal },
			// Current
			..._.values(REPLACE_KEYS.EMPLOYEE).map(key => {
				key = `%CUR_${key}%`;
				return { searchValue: key, replaceValue: employeeStatisic[key] };
			}),
		],
		_tourismAccomodationData: {
			employee: {
				...[
					['total', TOTAL_EMPLOYEE],
					['manager', MANAGER_EMPLOYEE],
					['admin', ADMIN_EMPLOYEE],
					['housekeeping', HOUSEKEEPING_EMPLOYEE],
					['minibar', OTHER_EMPLOYEE],
					['other', OTHER_EMPLOYEE],
				].reduce((acc, [key, valueKey]) => {
					acc[key] = employeeStatisic[`%CUR_${valueKey}%`];
					return acc;
				}, {}),
			},
		},
	};
}

async function getVariableReplaces(filters, prevData) {
	const variableReplaces = [];
	const tourismAccomodationData = {};

	await _.keys(REPLACE_KEYS).asyncForEach(async key => {
		const { _variableReplace, _tourismAccomodationData } = await getStatistic({ key, filters, prevData });
		if (!_.get(_variableReplace, 'length', 0)) return;
		variableReplaces.push(..._variableReplace);
		Object.assign(tourismAccomodationData, _tourismAccomodationData);
	});

	return { variableReplaces, tourismAccomodationData };
}

async function createTourismAccomodationReport({ blockId, user, data, from }) {
	const _data = {
		blockId,
		forMonth: moment(from).format('YYYY-MM'),
		by: user.id,
		data,
	};
	const tourismAccomodationReport = await models.TourismAccommodationReport.create(_data);
	return tourismAccomodationReport;
}

async function getTourismAccommodationReport({ id, from, to, blockId, block, user, exportDate }) {
	if (!block && !blockId) throw new ThrowReturn('BlockId does not exist');
	if (!block) {
		block = await models.Block.findById(blockId).lean();
		if (!block) throw new ThrowReturn('BlockId does not exist');
	}
	const results = [];
	const blockShortName = _.lowerCase(_.get(block, 'info.shortName[0]', '').replace(/\//g, '-')).replace(/\s/g, '');
	const fileDir = `report/tourismAccommodation/${moment(from).format('MM-Y')}/${blockShortName}`;
	const fileName = `Biên bản báo cáo kết quả kinh doanh của tổ chức, cá nhân kinh doanh dịch vụ lưu trú du lịch ${_.get(
		block,
		'info.name'
	)} (${moment(from).format('MM-Y')}).pdf`;
	const pathName = `bb-tourism-accommodation-${blockShortName}-${moment(from).format('MM-Y')}.pdf`;
	const urlForReview = `${UPLOAD_CONFIG.FULL_URI_DOC}/${fileDir}/${pathName}`;
	const date = moment(from);
	exportDate = moment(exportDate);

	const reportTemplate = await models.ReportTemplate.findById(id).lean();
	if (!reportTemplate) throw new ThrowReturn('Report template does not exist');
	const reportCustomVariablesKeyBy = _.keyBy(reportTemplate.customVariables, ({ name }) => name);

	const address = _.get(block, 'info.address', '');
	const blockName = _.get(block, 'info.name', '');
	const taxNumber = getReportCustomVariableByBlockId(
		_.get(reportCustomVariablesKeyBy, '%TAX_NUMBER%.values', []),
		blockId
	);
	const type = getReportCustomVariableByBlockId(_.get(reportCustomVariablesKeyBy, '%TYPE%.values', []), blockId);
	const rank = getReportCustomVariableByBlockId(_.get(reportCustomVariablesKeyBy, '%RANK%.values', []), blockId);
	const phone = getReportCustomVariableByBlockId(_.get(reportCustomVariablesKeyBy, '%PHONE%.values', []), blockId);
	const email = getReportCustomVariableByBlockId(_.get(reportCustomVariablesKeyBy, '%EMAIL%.values', []), blockId);

	const defaultVariableReplaces = [
		{ searchValue: '%MONTH%', replaceValue: date.month() + 1 },
		{ searchValue: '%YEAR%', replaceValue: date.year() },
		{ searchValue: '%ADDRESS%', replaceValue: address },
		{ searchValue: '%BLOCK_NAME%', replaceValue: blockName },
		{ searchValue: '%TAX_NUMBER%', replaceValue: taxNumber },
		{ searchValue: '%TYPE%', replaceValue: type },
		{ searchValue: '%RANK%', replaceValue: rank },
		{ searchValue: '%PHONE%', replaceValue: phone },
		{ searchValue: '%EMAIL%', replaceValue: email },

		{ searchValue: '%EXPORT_DATE%', replaceValue: exportDate.date() },
		{ searchValue: '%EXPORT_MONTH%', replaceValue: exportDate.month() + 1 },
		{ searchValue: '%EXPORT_YEAR%', replaceValue: exportDate.year() },
	];

	const prevData = await getPrevData({
		blockId,
		forMonth: moment(from).subtract(1, 'y').format('YYYY-MM'),
	});
	const {
		_variableReplace: employeeCustomVariableReplaces,
		_tourismAccomodationData: tourismAccomodationEmployeeData,
	} = getEmployeeStatistic(blockId, reportTemplate.customVariables, prevData);
	const { variableReplaces: customVariableReplaces, tourismAccomodationData } = await getVariableReplaces(
		{ blockId, from, to },
		prevData
	);

	await createTourismAccomodationReport({
		data: { ...tourismAccomodationEmployeeData, ...tourismAccomodationData },
		user,
		from,
		blockId,
	});

	customVariableReplaces.push(...employeeCustomVariableReplaces);

	const replaceAllPipe = [...defaultVariableReplaces, ...customVariableReplaces];

	reportTemplate.body.forEach(templateItem => {
		templateItem.text = replaceAllPipe.reduce(
			(acc, { searchValue, replaceValue }) => acc.replaceAll(searchValue, `${replaceValue}`),
			templateItem.text
		);
		results.push(templateItem);
	});
	return {
		data: results,
		style: reportTemplate.style,
		block,
		from,
		user,
		resourceFolder: reportTemplate.resourceFolder,
		fileDir,
		fileName,
		pathName,
		urlForReview,
	};
}

module.exports = getTourismAccommodationReport;
