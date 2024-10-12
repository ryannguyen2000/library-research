const _ = require('lodash');
const { google } = require('googleapis');
const fetch = require('node-fetch');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const EmailClient = require('@services/emailApi/emailClient');
const { LANGUAGE } = require('@utils/const');
const { logger } = require('@utils/logger');
const {
	generateRawMessage,
	convertOutlookToGmailMsg,
	convertGmailToOutlookObj,
	generateReplyOrForwardHtml,
	getAttachmentsFromMessage,
} = require('./helper');
const { LABELS, DEFAULT_USER_ID, DRAFT_TYPE, DEFAULT_LABEL_NAME } = require('./const');

const errfunc = () => {
	throw new ThrowReturn('Invalid route');
};

const KB = 1024;
const GMAIL_URL = 'https://gmail.googleapis.com/gmail/v1';

class GmailApi extends EmailClient {
	constructor({ emailId, scope, accessToken, refreshToken, expiryDate, credential }) {
		super();
		this.emailId = emailId;
		this.scope = scope;
		this.accessToken = accessToken;
		this.refreshToken = refreshToken;
		this.expiryDate = expiryDate;
		this.clientId = credential.clientId;
		this.clientSecret = credential.clientSecret;
		this.redirectURL = credential.redirectURL;
		this.profile = {};
		this.initClient();
	}

	static getClient({ clientId, clientSecret, redirectURL }) {
		return new google.auth.OAuth2(clientId, clientSecret, redirectURL);
	}

	syncToken() {
		this.auth.on('tokens', tokens => {
			this.accessToken = tokens.accessToken;
			models.EmailConfig.updateOne(
				{ _id: this.emailId },
				{ 'info.expiryDate': tokens.expiry_date, 'info.accessToken': tokens.access_token }
			).catch(err => logger.error(err));
		});
	}

	initClient() {
		const auth = new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectURL);
		auth.setCredentials({
			access_token: this.accessToken,
			refresh_token: this.refreshToken,
		});
		this.auth = auth;
		this.syncToken();

