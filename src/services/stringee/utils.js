const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayOfWeek(day) {
	day = day || new Date();

	return daysOfWeek[day.getDay()];
}

module.exports = {
	daysOfWeek,
	getDayOfWeek,
};
