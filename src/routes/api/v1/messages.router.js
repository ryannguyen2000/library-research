const _ = require('lodash');
const fileUpload = require('express-fileupload');

const { UPLOAD_CONFIG } = require('@config/setting');
const router = require('@core/router').Router();
const models = require('@models');

const message = require('@controllers/message');
const messageOTT = require('@controllers/message/ott');
const messageCampaign = require('@controllers/message/campaign');
const messageStats = require('@controllers/message/stats');
const messageGroup = require('@controllers/message/group');
const { addAssetHistories } = require('@controllers/message/asset_history');

async function syncMessage(req, res) {
	const result = await message.syncMessage(req.data.message);
	res.sendData(result);
}

async function getMessage(req, res) {
	const messages = await message.getMessage(req.data.message);
	res.sendData(messages);
}

async function postMessage(req, res) {
	const { messageId } = req.params;
	const { msg, msgId, reply } = req.body;
	const { user } = req.decoded;

	const result = await message.postMessage({
		message: req.data.message,
		messageId,
		user,
		msg,
		msgId,
		reply,
	});

	res.sendData(result);
}

async function approve(req, res) {
	await message.approveInquiry({
		message: req.data.message,
		user: req.decoded.user,
		roomIds: req.body.roomIds,
	});

	res.sendData();
}

async function decline(req, res) {
	await message.declineInquiry({ user: req.decoded.user, message: req.data.message, msg: req.body.msg });

	res.sendData();
}

async function getTemplates(req, res) {
	const temaples = await models.ChatTemplate.find({ groupIds: { $in: req.decoded.user.groupIds } }).sort({
		order: -1,
	});
	res.sendData({ temaples });
}

async function createTemplate(req, res) {
	const template = await models.ChatTemplate.create({ ...req.body, groupIds: req.decoded.user.groupIds });
	res.sendData({ template });
}

async function updateTemplate(req, res) {
	const { id } = req.params;
	_.unset(req.body, 'groupIds');

	const template = await models.ChatTemplate.findByIdAndUpdate(id, req.body, {
		new: true,
	});
	res.sendData({ template: _.pick(template, _.keys(template)) });
}

async function deleteTemplate(req, res) {
	await models.ChatTemplate.findByIdAndRemove(req.params.id);
	res.sendData();
}

async function changeAttitude(req, res) {
	const { message: msgDoc } = req.data;

	msgDoc.attitude = req.body.attitude;
	await msgDoc.save();

	res.sendData({ attitude: msgDoc.attitude });
}

async function getOTTMessages(req, res) {
	const { user } = req.decoded;

	const result = await messageOTT.getOTTMessages({
		...req.params,
		...req.query,
		inbox: req.data && req.data.inbox,
		user,
	});

	res.sendData(result);
}

async function getOTTTemplates(req, res) {
	const data = await messageOTT.getOTTTemplates({
		...req.query,
		...req.params,
		user: req.decoded.user,
	});

	res.sendData(data);
}

async function getOTTTemplate(req, res) {
	const data = await messageOTT.getOTTTemplate({
		...req.query,
		...req.params,
		user: req.decoded.user,
	});

	res.sendData(data);
}

async function sendOTTTemplate(req, res) {
	const data = await messageOTT.sendOTTTemplate({
		...req.body,
		ottName: req.params.ottName,
		sender: req.query.sender,
		user: req.decoded.user,
	});

	res.sendData(data);
}

async function sendOTTMessage(req, res) {
	const { msg, ...body } = req.body;
	const { user } = req.decoded;
	const { attachments } = req.files || {};

	const result = await messageOTT.sendOTTMessage({
		...req.query,
		...req.params,
		...body,
		inbox: req.data && req.data.inbox,
		user,
		text: msg,
		attachments: _.isArray(attachments) ? attachments : _.compact([attachments]),
	});

	res.sendData(result);
}

async function checkOTTExists(req, res) {
	const { ottName, phone } = req.params;
	const { blockId, recheck, sender } = req.query;
	const { user } = req.decoded;

	const result = await messageOTT.checkOTTExists({
		ottName,
		sender,
		phone,
		blockId,
		user,
		recheck: recheck === 'true',
		inbox: req.data && req.data.inbox,
	});

	res.sendData(result);
}

