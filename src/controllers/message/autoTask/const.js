const { ONE_MINUTE } = require('@utils/const');

const ERROR_MESSAGE = {
	INVALID_BLOCK: 'Vui lòng nhập mã nhà',
	INVALID_SELECTION: 'Số bạn chọn không hợp lệ.',
};

module.exports = {
	DELAY_ASSIGN_TASK: ONE_MINUTE * 5,
	DELAY_ASSIGN_TASK_LONG: ONE_MINUTE * 30,

	COMMAND: {
		EXIT: '00',
		NEXT_CHECK_ITEM: '0',
	},
	PHASE: {
		SELECTOR: 'SELECTOR',
		INPUT: 'INPUT',
	},
	ERROR_MESSAGE,
};
