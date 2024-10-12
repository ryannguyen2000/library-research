const _ = require('lodash');
const moment = require('moment');

const models = require('@models');
const { TaskStatus, CHECK_ITEM_STATUS, PETITION_STATUS } = require('@utils/const');
const BlockConfig = require('@controllers/block/config');
const { UPLOAD_CONFIG } = require('@config/setting');
const Petition = require('../petition');
const { getCompressImages } = require('../compress');

function getPetitionTxt(preCheckItem, checkItem) {
	const _checkItem =
		_.get(checkItem, 'petitionIds.length', 0) || _.get(checkItem, 'taskIds.length', 0) ? checkItem : preCheckItem;
	const taskIds = _.get(_checkItem, 'taskIds', []);
	const petitions = _.get(_checkItem, 'petitionIds', []);

	let taskTxt = '';
	if (taskIds.length) {
		const TaskNo = _checkItem.taskIds
			.map(task => `No.${task.no} trong tháng ${moment(task.time).format('MM/YYYY')}`)
			.join(', ');
		taskTxt = `Kiến nghị thực hiện trên nhiệm vụ: ${TaskNo}.`;
	}

	const petitionTxt = petitions.reduce((_text, petition) => {
		let txt = '';
		if (petition.reportText) txt += _.upperFirst(petition.reportText);
		if (petition.replyText) txt += `, ${_.lowerFirst(petition.replyText)}`;
		_text += `${txt}.`;

		return _text;
	}, '');

	return `${petitionTxt} ${taskTxt}`;
}

const getTaskCheckItems =
	(_bodyItem, _checkListKeyBy, _remainPetitions, newCheckListAttachments) => checkListCategoryId => {
		const taskCheckList = _checkListKeyBy[checkListCategoryId] || [];
		const checkListCategoryName = _.get(taskCheckList, '[0].checkListCategoryId.name');
		const preCheckItem = _.get(_remainPetitions, checkListCategoryId, []);

		const getLabelTxt = label =>
			_bodyItem.text
				.replace('%CHECK_LIST_CATEGORY_NAME%', checkListCategoryName)
				.replace('%CHECK_LIST_LABEL%', label);

		const rs = taskCheckList.map(item => {
			const checkItem = { petitionIds: item.petitionIds, taskIds: item.taskIds };
			const petitionTxt = item.status === CHECK_ITEM_STATUS.FAIL ? getPetitionTxt(preCheckItem, checkItem) : '';
			const text = getLabelTxt(petitionTxt || item.label || '');
			item.attachments = _.map(item.attachments, attachment => newCheckListAttachments[attachment]);
			return { ..._bodyItem, attachments: item.attachments, NEW: 'NEW', text };
		});

		return rs;
	};

function getReportBody(templateItem, checkListGrBy, remainPetitions, pcccCategoryIds, newCheckListAttachments) {
	const body = templateItem.body.reduce((_body, bodyItem) => {
		if (!bodyItem.checkListCategories) {
			_body.push(bodyItem);
			return _body;
		}

		const checkListCategoryIds = bodyItem.checkListCategories.map(categoryId => categoryId.toString());
		const sortingCheckListCategories = pcccCategoryIds.filter(categoryId =>
			checkListCategoryIds.includes(categoryId)
		);

		const taskCheckList = _.flatten(
			sortingCheckListCategories.map(
				getTaskCheckItems(bodyItem, checkListGrBy, remainPetitions, newCheckListAttachments)
			)
		);

		_body.push(...taskCheckList);
		return _body;
	}, []);

	return body;
}