async function addOTTFriend(req, res) {
	const { user } = req.decoded;

	const result = await messageOTT.addOTTFriend({
		...req.params,
		...req.query,
		user,
		inbox: req.data && req.data.inbox,
	});

	res.sendData(result);
}

async function typingMessage(req, res) {
	message.typingMessage({ mthread: req.data.message, messageId: req.params.messageId, user: req.decoded.user });

	res.sendData();
}

async function addHistoryResources(req, res) {
	const { histories, ottName, assetIds } = req.body;
	const { block, room } = req.data;

	const data = await addAssetHistories({ histories, ottName, assetIds, block, room }, req.decoded.user);

	res.sendData(data);
}

async function getOTTUsers(req, res) {
	const { user } = req.decoded;

	const data = await messageOTT.getOTTUsers(user, {
		...req.params,
		...req.query,
	});

	res.sendData(data);
}

async function forwardOTTMessages(req, res) {
	const { user } = req.decoded;

	const result = await messageOTT.forwardOTTMessages(user, {
		...req.query,
		...req.params,
		...req.body,
	});

	res.sendData(result);
}

async function getMessageTimeline(req, res) {
	const messages = await message.getMessageTimeline(req.data.message, req.query, req.decoded.user);
	res.sendData(messages);
}

async function replyTimeline(req, res) {
	const { user } = req.decoded;
	const { attachments } = req.files || {};

	const result = await message.replyTimeline(
		{
			...req.query,
			...req.params,
			...req.body,
			attachments: _.isArray(attachments) ? attachments : _.compact([attachments]),
		},
		req.data,
		user
	);

	res.sendData(result);
}

router.getS('/templates', getTemplates);
router.postS('/templates', createTemplate);
router.putS('/templates/:id', updateTemplate);
router.deleteS('/templates/:id', deleteTemplate);

router.getS('/campaign', messageCampaign.getCampaigns);
router.getS('/campaign/guest/:id', messageCampaign.getGuestCampaigns);
router.getS('/campaign/:id', messageCampaign.getCampaign);
router.getS('/campaign/:id/guest', messageCampaign.getGuestsCampaign);
router.postS('/campaign/:id/guest', messageCampaign.updateGuestCampaign);
router.postS('/campaign', messageCampaign.createCampaign);
router.putS('/campaign/:id', messageCampaign.updateCampaign);
router.deleteS('/campaign/:id', messageCampaign.deleteCampaign);

router.postS('/ecard', messageCampaign.createEcard);

router.getS('/stats', messageStats.getStats);

router.getS('/:messageId', getMessage);
router.getS('/:messageId/timeline', getMessageTimeline);
router.postS('/:messageId/timeline/reply', fileUpload(UPLOAD_CONFIG.OPTIONS), replyTimeline);

router.postS('/:messageId', postMessage);
router.postS('/:messageId/approve', approve);
router.postS('/:messageId/decline', decline);
router.getS('/:messageId/syn', syncMessage);
router.postS('/:messageId/attitude', changeAttitude);
router.postS('/:messageId/typing', typingMessage);

router.putS('/:messageId/group', messageGroup.updateGroup);
router.postS('/:messageId/group/auto', messageGroup.updateGroupAutoMessage);

router.getS('/ott/:ottName/user', getOTTUsers);

router.getS('/ott/:ottName/template', getOTTTemplates);
router.getS('/ott/:ottName/template/:id', getOTTTemplate);
router.postS('/ott/:ottName/template', sendOTTTemplate);

router.getS('/ott/:ottName/:phone', getOTTMessages);
router.postS('/ott/:ottName/:phone', fileUpload(UPLOAD_CONFIG.OPTIONS), sendOTTMessage);
router.postS('/ott/:ottName/:phone/forward', forwardOTTMessages);
router.getS('/ott/:ottName/:phone/check', checkOTTExists);
router.postS('/ott/:ottName/:phone/addFriend', addOTTFriend);

router.postS('/history/resource', addHistoryResources);

