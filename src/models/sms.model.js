const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

const { StringeeType, SMSBankingPhones, RolePermissons } = require('@utils/const');
const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');
const { getOTTConnection } = require('@src/init/db');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const SMSSchema = new Schema(
	{
		account: String,
		phone: { type: String, index: true },
		mid: { type: String, unique: true },
		read: { type: Boolean, default: false },
		message: String,
		data: Mixed,
		meta: Mixed,
		// meta: {
		// 	amount: Number,
		// 	balance: Number,
		// 	cardNumber: String,
		// 	date: String,
		// },
		isSMSBanking: { type: Boolean, default: false },
		isIgnore: { type: Boolean, default: false },
		payoutId: [
			{
				type: ObjectId,
				ref: () => require('./payout.model'),
			},
		],
		hasPayout: { type: Boolean, default: false },
		transId: {
			type: String,
			ref: () => require('./bank_transaction.model'),
		},
		hasTransaction: { type: Boolean, default: false },
	},
	{
		timestamps: true,
		toJSON: {
			transform(doc, ret) {
				delete ret.data;
				return ret;
			},
			virtuals: true,
		},
	}
);

SMSSchema.index({
	'data.date': -1,
});
SMSSchema.virtual('date').get(function () {
	return this.data.date;
});

function isIgnoreSMS(text, phone) {
	return (
		phone === SMSBankingPhones[2] &&
		(/VIMO(\d{8,10})_PYO_(\d{16,18})/.test(text) ||
			/(HBTraveloka|CTY TNHH TRAVELOKA VN|COZRUM CHI LUONG|AGODA COMPANY PTE|HOSC _ VNTRIP|LUXVN payment)/i.test(
				text
			))
	);
}
function generateMid(doc) {
	return _.compact([doc.account, doc.phone, doc.data._id, doc.data.thread_id]).join('_');
}

SMSSchema.pre('save', function (next) {
	if (!this.account || !this.phone || !this.data._id) {
		throw new Error(`SMSSchema: ${this.account} | ${this.phone} | ${this.data._id} is null`);
	}

	this.mid = this.mid || generateMid(this);
	this.isSMSBanking = this.isSMSBanking || /\+[0-9.,]+/.test(this.data.body);
	this.isIgnore = this.isIgnore || isIgnoreSMS(this.data.body, this.phone);
	this.meta = _.isEmpty(this.meta) ? this.getMeta() : this.meta;
	this.hasTransaction = !!this.transId;
	this.hasPayout = !!(this.payoutId && this.payoutId.length);

	this.$locals.isNew = this.isNew;
	next();
});

SMSSchema.post('save', function (doc) {
	if (!doc.$locals.isNew || doc.read || !SMSBankingPhones.includes(doc.phone) || !doc.isSMSBanking || doc.isIgnore) {
		return;
	}

	eventEmitter.emit(EVENTS.BANKING_SMS, doc.toJSON());
});

SMSSchema.methods = {
	getMessage(showMoney) {
		const msg = this.data.body || '';
		if (showMoney) return msg;

		return msg
			.replace(/So\s*du[:\s]*\s*([0-9.,-]+)/, 'So du: ***')
			.replace(/SDC:([0-9.,-]+)/, 'SDC:***')
			.replace(/SD ([0-9.,-]+)/, 'SD ***')
			.replace(/TK[:\s]*(\d{4})(\d+)(\d{4})/, 'TK $1***$3');
	},

	getMeta() {
		const [, , amount] = this.data.body.match(/(GD:)([+|-]*[\d{3}|,]*)(VND|USD)*/) || [];
		const [, , balance] = this.data.body.match(/(SDC:)([+|-]*[\d{3}|,]*)(VND|USD)*/) || [];
		const [, , cardNumber] = this.data.body.match(/(THE=)([\d|*]*)/) || [];
		const [date] = this.data.body.match(/\d{2}\/\d{2}\/\d{4}/) || [];

		const mdate = moment(date, 'DD/MM/YYYY');
		return _.pickBy({
			amount: Number(_.replace(amount, /,/g, '')),
			balance: Number(_.replace(balance, /,/g, '')),
			cardNumber,
			date: mdate.isValid() && mdate.format('Y-MM-DD'),
		});
	},
};

SMSSchema.statics = {
	getMessage(doc, showMoney) {
		const msg = _.get(doc, 'data.body') || '';
		if (showMoney) return msg;

		return msg
			.replace(/So\s*du[:\s]*\s*([0-9.,-]+)/, 'So du: ***')
			.replace(/SDC:([0-9.,-]+)/, 'SDC:***')
			.replace(/SD ([0-9.,-]+)/, 'SD ***')
			.replace(/TK[:\s]*(\d{4})(\d+)(\d{4})/, 'TK $1***$3');
	},

	async parseMessages(messages, user) {
		let showMoney = false;
		const items = (_.isArray(messages) ? messages : [messages]).filter(m => m);

		if (items.length) {
			const role = await mongoose.model('RoleGroup').checkPermission(user.role, RolePermissons.SMS_MONEY_VIEW);
			showMoney = role.exists;
		}

		items.forEach(msg => {
			msg.message = this.getMessage(msg, showMoney);
		});
	},

	async createStringeeMissedCall(account, phone, data) {
		try {
			const Stringee = mongoose.model('Stringee');
			if (Stringee.checkSMSIsMissedCall(data)) {
				await Stringee.createLog(account, phone, data, StringeeType.SMS);
			}
		} catch (err) {
			logger.error('createStringeeMissedCall -> err', err);
		}
	},

	async createSMS(account, phone, data) {
		let sms = await this.findOne({ mid: _.compact([account, phone, data._id, data.thread_id]).join('_') });

		if (!sms) {
			sms = await this.create({ account, phone, data });
			await this.createStringeeMissedCall(account, phone, data);
		}

		return sms;
	},
};

let Model;

function getModel() {
	return Model;
}

function setModel(connection) {
	Model = connection.model('SMSMessage', SMSSchema, 'sms');
	return Model;
}

setModel(getOTTConnection());

module.exports = {
	getModel,
	setModel,
};
