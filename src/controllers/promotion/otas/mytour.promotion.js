const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { groupDates, rangeDate } = require('@utils/date');

const URI = 'https://gate.mytour.vn';

function formatDate(date) {
	return moment(date).format('DD-MM-Y');
}

async function create({
	otaInfo,
	data: { id, discountAmount, ...data },
	propertyId,
	listingIds,
	rateIds,
	ratePlanIds,
}) {
	const uri = id
		? `${URI}/hms-premium/promotions/update?hotelId=${propertyId}&id=${id}`
		: `${URI}/hms-premium/promotions/create?hotelId=${propertyId}`;

	const body = {
		...data,
		rootHotelId: propertyId,
		rooms: listingIds.map(listingId => {
			return {
				id: listingId,
				standardAdult: 2,
				ratePlans: rateIds.map(rateId => {
					return {
						active: true,
						id: rateId,
						amounts: [
							{
								discountStandardFri: discountAmount,
								discountStandardMon: discountAmount,
								discountStandardSat: discountAmount,
								discountStandardSun: discountAmount,
								discountStandardThu: discountAmount,
								discountStandardTue: discountAmount,
								discountStandardWed: discountAmount,
								guest: 2,
							},
						],
					};
				}),
			};
		}),
	};
	if (id) body.id = id;

	const results = await fetchRetry(
		uri,
		{
			method: id ? 'PUT' : 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	).then(res => res.json());

	if (results.code === 200) {
		return {
			data,
			meta: {
				propertyId,
				listingIds,
				rateIds,
				ratePlanIds,
				id: results.data,
			},
		};
	}
	throw new Error(
		`Mytour ${id ? 'update' : 'create'} promotion error, body: ${JSON.stringify(body)}, res: ${JSON.stringify(
			results
		)}`
	);
}

async function update({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({ otaInfo, data: { ...data, id: meta.id }, propertyId, listingIds, rateIds, ratePlanIds });
}

async function set({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({
		otaInfo,
		data: {
			...data,
			id: meta.id,
		},
		propertyId,
		listingIds: _.uniq(listingIds),
		rateIds,
		ratePlanIds,
	});
}

async function clear({ otaInfo, propertyId, data, meta }) {
	if (!meta.id) {
		return { data, meta: null };
	}

	const uri = `${URI}/hms-premium/promotions/status?hotelId=${propertyId}&id=${meta.id}&status=-1`;
	const result = await fetchRetry(
		uri,
		{
			method: 'PUT',
		},
		otaInfo
	).then(res => res.json());

	if (result.code !== 200) {
		throw new Error(`Mytour clear promotion error ${JSON.stringify(result)}`);
	}

	return { data, meta: null }; // return meta for reuse ota promotion.
}

function getDays(days) {
	if (!days || days === '1111111') return [];
	const allDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
	return allDays.filter((d, i) => days[i] === '1');
}

function getBlackoutDates(days, start, end) {
	if (!days || days === '1111111') return [];
	const mapper = ['2', '3', '4', '5', '6', '7', '1'];
	const dayMapped = days
		.split('')
		.map((d, i) => (d === '1' ? mapper[i] : null))
		.filter(d => d);

	const dates = groupDates(rangeDate(start, end).toArray(), dayMapped);
	return dates.map(([from, to]) => ({
		from: formatDate(from),
		to: formatDate(to),
	}));
}

const PROMO_TYPE = {
	basic: 'CUSTOM',
	last_minute: 'LASTMIN',
	early_bird: 'EARLYBIRD',
	early_booker: 'EARLYBIRD',
};
const PROMO_TYPE_ID = {
	basic: 5,
	last_minute: 1,
	early_bird: 2,
	early_booker: 2,
};

function generate(data) {
	const code = PROMO_TYPE[data.promoType];
	if (!code) return;

	const promotionTypeId = PROMO_TYPE_ID[data.promoType];

	const rs = {
		code,
		promotionTypeId,
		name: data.name,
		durationFrom: formatDate(data.startDate),
		durationTo: formatDate(data.endDate),
		minimumQualifiedNight: 1,
		maximumQualifiedNight: 30,
		applyBookingFrom: formatDate(data.bookStartDate),
		applyBookingTo: formatDate(data.bookEndDate),
		applyTimeInDay: false,
		quantity: -1000000,
		applyTimePromotionOption: 'STAY_PERIOD',
		discountType: 'PERCENTAGE',
		discountAmount: data.discount_amount,
		memberOnly: false,
		bookingAllDays: true,
		bookingPolicy: {
			bookingOnWeekdays: getDays(data.bookDayOfWeeks),
			restrictOn: null,
		},
		description: null,
		configBasic: true,
		buyPrice: true,
		blackoutDates: getBlackoutDates(data.dayOfWeeks, data.startDate, data.endDate),
		status: 1,
		rateTypeId: 1,
	};

	if (code === PROMO_TYPE.basic) {
		//
	} else if (code === PROMO_TYPE.last_minute) {
		rs.applyBeforeDayArrival = data.last_minute_amount_days;
		rs.applyBookingFrom = null;
		rs.applyBookingTo = null;
	} else if (code === PROMO_TYPE.early_bird) {
		rs.applyBeforeDayArrival = data.early_booker_amount;
	}

	return rs;
}

module.exports = {
	create,
	update,
	set,
	clear,
	generate,
};