const activity = {
	MESSAGE_APPROVE: {
		key: 'approve',
	},
	MESSAGE_DECLINE: {
		key: 'decline',
	},
	MESSAGE_ATTITUDE: {
		key: 'attitude',
	},
	MESSAGE_ECARD_CREATE: {
		key: 'ecard',
	},
	MESSAGE_CREATE_TEMPLATE: {
		key: '/templates',
		exact: true,
	},
	MESSAGE_UPDATE_TEMPLATE: {
		key: '/templates/{id}',
		method: 'PUT',
		exact: true,
	},
	MESSAGE_DELETE_TEMPLATE: {
		key: '/templates/{id}',
		method: 'DELETE',
		exact: true,
	},
	MESSAGE_SYNC: {
		key: '/syn',
	},
	MESSAGE_CAMPAIGN_GUEST_UPDATE: {
		key: '/campaign/{id}/guest',
	},
	MESSAGE_CAMPAIGN_CREATE: {
		key: '/campaign',
		method: 'POST',
	},
	MESSAGE_CAMPAIGN_UPDATE: {
		key: '/campaign/{id}',
		method: 'PUT',
	},
	MESSAGE_CAMPAIGN_DELETE: {
		key: '/campaign/{id}',
		method: 'DELETE',
	},
	MESSAGE_GROUP_UPDATE_INFO: {
		key: '/{id}/group',
		exact: true,
		method: 'PUT',
	},
	MESSAGE_GROUP_UPDATE_AUTO_MESSAGE: {
		key: '/{id}/group/auto',
		exact: true,
		method: 'POST',
	},
	MESSAGE_SEND_ZNS: {
		key: '/ott/{id}/template',
		exact: true,
		raw: async req => {
			const template = await models.OttTemplate.findById(req.body.templateId).select('templateName');
			const guest = await models.Guest.findById(req.body.guestId);
			const thread = _.get(req.data, 'message');

			return {
				rawText: _.compact([
					`Gửi ZNS ${template.templateName} tới số ${guest.phone}`,
					thread && thread.otaBookingId && `Mã đặt phòng ${thread.otaBookingId}`,
				]).join('. '),
			};
		},
	},
	MESSAGE_SEND: {
		key: '/{id}',
		raw: async req => {
			const thread = _.get(req.data, 'message');
			const otaDoc = await models.BookingSource.findOne({ name: thread.otaName });

			return {
				rawText: `Gửi tin nhắn qua ${otaDoc ? otaDoc.label : thread.otaName}. Mã đặt phòng ${
					thread.otaBookingId
				}`,
			};
		},
	},
	MESSAGE_OTT_SEND: {
		key: '/ott/{id}/{id}',
		exact: true,
		raw: async req => {
			const { ottName, phone } = req.params;
			const thread = _.get(req.data, 'message');
			const otaDoc = await models.BookingSource.findOne({ name: ottName });

			return {
				rawText: _.compact([
					`Gửi tin nhắn qua ${otaDoc ? otaDoc.label : ottName} tới số ${phone}`,
					thread && thread.otaBookingId && `Mã đặt phòng ${thread.otaBookingId}`,
				]).join('. '),
			};
		},
	},
	MESSAGE_OTT_ADD_FRIEND: {
		key: '/ott/{id}/{id}/addFriend',
		exact: true,
		raw: async req => {
			const { ottName, phone } = req.params;
			const thread = _.get(req.data, 'message');
			const otaDoc = await models.BookingSource.findOne({ name: ottName });

			return {
				rawText: _.compact([
					`Gửi yêu cầu kết bạn qua ${otaDoc ? otaDoc.label : ottName} tới số ${phone}.`,
					thread && thread.otaBookingId && `Mã đặt phòng ${thread.otaBookingId}`,
				]).join(' '),
			};
		},
	},
	MESSAGE_OTT_FORWARD: {
		key: '/ott/{id}/{id}/forward',
		exact: true,
		raw: async req => {
			const { ottName } = req.params;
			const { msgIds } = req.body;

			const otaDoc = await models.BookingSource.findOne({ name: ottName });

			return {
				rawText: `Chuyển tiếp tin nhắn qua ${otaDoc ? otaDoc.label : ottName} tới ${_.compact(msgIds).join(
					', '
				)}.`,
			};
		},
	},
	MESSAGE_ADD_RESOURCE_HISTORY: {
		key: '/history/resource',
	},
};

module.exports = { router, activity };
