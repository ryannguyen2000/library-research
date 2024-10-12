const { CHECK_ITEM_STATUS } = require('@utils/const');

const LOG_FIELDS = ['label', 'taskIds', 'petitionIds', 'status'];
const LOG_FIELDS_LABELS = {
	label: 'Tên danh mục',
	taskIds: 'Danh sách nhiệm vụ',
	petitionIds: 'Danh sách kiến nghị',
	status: 'Trạng thái',
};
const LOG_VALUES_MAPPER = {
	status: {
		[CHECK_ITEM_STATUS.PASS]: 'Đạt',
		[CHECK_ITEM_STATUS.FAIL]: 'Chưa Đạt',
		[CHECK_ITEM_STATUS.DELETED]: 'Hủy',
	},
};

module.exports = {
	LOG_FIELDS,
	LOG_FIELDS_LABELS,
	LOG_VALUES_MAPPER,
};