async function getPCCCReport({ id, from, to, blockId, block, user, exportDate, forceCompress }) {
	let results = [];
	let ADDRESS = '';
	let BLOCK_NAME = '';

	const taskFilter = { status: TaskStatus.Done };

	if (from) {
		_.set(taskFilter, ['time', '$gte'], new Date(from).minTimes());
	}
	if (to) {
		_.set(taskFilter, ['time', '$lte'], new Date(to).maxTimes());
	}

	if (blockId) {
		taskFilter.blockId = blockId;
		ADDRESS = _.get(block, 'info.address');
		BLOCK_NAME = _.get(block, 'info.name');
	}

	const pcccCategory = await models.TaskCategory.getPCCC();
	const reportTemplate = await models.ReportTemplate.findById(id).lean();

	const pcccCategories = (await BlockConfig.getCheckListCategories(blockId, pcccCategory._id)) || [];
	const pcccCategoryIds = pcccCategories.map(category => category._id.toString());

	if (reportTemplate) {
		_.set(taskFilter, ['category', '$in'], reportTemplate.taskCategoryIds);
	}

	const tasks = await models.Task.find(taskFilter)
		.populate('createdBy assigned', 'name username')
		.populate({
			path: 'checkList',
			populate: [
				{ path: 'taskIds', match: { status: { $ne: TaskStatus.Deleted } }, select: 'status no time' },
				{ path: 'petitionIds', match: { status: { $ne: PETITION_STATUS.DELETED } } },
				{ path: 'checkListCategoryId' },
			],
		})
		.select('blockId checkList assigned')
		.lean();
	console.log({ tasks });

	const taskAttachments = tasks.flatMap(task => task.checkList).flatMap(checkListItem => checkListItem.attachments);

	const newCheckListAttachments = await getCompressImages(taskAttachments, 5, {
		quality: 30,
		forceCompress,
	});

	const currentTime = moment(exportDate);
	const roundedTime = !exportDate ? currentTime.add(30 - (currentTime.minute() % 30), 'minutes') : currentTime;

	const DATE = `${roundedTime.format('HH:mm')} giờ, ngày ${currentTime.format('DD')} tháng ${currentTime.format(
		'MM'
	)} năm ${currentTime.format('YYYY')}`;

	const taskIds = tasks.map(task => task._id);
	const remainPetitions = await taskIds.asyncMap(taskId => Petition.getRemainPetition(taskId));
	const remainPetitionsGroupBy = _.keyBy(remainPetitions, 'currentTaskId');
	const blockShortName = _.lowerCase(_.get(block, 'info.shortName[0]').replace(/\//g, '-')).replace(/\s/g, '');
	const fileDir = `report/pccc/${moment(from).format('MM-Y')}/${blockShortName}`;
	const fileName = `Biên bản báo cáo pccc ${_.get(block, 'info.name')} (${moment(from).format('MM-Y')}).pdf`;
	const pathName = `bb-pccc-${blockShortName}-${moment(from).format('MM-Y')}.pdf`;
	const urlForReview = `${UPLOAD_CONFIG.FULL_URI_DOC}/${fileDir}/${pathName}`;

	const USERS_CHECK = tasks
		.map(task => task.assigned)
		.flat()
		.map(item => item.name)
		.join(', ');

	const defaultVariableReplaces = [
		{ searchValue: '%DATE%', replaceValue: DATE },
		{ searchValue: '%ADDRESS%', replaceValue: ADDRESS },
		{ searchValue: '%USERS_CHECK%', replaceValue: USERS_CHECK },
		{ searchValue: '%BLOCK_NAME%', replaceValue: BLOCK_NAME },
		{ searchValue: '%URL%', replaceValue: urlForReview },
	];

	const customVariableReplaces = reportTemplate.customVariables.map(variable => {
		let value = '';
		variable.values.some(item => {
			if (item.blockIds && item.blockIds.some(ss => ss.toString() === blockId)) {
				value = item.value;
				return true;
			}
			if (!item.blockIds) {
				value = item.value;
			}
			return false;
		});

		return { searchValue: variable.name, replaceValue: value };
	});

	const replaceAllPipe = [...defaultVariableReplaces, ...customVariableReplaces];

	reportTemplate.body.forEach(templateItem => {
		templateItem.text = replaceAllPipe.reduce(
			(rs, { searchValue, replaceValue }) => rs.replaceAll(searchValue, replaceValue),
			templateItem.text
		);

		if (templateItem.body && templateItem.text && tasks) {
			const newTemplateItems = tasks.map((task, index) => {
				const checkList = task.checkList.filter(item => item.status !== CHECK_ITEM_STATUS.DELETED);
				const checkListGrBy = _.groupBy(checkList, item =>
					_.get(item, 'checkListCategoryId._id', '').toString()
				);
				const remainPetition = remainPetitionsGroupBy[task._id.toString()];
				const body = getReportBody(
					templateItem,
					checkListGrBy,
					remainPetition,
					pcccCategoryIds,
					newCheckListAttachments
				);
				const text = templateItem.text.replaceAll('%TASK_INDEX%', tasks.length > 1 ? `Đợt ${index + 1}: ` : '');
				return { ...templateItem, text, body };
			});
			return results.push(...newTemplateItems);
		}
		results.push(templateItem);
	});

	return {
		data: results,
		style: reportTemplate.style,
		block,
		from,
		user,
		resourceFolder: reportTemplate.resourceFolder,
		fileDir,
		fileName,
		pathName,
		urlForReview,
	};
}

module.exports = getPCCCReport;
