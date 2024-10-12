const _ = require('lodash');
const { DB_CONFIG } = require('@config/setting');
const { getOTTConnection } = require('@src/init/db');
const { COLLECTION } = require('./const');

const DB_NAME = _.last(DB_CONFIG.OTT.split('/'));

function User() {
	return getOTTConnection().getClient().db(DB_NAME).collection(COLLECTION.USER);
}

function Message() {
	return getOTTConnection().getClient().db(DB_NAME).collection(COLLECTION.MESSAGE);
}

module.exports = {
	User,
	Message,
};
