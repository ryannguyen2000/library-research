const schedule = require('node-schedule');
const moment = require('moment');

const { logger } = require('@utils/logger');
const { reconcile, checkPayTransactionsResult } = require('@controllers/finance/pay_request/reconcile');

const DELAY_MINUTE = 30;

async function checkPayTransactions() {
	try {
		await checkPayTransactionsResult({
			from: moment().subtract(DELAY_MINUTE, 'minute').toDate(),
		});
	} catch (e) {
		logger.error('checkPayTransactions', e);
	}
}

async function autoReconcile() {
	try {
		await reconcile();
	} catch (e) {
		logger.error('getBankReconcileFile', e);
	}
}

schedule.scheduleJob(`*/${DELAY_MINUTE} * * * *`, checkPayTransactions);
schedule.scheduleJob(`20 10-20 * * *`, autoReconcile);
