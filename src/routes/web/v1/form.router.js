const fileUpload = require('express-fileupload');
const _ = require('lodash');

const { UPLOAD_CONFIG } = require('@config/setting');
const router = require('@core/router').Publish();
const { USER_SYS_NAME } = require('@utils/const');

const invoiceForm = require('@controllers/client/form/invoice');
const refundForm = require('@controllers/client/form/refund');
const coopForm = require('@controllers/client/form/cooperation');

async function sendInvoiceRequest(req, res) {
	const { bookings } = await invoiceForm.sendInvoiceRequest(
		{
			...req.body,
			attachments: req.files && req.files.attachments,
		},
		req.language
	);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(bookings, [0, 'blockId']));

	res.sendData();
}

async function searchInvoiceInfo(req, res) {
	const data = await invoiceForm.searchInvoiceInfo(req.query, req.language);
	res.sendData(data);
}

async function sendRefundRequest(req, res) {
	const { refund, booking } = await refundForm.sendRefundRequest(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(booking, 'blockId'));

	res.json({
		error_code: 0,
		desc: 'Cảm ơn bạn đã gửi thông tin!\nViệc hoàn tiền sẽ được thực hiện nhanh nhất có thể. Nếu có sai sót xin vui lòng phản hồi ngay lại cho chúng tôi bằng tin nhắn hoặc gọi lại cho Hotline số: +84 898 555 889',
		data: { refundId: refund._id },
	});
}

// async function searchRefundInfo(req, res) {
// 	const { otaBookingId } = req.params;
// 	const refund = await refundForm.searchRefundInfo(otaBookingId);
// 	res.sendData({ refund });
// }

async function requestCooperation(req, res) {
	const data = await coopForm.sendCoopInfo(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);

	res.sendData(data);
}

router.getS('/invoice/search', searchInvoiceInfo);
router.postS('/invoice', fileUpload(UPLOAD_CONFIG.OPTIONS), sendInvoiceRequest);
// router.getS('/refund/:otaBookingId', searchRefundInfo);
router.postS('/refund', sendRefundRequest);
router.postS('/cooperation', requestCooperation);

const activity = {
	CLIENT_GUEST_REQUEST_INVOICE: {
		key: '/invoice',
	},
	CLIENT_GUEST_REQUEST_REFUND: {
		key: '/refund',
	},
	CLIENT_GUEST_REQUEST_COOP: {
		key: '/cooperation',
	},
};

module.exports = { router, activity };
