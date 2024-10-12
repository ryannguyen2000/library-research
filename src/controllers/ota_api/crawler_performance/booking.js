const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');

async function request(uri, ota, propertyId) {
	try {
		const results = await fetchRetry(
			`${uri}?hotel_id=${propertyId}&ses=${ota.other.ses}&interval=last90d`,
			null,
			ota
		);
		if (!results.ok) {
			throw new Error(JSON.stringify(results));
		}
		const json = await results.json();
		return json;
	} catch (e) {
		logger.error('Booking get performance error', e);
		return null;
	}
}

async function getRank(ota, propertyId) {
	const uri = 'https://admin.booking.com/fresa/extranet/ranking_dashboard/get_performance_metrics';
	const json = await request(uri, ota, propertyId);
	if (!json) return {};
	return { total_score: json.data.rank_in_city_total, score: json.data.rank_in_city };
}

async function get(ota, propertyId) {
	const uri = 'https://admin.booking.com/fresa/extranet/homePage/get_ranking_details';

	const json = await request(uri, ota, propertyId);
	if (!json || !json.data.timelineData.current_year_data) return [];

	const dates = json.data.timelineData.current_year_data.map(data => ({
		date: new Date(data.yyyy_mm_dd),
		result_views: data.impressions,
		property_views: data.pageviews,
		bookings: data.bookings,
	}));

	const rank = await getRank(ota, propertyId);
	Object.assign(dates[dates.length - 1], rank);

	return dates;
}

module.exports = {
	get,
};
