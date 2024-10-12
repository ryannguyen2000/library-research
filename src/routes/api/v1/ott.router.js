const _ = require('lodash');

const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const { OTTs } = require('@utils/const');
const models = require('@models');
const OTT = require('@ott/ott');
const Email = require('@controllers/email');

function parseQuery(query) {
	_.unset(query, 'start');
	_.unset(query, 'limit');

	const newQuery = {};
	Object.entries(query).forEach(([key, value]) => {
		try {
			newQuery[key] = JSON.parse(value);
		} catch (e) {
			newQuery[key] = value;
		}
	});

	return newQuery;
}

async function getOtts(req, res) {
	const { user } = req.decoded;
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const query = {
		...parseQuery(req.query),
		active: true,
		[OTTs.Facebook]: { $ne: true },
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockId: { $in: blockIds },
			},
		],
	};

	const otts = await models.Ott.find(query);

	res.sendData({ otts });
}

async function createOtt(req, res) {
	const ott = await models.Ott.create({ ...req.body, public: true, groupIds: req.decoded.user.groupIds });

	res.sendData({ ott });
}

async function updateOtt(req, res) {
	const { ottId } = req.params;
	const { user } = req.decoded;
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const ott = await models.Ott.findOneAndUpdate(
		{
			_id: ottId,
			$or: [
				{
					groupIds: { $in: user.groupIds },
				},
				{
					blockId: { $in: blockIds },
				},
			],
		},
		req.body,
		{
			new: true,
		}
	);

	res.sendData({ ott });
}

async function login(req, res) {
	const { ottId, ottName } = req.params;

	let phone;
	let ott;

	if (ottId !== 'newUser') {
		ott = await models.Ott.findById(ottId);
		if (!ott) {
			throw new ThrowReturn('Ott not found');
		}

		({ phone } = ott);
	} else {
		phone = ottId;
	}

	const code = await OTT.login(ottName, phone, ott);

	res.sendData(code);
}

async function loginStatus(req, res) {
	const { ottName, loginId } = req.params;
	const { ottId } = req.query;
	const { user } = req.decoded;

	const ott = ottId ? await models.Ott.findById(ottId) : null;

	const statusRes = await OTT.loginStatus(ottName, loginId, ott);
	if (statusRes.error_code) {
		throw new ThrowReturn(statusRes.error_msg).error_code(statusRes.error_code);
	}

	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const { data } = statusRes;
	if (data && data.phoneNumber) {
		await models.Ott.updateOne(
			{
				phone: data.phoneNumber,
				$or: [
					{
						groupIds: { $in: user.groupIds },
					},
					{
						blockId: { $in: blockIds },
					},
				],
			},
			_.pickBy({
				[ottName]: true,
				[`${ottName}Info.avatar`]: data.avatar,
				[`${ottName}Info.name`]: data.name,
				[`${ottName}Info.createdBy`]: user._id,
			}),
			{ upsert: true }
		);
	}

	res.sendData(data);
}

async function getOauth2(req, res) {
	const { ottName } = req.params;

	const data = await OTT.getOauthUrl({ ...req.query, ottName });

	res.sendData(data);
}

async function emailSignIn(req, res) {
	const { user } = req.decoded;
	const { type } = req.body;
	const data = await Email.signIn({ userId: user._id, type });
	res.sendData(data);
}

async function emailSignOut(req, res) {
	const data = await Email.signOut(req);
	res.sendData(data);
}

async function outlookRedirect(req, res) {
	await Email.outlookRedirect(req.query, res);
}

async function gmailRedirect(req, res) {
	await Email.gmailRedirect(req.query, res);
}

async function getAllAccounts(req, res) {
	const { user } = req.decoded;
	const accounts = await Email.getAllAccounts(user, req.query.isSystem);
	res.sendData({ data: accounts });
}

async function getListMessages(req, res) {
	const data = await Email.getListMessages(req);
	res.sendData(data);
}

async function getMessageConversation(req, res) {
	const data = await Email.getMessageConversation(req);
	res.sendData(data);
}

async function readMessageConversation(req, res) {
	const data = await Email.readMessageConversation(req);
	res.sendData(data);
}

async function messageAttachments(req, res) {
	const data = await Email.messageAttachments(req);
	res.sendData(data);
}

async function messageAttachment(req, res) {
	const { mimeType, filename } = req.query;
	Email.getAttachment(req)
		.then(response => new Promise((resolve, reject) => response.data.on('error', err => reject(err)).pipe(res)))
		.catch(err => {
			res.status(400).send({
				error_code: 1,
				error_msg: `Bad request`,
			});
		});
}

async function getMailFolders(req, res) {
	const data = await Email.getMailFolders(req);
	res.sendData(data);
}

async function sendEmail(req, res) {
	const data = await Email.sendEmail(req);
	res.sendData(data);
}

async function replyEmail(req, res) {
	const data = await Email.replyEmail(req);
	res.sendData(data);
}
async function forwardEmail(req, res) {
	const data = await Email.forwardEmail(req);
	res.sendData(data);
}

async function createReply(req, res) {
	const data = await Email.createReply(req);
	res.sendData(data);
}

async function createForward(req, res) {
	const data = await Email.createForward(req);
	res.sendData(data);
}

