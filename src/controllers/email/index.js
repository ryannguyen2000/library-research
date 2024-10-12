const { google } = require('googleapis');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { MSAL_CONFIG, URL_CONFIG, GMAIL_CONFIG } = require('@config/setting');
const { EMAIL_TYPE, MailAccountStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const { createEmailClient, getAuthorizeUrl } = require('@src/services/emailApi');
const OutlookApi = require('@src/services/emailApi/outlook');
const GmailApi = require('@src/services/emailApi/gmail');
const { uploadFileData } = require('@controllers/resource/upload');

const apis = {};

(async function connect() {
	try {
		const emailAccounts = await models.EmailConfig.find({
			type: { $in: [EMAIL_TYPE.OUTLOOK, EMAIL_TYPE.GMAIL] },
			'info.status': MailAccountStatus.LOG_IN,
		}).lean();

		emailAccounts.forEach(email => {
			const isGmail = email.type === EMAIL_TYPE.GMAIL;
			const config = { emailId: email._id, ...email.info };

			if (isGmail) config.credential = GMAIL_CONFIG.AUTH;

			const newApi = createEmailClient(config, email.type);
			apis[email._id] = newApi;
		});
	} catch (err) {
		logger.error('Connect outlook', err);
	}
})();

async function getAllAccounts(user, isSystem) {
	const query = {
		groupIds: { $in: user.groupIds },
		type: { $in: [EMAIL_TYPE.OUTLOOK, EMAIL_TYPE.GMAIL] },
		'info.status': MailAccountStatus.LOG_IN,
	};
	if (isSystem) query.isSystem = isSystem === 'true';

	const accounts = await models.EmailConfig.find(query)
		.select({
			username: 1,
			email: 1,
			type: 1,
			'info.status': 1,
			'info.mail': 1,
			'info.name': 1,
			signature: 1,
			isSystem: 1,
		})
		.lean();

	return accounts;
}

async function updateEmailConfig(emailId, { signature, ...update }, user) {
	const updateData = _.pick(update, ['isSystem', 'configs', 'subTypes']);
	await models.EmailConfig.updateOne({ _id: emailId }, { $pull: { signature: { userId: user._id } } });
	return models.EmailConfig.updateOne(
		{ _id: emailId },
		{
			$set: { ...updateData },
			$push: { signature: { ...signature, userId: user._id } },
		}
	).catch(err => {
		throw new ThrowReturn(err);
	});
}

async function signIn({ type }) {
	// const msalClient = new msal.ConfidentialClientApplication(msalConfig);
	// const getAuthCodeUrl = await msalClient.getAuthCodeUrl(urlParameters);
	if (!_.values(EMAIL_TYPE).includes(type)) throw new ThrowReturn('Email type does not support');

	let authorizeUrl = await getAuthorizeUrl(type);
	return authorizeUrl;
}

async function outlookRedirect({ code }, res) {
	try {
		const msalClient = OutlookApi.getMsalClient();
		const tokenRequest = {
			code,
			scopes: MSAL_CONFIG.CONFIG.OAUTH_SCOPES.split(','),
			redirectUri: `${MSAL_CONFIG.CONFIG.REDIRECT_URI}`,
		};
		const response = await msalClient.acquireTokenByCode(tokenRequest);
		const msalTokenCache = msalClient.getTokenCache().serialize();
		const refreshTokenObject = JSON.parse(msalTokenCache).RefreshToken;
		const refreshToken = refreshTokenObject[Object.keys(refreshTokenObject)[0]].secret;
		// const user = await models.User.findOne({ _id: userId });
		const primaryGroup = await models.UserGroup.findOne({ primary: true });
		const emailConfig = await models.EmailConfig.findOneAndUpdate(
			{
				'info.username': response.account.username,
				type: EMAIL_TYPE.OUTLOOK,
				groupIds: primaryGroup._id,
			},
			{
				$set: {
					info: {
						...response.account,
						mail: response.account.username,
						expiresOn: response.expiresOn,
						userId: response.account.homeAccountId,
						accessToken: response.accessToken,
						refreshToken,
						status: MailAccountStatus.LOG_IN,
					},
					type: EMAIL_TYPE.OUTLOOK,
					groupIds: [primaryGroup._id],
				},
			},
			{ upsert: true, new: true }
		);

		if (!emailConfig) throw new ThrowReturn('Email does not exist on database');
		apis[emailConfig._id] = new OutlookApi(emailConfig.info);
	} catch (err) {
		logger.error('Redirect', err);
	}
	res.redirect(`${URL_CONFIG.CMS}/settings/ott`);
}

async function gmailRedirect({ code }, res) {
	try {
		const oauth2Client = GmailApi.getClient(GMAIL_CONFIG.AUTH);
		const [{ tokens }, primaryGroup] = await Promise.all([
			oauth2Client.getToken(code),
			models.UserGroup.findOne({ primary: true }).lean(),
		]);

		const { data: userProfile } = await google
			.gmail({
				version: 'v1',
				headers: { Authorization: `Bearer ${tokens.access_token}` },
			})
			.users.getProfile({ userId: 'me' });

		logger.info({ mail: userProfile.emailAddress, ...tokens });

		let emailConfig = await models.EmailConfig.findOne({
			'info.mail': userProfile.emailAddress,
			type: EMAIL_TYPE.GMAIL,
			groupIds: primaryGroup._id,
		});

		if (!emailConfig) {
			emailConfig = await models.EmailConfig.create({
				info: {
					mail: userProfile.emailAddress,
					name: userProfile.emailAddress,
					tokenType: tokens.token_type,
					scope: tokens.scope,
					expiryDate: tokens.expiry_date,
					accessToken: tokens.access_token,
					refreshToken: tokens.refresh_token,
					status: MailAccountStatus.LOG_IN,
				},
				type: EMAIL_TYPE.GMAIL,
				groupIds: [primaryGroup._id],
			});
		}

		if (!emailConfig) throw new ThrowReturn('Email does not exist on database');
		apis[emailConfig._id] = new GmailApi({
			emailId: emailConfig._id,
			...emailConfig.info,
			credential: GMAIL_CONFIG.AUTH,
		});
	} catch (err) {
		logger.error('Redirect', err);
	}

	res.redirect(`${URL_CONFIG.CMS}/settings/ott`);
}

async function signOut(req) {
	const { id } = req.params;
	const result = await models.EmailConfig.updateOne(
		{ _id: id },
		{
			$set: {
				'info.status': MailAccountStatus.LOG_OUT,
			},
		},
		{ upsert: true, new: true }
	);
	if (result.ok) delete apis[id];
	return {
		success: !!result.ok,
	};
}

async function getListMessages(req) {
	const { id } = req.params;
	const { folderId, limit = 10, skip, skipToken, keyword, from, to } = req.query;
	const data = await apis[id].getListMessages({
		folderId,
		limit,
		keyword,
		from,
		to,
		skip,
		skipToken,
	});
	return data;
}

async function getMessageConversation(req) {
	const { id, conversationId } = req.params;
	const data = await apis[id].getMessageConversation({ ...req.query, conversationId });
	return data;
}

async function readMessageConversation(req) {
	const { id } = req.params;
	const data = await apis[id].readMessageConversation({ ...req.body });
	return data;
}

async function messageAttachments(req) {
	const { id, messageId } = req.params;
	const data = await apis[id].messageAttachments({ messageId });
	return data;
}

function getAttachment(req) {
	const { id, messageId, attachmentId } = req.params;
	return apis[id].getAttachmentContentBytes({ messageId, attachmentId });
}

async function getMailFolders(req) {
	const { id } = req.params;
	const data = await apis[id].getMailFolders({ ...req.query, lang: req.language });
	return data;
}

async function sendEmail(req) {
	const { id } = req.params;
	const { message } = req.body;
	const { user } = req.decoded;
	const data = await apis[id].sendEmail({ message, user });
	return data;
}

async function replyEmail(req) {
	const { id } = req.params;
	const { folderId, message } = req.body;
	const data = await apis[id].replyEmail({ folderId, message });
	return data;
}

async function forwardEmail(req) {
	const { id } = req.params;
	const data = await apis[id].replyEmail({ ...req.body });
	return data;
}

async function createReply(req) {
	const { id, messageId } = req.params;
	const data = await apis[id].createReply({ messageId });
	return data;
}

async function createForward(req) {
	const { id, messageId } = req.params;
	const data = await apis[id].createForward({ messageId });
	return data;
}

async function deleteMessage(req) {
	const { id, messageId } = req.params;
	const data = await apis[id].deleteMessage({ messageId });
	return data;
}

async function deleteDraft(req) {
	const { id, messageId } = req.params;
	const data = await apis[id].deleteDraft({ messageId });
	return data;
}

async function undoMessage(req) {
	const { id, messageId } = req.params;
	const data = await apis[id].undoMessage({ messageId });
	return data;
}

async function addressAutocomple(req) {
	const { id } = req.params;
	const { keyword } = req.query;
	const data = await apis[id].addressAutocomple({ keyword });
	return data;
}

// SIGNATURE
async function getSignatures(emailId, { user, isShowContent, isSendNewMail }) {
	isShowContent = isShowContent === 'true';
	const emailConfig = await models.EmailConfig.findById(emailId).select('signature').lean();
	if (!emailConfig) throw new ThrowReturn('Email invalid');

	const defaultKey = isSendNewMail === 'true' ? 'new' : 'replyAndForward';

	const signatureConfig =
		_.find(emailConfig.signature, config => config.userId.toString() === user._id.toString()) || {};
	const isBeforeQuotedText = _.get(signatureConfig, 'isBeforeQuotedText', false);

	const selectedSignatureId = _.get(signatureConfig, [defaultKey], '').toString();
	const defaultSignatureSelected = {
		_id: uuidv4(),
		name: 'Không có chữ ký',
		selected: !selectedSignatureId,
		default: true,
		mailConfigId: emailId,
		content: '',
		isBeforeQuotedText,
	};

	const select = isShowContent ? '' : '-content';
	const signatures = await models.EmailSignature.find({ emailConfigId: emailId, userId: user._id })
		.select(select)
		.lean();

	signatures.forEach(signature => {
		const selected = signature._id.toString() === selectedSignatureId;
		signature.selected = selected;
		signature.default = false;
		signature.isBeforeQuotedText = isBeforeQuotedText;
	});

	signatures.push(defaultSignatureSelected);
	return signatures;
}

async function deleteSignature(emailId, signatureId) {
	const signatureInUse = await models.EmailConfig.findOne({
		_id: emailId,
		signature: { $elemMatch: { $or: [{ new: signatureId }, { replyAndForward: signatureId }] } },
	})
		.select('_id')
		.lean();

	if (signatureInUse) throw new ThrowReturn('Signature in use');
	return models.EmailSignature.deleteOne({ _id: signatureId, emailConfigId: emailId });
}

async function createSignature({ content, attachments, user, ...data }) {
	const signatureContent = await generateSignatureContent(content, attachments, user);
	const signature = await models.EmailSignature.create({ ...data, content: signatureContent, userId: user._id });
	return signature;
}

async function updateSignature(query, { content, attachments, ...update }, user) {
	const { id, signatureId } = query;
	const emailSignature = await models.EmailSignature.findOne({
		emailConfigId: id,
		_id: signatureId,
		userId: user._id,
	});

	const isContentChanged = content !== emailSignature.content;
	const signatureContent = isContentChanged
		? await generateSignatureContent(content, attachments, user)
		: emailSignature.content;

	Object.assign(emailSignature, { ...update, content: signatureContent });
	await emailSignature.save();
}

async function generateSignatureContent(content = '', attachments, user) {
	const filterValidAttachments = _.filter(attachments, attachment => content.includes(attachment.contentId));
	const attachmentUrls = await filterValidAttachments.asyncMap(attachment =>
		uploadFileData(
			{
				user,
				data: attachment.contentBytes,
				fileName: attachment.name,
			},
			false
		).then(file => ({
			contentId: attachment.contentId,
			url: file.url,
		}))
	);
	attachmentUrls.forEach(({ contentId, url }) => {
		content = content.replaceAll(`cid:${contentId}`, url);
	});
	return content;
}

module.exports = {
	getAllAccounts,
	signIn,
	outlookRedirect,
	gmailRedirect,
	signOut,
	getMailFolders,
	getListMessages,
	getMessageConversation,
	messageAttachments,
	getAttachment,
	sendEmail,
	replyEmail,
	createReply,
	createForward,
	deleteDraft,
	deleteMessage,
	readMessageConversation,
	forwardEmail,
	undoMessage,
	addressAutocomple,
	getSignatures,
	createSignature,
	updateSignature,
	updateEmailConfig,
	deleteSignature,
};
