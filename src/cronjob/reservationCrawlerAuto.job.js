const schedule = require('node-schedule');
const { OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const { getReservationsOfOTAs } = require('@controllers/sync/crawler');

schedule.scheduleJob('*/27 * * * *', () => {
	const otas = [OTAs.Go2joy, OTAs.Expedia, OTAs.Ctrip, OTAs.Traveloka, OTAs.Agoda];
	getReservationsOfOTAs(otas).catch(e => logger.error(e));
});

schedule.scheduleJob('*/13 * * * *', () => {
	const otas = [OTAs.Mytour, OTAs.Booking];
	getReservationsOfOTAs(otas).catch(e => logger.error(e));
});

// schedule.scheduleJob('*/40 * * * *', () => {
// 	const otas = [OTAs.Agoda];
// 	getReservationsOfOTAs(otas).catch(e => logger.error(e));
// });
