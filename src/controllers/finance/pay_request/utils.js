const _ = require('lodash');
const { Settings } = require('@utils/setting');
const { MessageVariable, PayoutSources } = require('@utils/const');
const { formatPrice } = require('@utils/func');

function getRemark(request, payout) {
	return (
		_.get(request, 'payDescription') ||
		_.get(payout, 'payDescription') ||
		`${Settings.DefaultPayRemark.value}${payout && payout.export ? ` ${payout.export.noId}` : ''}`
	);
}

function getPaymentMethodTxt(paymentMethod) {
	if (paymentMethod === PayoutSources.CASH) return `bằng TIỀN MẶT`;
	if (paymentMethod === PayoutSources.BANKING) return `qua NGÂN HÀNG`;
	return `qua ${_.upperCase(paymentMethod)}`;
}

function replaceMsg({
	msg,
	mentions,
	user,
	manager,
	otaBookingId,
	amount,
	paymentMethod,
	paymentReport,
	paymentRequest,
}) {
	if (msg.includes(MessageVariable.USER.text)) {
		if (mentions) {
			mentions
				.filter(m => _.toString(m.systemUserId) === _.toString(user._id))
				.forEach(m => {
					msg = msg.replaceAll(MessageVariable.USER.text, `@mention_${m.userId}`);
					delete m.systemUserId;
				});
		} else {
			msg = msg.replaceAll(MessageVariable.USER.text, user.name);
		}
	}
	if (msg.includes(MessageVariable.MANAGER.text)) {
		if (manager && mentions) {
			mentions
				.filter(m => _.toString(m.systemUserId) === _.toString(manager._id))
				.forEach(m => {
					msg = msg.replaceAll(MessageVariable.MANAGER.text, `@mention_${m.userId}`);
					delete m.systemUserId;
				});
		} else {
			msg = msg.replaceAll(MessageVariable.MANAGER.text, manager ? manager.name : 'GD');
		}
	}
	if (msg.includes(MessageVariable.BOOKING_CODE.text)) {
		msg = msg.replaceAll(MessageVariable.BOOKING_CODE.text, `mã đặt phòng ${otaBookingId}`);
	}
	if (msg.includes(MessageVariable.FEE_AMOUNT.text)) {
		msg = msg.replaceAll(MessageVariable.FEE_AMOUNT.text, `số tiền ${formatPrice(amount)}`);
	}
	if (msg.includes(MessageVariable.PAYMENT_METHOD.text)) {
		msg = msg.replaceAll(MessageVariable.PAYMENT_METHOD.text, getPaymentMethodTxt(paymentMethod));
	}
	if (msg.includes(MessageVariable.DC_NO.text)) {
		const noId = _.get(paymentReport, 'noId');
		msg = msg.replaceAll(MessageVariable.DC_NO.text, noId ? `Phiếu chi: ${noId}` : '');
	}
	if (msg.includes(MessageVariable.LC_NO.text)) {
		const no = _.get(paymentRequest, 'no');
		msg = msg.replaceAll(MessageVariable.LC_NO.text, no ? `Lệnh chi: ${no}` : '');
	}

	return msg;
}

module.exports = {
	getRemark,
	replaceMsg,
};
