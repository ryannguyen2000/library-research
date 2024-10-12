const AsyncLock = require('async-lock');
const { ONE_MINUTE, OTAs } = require('./const');

const SyncLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 10000 });
const OtaHeaderLock = new AsyncLock({ timeout: ONE_MINUTE * 2, maxPending: 1000 });
const CrawlerLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 1000 });
const MessageLock = new AsyncLock({ timeout: ONE_MINUTE * 60, maxPending: 50000 });
const TransactionLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 1000 });
const ReservationLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 10000 });
const ReservateCalendarLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 10000 });
const ReservateCrawlerLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 1000 });
const CashFlowLock = new AsyncLock({ timeout: ONE_MINUTE * 5, maxPending: 20000 });

function getSynchronizeLockKeys(otas) {
	if (!otas || !otas.length) {
		return Object.values(OTAs);
	}
	if (typeof otas[0] === 'string') {
		return otas;
	}
	return otas.map(({ otaName }) => otaName);
}

function getCrawlerLockKeys(otas) {
	const pre = 'CRAWLER_';
	if (Array.isArray(otas)) {
		return otas.map(ota => `${pre}${ota}`);
	}
	return pre + otas;
}

module.exports = {
	SyncLock,
	OtaHeaderLock,
	CrawlerLock,
	TransactionLock,
	MessageLock,
	ReservationLock,
	CashFlowLock,
	ReservateCalendarLock,
	ReservateCrawlerLock,
	getSynchronizeLockKeys,
	getCrawlerLockKeys,
};
