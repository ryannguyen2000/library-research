const mongoose = require('mongoose');

const { DB_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');

let ottConnection;

mongoose.connection
	.on('connected', () => {
		logger.info('mongodb connected');
	})
	.on('disconnected', () => {
		logger.error('mongodb disconnected');
	});

function initDB() {
	return mongoose.connect(DB_CONFIG.MAIN, DB_CONFIG.OPTIONS).catch(err => {
		logger.error('error connect to mongodb', err.toString());
		mongoose.connection.close();
		setTimeout(initDB, 2000);
	});
}

function getOTTConnection(reConnecting) {
	if (!ottConnection) {
		ottConnection = mongoose.createConnection(DB_CONFIG.OTT, DB_CONFIG.OPTIONS);
		ottConnection
			.on('error', err => {
				logger.error('error connect to mongodb ott', err.toString());

				ottConnection.close();
				ottConnection = null;

				getOTTConnection(true);
			})
			.on('disconnected', () => {
				logger.error('mongodb ott disconnected');
			})
			.on('connected', function () {
				logger.info('ott db connected');
				if (reConnecting) {
					require('@models').loadSecondaryModels(this);
				}
			});
	}

	return ottConnection;
}

module.exports = {
	initDB,
	getOTTConnection,
};