async function deleteDraft(req, res) {
	const data = await Email.deleteDraft(req);
	res.sendData(data);
}

async function deleteMessage(req, res) {
	const data = await Email.deleteMessage(req);
	res.sendData(data);
}

async function undoMessage(req, res) {
	const data = await Email.undoMessage(req);
	res.sendData(data);
}

async function getRecipients(req, res) {
	const recipients = await models.EmailRecipients.find();
	res.sendData({ recipients });
}

async function addressAutocomple(req, res) {
	const emailAddresses = await Email.addressAutocomple(req);
	res.sendData({ emailAddresses });
}

async function getSignatures(req, res) {
	const { isShowContent, isSendNewMail } = req.query;
	const signatures = await Email.getSignatures(req.params.id, {
		user: req.decoded.user,
		isShowContent: isShowContent || 'true',
		isSendNewMail: isSendNewMail || 'true',
	});
	res.sendData({ signatures });
}

async function createSignature(req, res) {
	const signature = await Email.createSignature({
		...req.body,
		emailConfigId: req.params.id,
		user: req.decoded.user,
	});
	res.sendData({ signature });
}

async function updateSignature(req, res) {
	const { id, signatureId } = req.params;
	await Email.updateSignature({ id, signatureId }, req.body, req.decoded.user);
	res.sendData();
}

async function deleteSignature(req, res) {
	const { id, signatureId } = req.params;
	await Email.deleteSignature(id, signatureId);
	res.sendData();
}

async function updateEmailConfig(req, res) {
	const { id } = req.params;
	await Email.updateEmailConfig(id, req.body, req.decoded.user);
	res.sendData();
}

router.getS('/', getOtts, true);
router.getS('/loginStatus/:ottName/:loginId', loginStatus, true);
router.postS('/', createOtt, true);
router.putS('/:ottId', updateOtt, true);
router.postS('/login/:ottId/:ottName', login, true);

router.getS('/oauth/:ottName', getOauth2, true);
// Email:
router.getS('/email/signInCallBack', outlookRedirect, false);
router.getS('/email/gmailSignInCallBack', gmailRedirect, false);
router.getS('/email/accounts', getAllAccounts, true);

router.postS('/email/signin', emailSignIn, true);
router.postS('/email/signout/:id', emailSignOut, true);
router.putS('/email/:id', updateEmailConfig, true);
router.postS('/email/:id/sendEmail', sendEmail, true);
router.postS('/email/:id/createReply/:messageId', createReply, true);
router.postS('/email/:id/createForward/:messageId', createForward, true);
router.postS('/email/:id/replyEmail', replyEmail, true);
router.postS('/email/:id/forwardEmail', forwardEmail, true);
router.postS('/email/:id/readMessageConversation', readMessageConversation, true);

router.getS('/email/:id/addressAutocomple', addressAutocomple, true);
router.getS('/email/:id/mailFolders', getMailFolders, true);
router.getS('/email/:id/listMessages', getListMessages, true);
router.getS('/email/:id/conversation/:conversationId', getMessageConversation, true);

router.getS('/email/:id/signature', getSignatures, true);
router.postS('/email/:id/signature', createSignature, true);
router.putS('/email/:id/signature/:signatureId', updateSignature, true);
router.deleteS('/email/:id/signature/:signatureId', deleteSignature, true);

router.getS('/email/:id/messageAttachments/:messageId', messageAttachments, true);
router.getS('/email/:id/messageAttachments/:messageId/:attachmentId', messageAttachment, true);

router.getS('/email/recipients', getRecipients, true);

router.postS('/email/:id/undoMessage/:messageId', undoMessage, true);
router.deleteS('/email/:id/deleteDraft/:messageId', deleteDraft, true);
router.deleteS('/email/:id/deleteMessage/:messageId', deleteMessage, true);

const activity = {
	OTT_LOGIN: {
		key: '/login/{id}/{id}',
		exact: true,
		method: 'POST',
	},
	OTT_CREATE: {
		key: '/',
		exact: true,
		method: 'POST',
	},
	OTT_UPDATE: {
		key: '/{id}',
		exact: true,
		method: 'PUT',
	},
	OTT_EMAIL_SIGN_IN: {
		key: '/email/signin',
		exact: true,
		method: 'POST',
	},
	OTT_EMAIL_SIGN_OUT: {
		key: '/email/signout/{id}',
		exact: true,
		method: 'POST',
	},
	OTT_EMAIL_SEND: {
		key: '/email/{id}/sendEmail',
		exact: true,
		method: 'POST',
	},
	OTT_EMAIL_REPLY: {
		key: '/email/{id}/replyEmail',
		exact: true,
		method: 'POST',
	},
	OTT_EMAIL_FORWARD: {
		key: '/email/{id}/forwardEmail',
		exact: true,
		method: 'POST',
	},
	OTT_EMAIL_READ_MESSAGE: {
		key: '/email/{id}/readMessageConversation',
		exact: true,
		method: 'POST',
	},
	OTT_EMAIL_DELETE_MESSAGE: {
		key: '/email/{id}/deleteMessage/{id}',
		exact: true,
		method: 'DELETE',
	},
};

module.exports = { router, activity };
