const { TaskStatus, TaskChecking, TaskWorkingType } = require('@utils/const');

const LOG_FIELDS = [
	'time',
	'startedAt',
	'doneAt',
	'workingType',
	'checking',
	'category',
	'subCategory',
	'workingPoint',
];

const LOG_FIELDS_LABELS = {
	time: 'Thời gian',
	startedAt: 'Thời gian bắt đầu',
	doneAt: 'Thời gian hoàn thành',
	status: 'Trạng thái',
	category: 'Nhiệm vụ',
	subCategory: 'Nhiệm vụ con',
	checking: 'Đánh giá',
	workingType: 'Loại',
	workingPoint: 'Điểm công',
};

const LOG_VALUES_MAPPER = {
	status: {
		[TaskStatus.Waiting]: 'Đang chờ',
		[TaskStatus.Confirmed]: 'Đã xác nhận',
		[TaskStatus.Checked]: 'Đã kiểm',
		[TaskStatus.Doing]: 'Đang thực hiện',
		[TaskStatus.Done]: 'Đã hoàn thành',
		[TaskStatus.Deleted]: 'Đã huỷ',
	},
	checking: {
		[TaskChecking.Pass]: 'KT định kỳ đạt',
		[TaskChecking.PassRandom]: 'KT ngẫu nhiên đạt',
		[TaskChecking.Fail]: 'KT định kỳ không đạt',
		[TaskChecking.FailRandom]: 'KT ngẫu nhiên không đạt',
	},
	workingType: {
		[TaskWorkingType.Normal]: 'Trong giờ',
		[TaskWorkingType.Overtime]: 'Tăng ca',
	},
};

module.exports = {
	LOG_FIELDS,
	LOG_FIELDS_LABELS,
	LOG_VALUES_MAPPER,
};
