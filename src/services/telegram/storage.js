const _ = require('lodash');
const mongoose = require('mongoose');

class CustomStorage {
	constructor(phone) {
		this.phone = phone;
	}

	async set(key, value) {
		// logger.info('storage set', key, value);
		await mongoose.model('Ott').updateOne({ phone: this.phone }, { [`telegramInfo.${key}`]: value });
	}

	async get(key) {
		const config = await mongoose.model('Ott').findOne({ phone: this.phone });
		const rs = _.get(config, `telegramInfo.${key}`) || null;
		// logger.info('storage get', key, rs);
		return rs;
	}
}

module.exports = CustomStorage;
