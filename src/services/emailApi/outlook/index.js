const _ = require('lodash');
require('isomorphic-fetch');

let msal;
let graph;

try {
	msal = require('@azure/msal-node');
	graph = require('@microsoft/microsoft-graph-client');
} catch (e) {
	console.error(e);
}

const models = require('@models');
const { MSAL_CONFIG } = require('@config/setting');
const EmailClient = require('@services/emailApi/emailClient');

const { encodeToURLFormat, getNextPageQuery } = require('./helper');

const MAX_RETRY = 2;

class OutlookClient extends EmailClient {
	constructor({ refreshToken, expiresOn, accessToken, emailId }) {
		super();
		const msalClient = OutlookClient.getMsalClient();
		this.msalClient = msalClient;
		this.refreshToken = refreshToken;
		this.accessToken = accessToken;
		this.expiresOn = expiresOn;
		this.emailId = emailId;
		this.initClient(accessToken);
	}

	static getMsalClient() {
		return new msal.ConfidentialClientApplication({
			auth: MSAL_CONFIG.AUTH,
			system: {
				loggerOptions: {
					piiLoggingEnabled: false,
					logLevel: msal && msal.LogLevel.Verbose,
				},
			},
		});
	}

	initClient(accessToken) {
		this.client = graph.Client.init({
			authProvider: async done => {
				try {
					done(null, accessToken);
				} catch (err) {
					console.log(JSON.stringify(err, Object.getOwnPropertyNames(err)));
					done(err, null);
				}
			},
		});
	}

	async call(url, options, retry = 0) {
		try {
			let method = _.get(options, 'method') || 'get';
			const query = _.get(options, 'query');
			const body = _.get(options, 'body') || {};
			if (!query) return await this.client.api(url)[method](body);
			return await this.client.api(url).query(query)[method](body);
		} catch (error) {
			if (retry < MAX_RETRY) {
				if (error.statusCode === 401) {
					await this.updateNewToken();
					return this.call(url, options, retry + 1);
				}
			}
			return Promise.reject(error);
		}
	}

	async updateNewToken() {
		// const refreshTokenObject = JSON.parse(this.msalTokenCache).RefreshToken;
		// const refreshToken = refreshTokenObject[Object.keys(refreshTokenObject)[0]].secret;
		const tokenResponse = await this.msalClient.acquireTokenByRefreshToken({
			refreshToken: this.refreshToken,
			scopes: MSAL_CONFIG.CONFIG.OAUTH_SCOPES.split(','),
			forceCache: true,
		});
		await models.EmailConfig.updateOne(
			{
				_id: this.emailId,
			},
			{ $set: { 'info.expiresOn': tokenResponse.expiresOn, 'info.accessToken': tokenResponse.accessToken } }
		);
		this.initClient(tokenResponse.accessToken);
	}

	async getListMessages({ folderId, limit, keyword, from, to, skip, skipToken }) {
		const query = { $top: limit, $count: true };
		if (skipToken) {
			query.$skipToken = skipToken;
		}
		if (skip) {
			query.$skip = skip;
		}
		if (from && to) {
			query.$filter = `(receivedDateTime ge ${from}) and (receivedDateTime le ${to})`;
		}
		if (keyword) {
			query.$search = encodeToURLFormat(keyword);
		}
		const url = folderId !== 'all' ? `/me/mailFolders/${folderId}/messages` : `/me/messages`;
		let message = await this.call(url, { query });
		const nextLink = _.get(message, '@odata.nextLink');
		skip = getNextPageQuery(nextLink).skip;
		skipToken = getNextPageQuery(nextLink).skiptoken;
		return { messages: message.value, total: _.get(message, '@odata.count'), skip, skipToken };
	}

	async getMessageConversation({ conversationId, limit, skip }) {
		const query = {
			$filter: `conversationId eq '${conversationId}'`,
			$select:
				'sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,subject,hasAttachments,bodyPreview,conversationId,body,isDraft,isRead',
			$top: limit,
			$count: true,
		};
		if (skip) {
			query.$skip = skip;
		}
		let message = await this.call(`me/messages`, {
			query,
			method: 'get',
		});
		// $filter: `receivedDateTime ge 1900-01-01T00:00:00Z and conversationId eq '${id}'`,
		// $orderby: 'receivedDateTime desc',
		const nextLink = _.get(message, '@odata.nextLink');
		skip = getNextPageQuery(nextLink).skip;
		return { messages: message.value, total: _.get(message, '@odata.count'), skip };
	}

	async readMessageConversation({ messageId, isRead }) {
		await this.call(`me/messages/${messageId}`, { body: { isRead }, method: 'update' });
	}

	async messageAttachments({ messageId }) {
		let attachments = await this.call(`me/messages/${messageId}/attachments`);
		return { attachments: attachments.value };
	}

	async getMailFolders({ folderId, skip, limit }) {
		const query = { $count: true };
		if (limit) {
			query.$top = limit;
		}
		if (skip) {
			query.$skip = skip;
		}

		const uri = !folderId ? `me/mailFolders` : `me/mailFolders/${folderId}/childFolders`;
		let folders = await this.call(uri, { query });
		const nextLink = _.get(folders, '@odata.nextLink');
		skip = getNextPageQuery(nextLink).skip;
		return {
			folders: [...folders.value, { displayName: 'Notes', id: 'Notes' }],
			total: _.get(folders, '@odata.count'),
			skip,
		};
	}

	async sendEmail({ message }) {
		const res = await this.call(`me/sendMail`, { body: { message }, method: 'post' });
		return res;
	}

	async replyEmail({ folderId, message }) {
		const postMessage = _.omit(message, 'craftId');
		const res = await this.call(`/me/mailFolders/${folderId}/messages/${message.id}/reply`, {
			body: { message: postMessage },
			method: 'post',
		});
		await this.call(`/me/messages/${message.craftId}`, { method: 'delete' });
		return res;
	}

	async forwardEmail({ folderId, message }) {
		const postMessage = _.omit(message, 'craftId');
		const res = await this.call(`/me/mailFolders/${folderId}/messages/${message.id}/forward`, {
			body: { message: postMessage },
			method: 'post',
		});
		await this.call(`/me/messages/${message.craftId}`, { method: 'delete' });
		return res;
	}

	async createReply({ messageId }) {
		const [craft, attachments] = await Promise.all([
			this.call(`/me/messages/${messageId}/createReply`, {
				method: 'post',
			}),
			this.call(`me/messages/${messageId}/attachments`, { method: 'get' }),
		]);
		return { craft, attachments: attachments.value };
	}

	async createForward({ messageId }) {
		const [craft, attachments] = await Promise.all([
			this.call(`/me/messages/${messageId}/createForward`, { method: 'post' }),
			this.call(`me/messages/${messageId}/attachments`, { method: 'get' }),
		]);
		return { craft, attachments: attachments.value };
	}

	async deleteDraft({ messageId }) {
		const res = await this.call(`/me/messages/${messageId}`, { method: 'delete' });
		return res;
	}
}

module.exports = OutlookClient;
