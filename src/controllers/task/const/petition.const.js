const { PETITION_STATUS } = require('@utils/const');

const LOG_FIELDS = ['status', 'reportText', 'replyText', 'expired'];
const LOG_FIELDS_LABELS = {
	reportText: 'Nội dung kiến nghị',
	replyText: 'Nội dung phản hồi',
	status: 'Trạng thái',
	expired: 'Thời hạn',
};
const LOG_VALUES_MAPPER = {
	status: {
		[PETITION_STATUS.WAITING]: 'Đang chờ',
		[PETITION_STATUS.CONFIRMED]: 'Đã xác nhận',
		[PETITION_STATUS.DONE]: 'Đã hoàn thành',
		[PETITION_STATUS.DELETED]: 'Đã hủy',
	},
};

module.exports = {
	LOG_FIELDS,
	LOG_FIELDS_LABELS,
	LOG_VALUES_MAPPER,
};
