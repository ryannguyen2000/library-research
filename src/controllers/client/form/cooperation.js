const _ = require('lodash');
const moment = require('moment');
const { parsePhoneNumber } = require('libphonenumber-js');

// const ThrowReturn = require('@core/throwreturn');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
const models = require('@models');
const OTT = require('@ott/ott');
const { throwError, ERROR_CODE } = require('../error');

async function sendMsg(data) {
	const setting = await models.Setting.getSetting(Settings.PhoneToSendCoop);

	const recipients = _.compact(setting.value.split(';'));
	if (!recipients.length) {
		logger.error('cooperation not found recipients', data);
		return;
	}

	const primaryGroup = await models.UserGroup.findOne({ primary: true });
	const text = _.compact([
		'Liên hệ hợp tác',
		`Tên: ${data.name}`,
		`SĐT: ${data.phone}`,
		data.note && `Ghi chú: ${data.note}`,
	]).join('\n');

	await recipients.asyncForEach(async recipient => {
		const [ottName, recPhone] = recipient.split('#');

		const sender = await models.Ott.findOne({
			active: true,
			public: true,
			[ottName]: true,
			groupIds: primaryGroup._id,
		});

		if (!sender) {
			logger.error('cooperation not found sender', recipient);
			return;
			// throw new ThrowReturn('Không tìm thấy thông tin OTT tương ứng!');
		}

		const result = await OTT.sendMessage({ sender, ottName, phone: recPhone, text });
		if (result.error_code) {
			logger.error('cooperation sendMessage error', sender.phone, ottName, recPhone, text, result);
			// throw new ThrowReturn(result.error_msg);
		}
	});
}

async function sendCoopInfo(body, language) {
	const { name, phone, note } = body;

	if (!name) {
		// throw new ThrowReturn('Hãy nhập tên / Please typein your name!');
		return throwError(ERROR_CODE.INVALID_GUEST_NAME, language);
	}

	if (!phone || !parsePhoneNumber(phone, 'VN').isValid()) {
		// throw new ThrowReturn('Số điện thoại không hợp lệ / Invalid phone number!');
		return throwError(ERROR_CODE.INVALID_GUEST_PHONE, language);
	}

	const exist = await models.FormCoop.findOne({ phone, createdAt: { $gte: moment().add(-1, 'day').toDate() } });
	if (exist) {
		return throwError(ERROR_CODE.FORM_ALREADY_SUMITTED, language);

		// throw new ThrowReturn('Bạn đã gửi thông tin trước đó / Your information already submitted!');
	}

	const doc = await models.FormCoop.create({
		name,
		phone,
		note,
	});

	sendMsg(doc)
		.then(() => {
			doc.sentTime = new Date();
			return doc.save();
		})
		.catch(e => {
			logger.error(e);
		});
}

module.exports = { sendCoopInfo };
