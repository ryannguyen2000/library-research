const ONE_HOUR = 60 * 60 * 1000;

function createCache() {
	const CalendarData = {};
	function addCalendar(syncId) {
		if (!CalendarData[syncId]) {
			CalendarData[syncId] = {
				createdAt: new Date(),
			};
		}

		const calendars = CalendarData[syncId];
		return calendars;
	}

	function deleteCalendar(syncId) {
		CalendarData[syncId] = undefined;
		delete CalendarData[syncId];

		Object.keys(CalendarData).forEach(id => {
			const calendars = CalendarData[id];
			if (!calendars) {
				return;
			}

			const diff = Date.now() - calendars.createdAt.getTime();
			if (diff > 3 * ONE_HOUR) {
				CalendarData[syncId] = undefined;
				delete CalendarData[syncId];
			}
		});

		return CalendarData;
	}

	function getCalendar(syncId) {
		if (!CalendarData[syncId]) {
			return {};
		}

		const calendars = CalendarData[syncId];
		return calendars;
	}

	return {
		addCalendar,
		deleteCalendar,
		getCalendar,
	};
}

module.exports = {
	createCache,
};