		this.gmail = google.gmail({ version: 'v1', auth });
		this.people = google.people({ version: 'v1', auth });
	}

	async call(route = '', method = '', params, options) {
		try {
			const res = await _.get(this, route, errfunc)[method](params, options);
			return res;
		} catch (err) {
			throw new ThrowReturn(err);
		}
	}

	async getLabel(id, lang = LANGUAGE.VI) {
		const { data: label } = await this.call('gmail.users.labels', 'get', { userId: DEFAULT_USER_ID, id });
		const name = _.get(DEFAULT_LABEL_NAME, [label.name, lang], label.name);
		const threadsUnreadQuantity = label.threadsUnread > 0 ? `(${label.threadsUnread})` : '';

		return { ...label, displayName: `${name} ${threadsUnreadQuantity}` };
	}

	async getMailFolders({ lang }) {
		const res = await this.call('gmail.users.labels', 'list', { userId: DEFAULT_USER_ID });

		const labels = await _.get(res, 'data.labels', []).asyncMap(label => this.getLabel(label.id, lang));

		return {
			folders: labels,
			skip: null,
			total: labels.length,
		};
	}

	async getProfile() {
		const profile = await this.call('gmail.users', 'getProfile', { userId: DEFAULT_USER_ID });
		return profile.data || {};
	}

	async getListMessages({ folderId, limit = 10, skipToken, keyword }) {
		const query = { userId: DEFAULT_USER_ID, maxResults: limit };

		if (folderId) query.labelIds = [folderId];
		if (skipToken) query.pageToken = skipToken;
		if (keyword) query.q = keyword;

		const res = await this.call('gmail.users.threads', 'list', query);
		const messages = await _.get(res, 'data.threads', []).asyncMap(thread => this.getLastMessage(thread.id));

		return {
			messages,
			skipToken: res.data.nextPageToken,
			skip: res.data.nextPageToken,
			total: res.data.resultSizeEstimate,
		};
	}

	async getLastMessage(conversationId) {
		const conversation = await this.call('gmail.users.threads', 'get', {
			userId: DEFAULT_USER_ID,
			id: conversationId,
		});
		const { messages } = conversation.data;
		if (!messages.length) return {};

		const avoilTrashMessages = messages.filter(_msg => !_msg.labelIds.includes(LABELS.TRASH));
		const msg = avoilTrashMessages[avoilTrashMessages.length - 1];

		return this.getMsg(null, msg);
	}

	async getMsg(id, msg) {
		if (!msg) {
			const res = await this.call('gmail.users.messages', 'get', { userId: DEFAULT_USER_ID, id });
			msg = res.data || {};
		}

		return convertGmailToOutlookObj(msg);
	}

	async getMessageConversation({ conversationId }) {
		const conversation = await this.call('gmail.users.threads', 'get', {
			id: conversationId,
			userId: DEFAULT_USER_ID,
		});
		const { messages } = conversation.data;
		const msgs = messages
			.filter(msg => !msg.labelIds.includes(LABELS.TRASH))
			.map(msg => convertGmailToOutlookObj(msg));

		return {
			messages: msgs,
			total: conversation.data.messages.length,
		};
	}

	async getAttachmentContentBytes({ messageId, attachmentId }) {
		return this.call(
			'gmail.users.messages.attachments',
			'get',
			{
				userId: DEFAULT_USER_ID,
				messageId,
				id: attachmentId,
			},
			{
				responseType: 'stream',
			}
		);
	}

	async getAttachment({ messageId, attachmentId, filename, mimeType, isInline, ...params }) {
		if (!messageId || !attachmentId) throw ThrowReturn('Missing messageId or attachmentId');

		const attachment = {
			id: attachmentId,
			name: filename,
			contentType: mimeType,
			isInline,
			isLoaded: false,
			...params,
		};
		if (params.size > 500 * KB) {
			return attachment;
		}

		const res = await this.call('gmail.users.messages.attachments', 'get', {
			userId: DEFAULT_USER_ID,
			messageId,
			id: attachmentId,
		});
		const contentBytes = _.get(res, 'data.data', '').replaceAll('-', '+').replaceAll('_', '/');

		return { ...attachment, contentBytes, isLoaded: true };
	}

	async messageAttachments({ messageId }) {
		const res = await this.call('gmail.users.messages', 'get', { userId: DEFAULT_USER_ID, id: messageId });
		const payload = _.get(res, 'data.payload', {});
		const attachmentIds = getAttachmentsFromMessage(payload, []);
		const attachments = await attachmentIds.asyncMap(({ attachmentId, filename, mimeType, ...params }) =>
			this.getAttachment({ messageId, attachmentId, filename, mimeType, ...params })
		);

		return { attachments };
	}

	async readMessageConversation({ messageId, isRead }) {
		const body = { userId: DEFAULT_USER_ID, id: messageId };
		body[isRead ? 'removeLabelIds' : 'addLabelIds'] = [LABELS.UNREAD];

		const res = await this.call('gmail.users.messages', 'modify', body);
		return res.data;
	}

	async sendEmail({ message }, haveThreadId = false) {
		const formatMsg = convertOutlookToGmailMsg({ message });

		const rawMessage = await generateRawMessage(formatMsg);
		const body = {
			userId: DEFAULT_USER_ID,
			resource: { raw: rawMessage },
		};
		if (haveThreadId) body.resource.threadId = message.conversationId;

		const res = await this.call('gmail.users.messages', 'send', body);
		const emailId = _.get(res, 'data.id', '');
		const haveDraft = !!message.craftId;

		if (emailId && haveDraft) {
			await this.deleteDraft({ messageId: message.craftId });
		}

		return emailId;
	}

	async createForward({ messageId }) {
		const draft = await this.createDraft({ messageId, type: DRAFT_TYPE.FORWARD });
		return draft;
	}

	async forwardEmail({ message }) {
		const res = await this.sendEmail({ message }, true);
		return res;
	}

	async createReply({ messageId }) {
		const draft = await this.createDraft({ messageId, type: DRAFT_TYPE.REPLY });
		return draft;
	}

	async replyEmail({ message }) {
		const res = await this.sendEmail({ message }, true);
		return res;
	}

	async createDraft({ messageId, type = DRAFT_TYPE.REPLY }) {
		const isReply = type === DRAFT_TYPE.REPLY;
		const msg = await this.getMsg(messageId);
		msg.body.content = generateReplyOrForwardHtml(msg, type);

		const formatMsg = convertOutlookToGmailMsg({ message: msg, isDraft: true });
		const rawMessage = await generateRawMessage(formatMsg);

		const body = {
			userId: DEFAULT_USER_ID,
			resource: { message: { raw: rawMessage } },
		};

		if (msg.conversationId) body.resource.message.threadId = msg.conversationId;

		const res = await this.call('gmail.users.drafts', 'create', body);

		let emailAddress = _.get(this.profile, 'emailAddress');
		if (!emailAddress) {
			this.profile = await this.getProfile();
			emailAddress = _.get(this.profile, 'emailAddress');
		}

		const draftId = _.get(res, 'data.id', '');
		const toRecipients = isReply ? [msg.sender] : [];
		const originalSubject = _.get(msg, 'subject').replace('Re: ', '').replace('Fwd: ', '');

		const draft = {
			...msg,
			id: draftId,
			subject: isReply ? `Re: ${originalSubject}` : `Fwd: ${originalSubject}`,
			sender: { emailAddress: { name: emailAddress, address: emailAddress } },
			toRecipients,
			ccRecipients: [],
			bccRecipients: [],
			isDraft: true,
			labels: [LABELS.DRAFT],
		};

		return { craft: draft };
	}

	async deleteDraft({ messageId }) {
		const res = await this.call('gmail.users.drafts', 'delete', { userId: DEFAULT_USER_ID, id: messageId });
		return res.data;
	}

	async deleteMessage({ messageId }) {
		const res = await this.call('gmail.users.messages', 'delete', { userId: DEFAULT_USER_ID, id: messageId });
		return res.data;
	}

	async trashMessage({ messageId }) {
		const res = await this.call('gmail.users.messages', 'trash', { userId: DEFAULT_USER_ID, id: messageId });
		return res.data;
	}

	async undoMessage({ messageId }) {
		const res = await this.call('gmail.users.messages', 'untrash', { userId: DEFAULT_USER_ID, id: messageId });
		return res.data;
	}

	async addressAutocomple({ keyword = '' }) {
		const params = { query: keyword, readMask: 'emailAddresses' };
		const [contacts, otherContacts] = await Promise.all([
			this.call('people.otherContacts', 'search', params),
			this.call('people.people', 'searchContacts', params),
		]);
		const peoples = [..._.get(contacts, 'data.results', []), ..._.get(otherContacts, 'data.results', [])];
		const emailAddresses = [];

		peoples.forEach(({ person }) => {
			const addresses = person.emailAddresses.map(emailAddress => emailAddress.value);
			emailAddresses.push(...addresses);
		});

		return emailAddresses;
	}
}

module.exports = GmailApi;
