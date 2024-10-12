/* eslint-disable class-methods-use-this */
const _ = require('lodash');
const { DB_CONFIG } = require('@config/setting');
const { getOTTConnection } = require('@src/init/db');

const DB_NAME = _.last(DB_CONFIG.OTT.split('/'));
const USER_COLLECTION = 'zalo_users';
const MSG_COLLECTION = 'zalo_messages';

function User() {
	return getOTTConnection().getClient().db(DB_NAME).collection(USER_COLLECTION);
}

function Message() {
	return getOTTConnection().getClient().db(DB_NAME).collection(MSG_COLLECTION);
}

module.exports = {
	User,
	Message,
};
