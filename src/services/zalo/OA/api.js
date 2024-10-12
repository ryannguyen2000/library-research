const _ = require('lodash');
const fs = require('fs');
const FormData = require('form-data');
const mongoose = require('mongoose');

const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const encodeUrl = require('@utils/uri');

const MAX_COUNT = 10;

class Api {
	constructor(config) {
		this.refreshToken = config.refreshToken;
		this.accessToken = config.accessToken;
		this.appId = config.appId;
		this.secretKey = config.secretKey;
	}

	async updateToken(data) {
		data = data || {
			refresh_token: this.refreshToken,
			grant_type: 'refresh_token',
		};
		data.app_id = this.appId;

		const body = _.entries(data)
			.map(([key, value]) => `${key}=${encodeURI(value)}`)
			.join('&');

		const rs = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				secret_key: this.secretKey,
			},
			body,
		});

		const json = await rs.json();
		if (json.error) {
			return Promise.reject(json);
		}

		this.accessToken = json.access_token;
		this.expireIn = json.expires_in;
		this.refreshToken = json.refresh_token;

		await mongoose.model('Ott').updateOne(
			{ 'zalo_oaInfo.appId': this.appId },
			{
				$set: {
					'zalo_oaInfo.accessToken': this.accessToken,
					'zalo_oaInfo.refreshToken': this.refreshToken,
				},
				$unset: {
					'zalo_oaInfo.oauthState': 1,
				},
			}
		);

		return json;
	}

	async call(endpoint, options = {}) {
		try {
			const { params, headers, body, version = 'v2.0', ...opts } = options;
			const cheaders = _.merge(
				{
					'content-type': 'application/json',
					access_token: this.accessToken,
				},
				headers
			);
			const url = endpoint.startsWith('https') ? endpoint : `https://openapi.zalo.me/${version}/oa/${endpoint}`;

			const res = await fetch(
				encodeUrl(url, params),
				_.pickBy({
					headers: cheaders,
					body: body
						? cheaders['content-type'] === 'application/json' && typeof body !== 'string'
							? JSON.stringify(body)
							: body
						: undefined,
					...opts,
				})
			);
			const json = await res.json();
			if (json.error) {
				throw json;
			}
			return json.data;
		} catch (e) {
			if (e.error === -216 || e.error === -124) {
				await this.updateToken();
				return this.call(endpoint, options);
			}

			logger.error(options && options.body, JSON.stringify(e));

			return Promise.reject(e.message);
		}
	}

	async getUser(user_id) {
		try {
			const rs = await this.call('user/detail', {
				params: {
					data: JSON.stringify({ user_id }),
				},
				version: 'v3.0',
			});
			return rs;
		} catch (e) {
			return null;
		}
	}

	async getConversations(user_id, offset = 0, count = 50) {
		const conversations = await this.call('conversation', {
			params: {
				data: JSON.stringify({ user_id, offset, count: MAX_COUNT }),
			},
		}).catch(() => []);

		if (conversations.length && offset + MAX_COUNT < count) {
			return [...conversations, ...(await this.getConversations(user_id, offset + MAX_COUNT, count))];
		}

		return conversations;
	}

	sendMessage(user, message, text, attachment) {
		const conversation_id = _.get(message, 'message.conversation_id') || user.conversation_id;

		const recipient = conversation_id
			? {
					anonymous_id: user.user_id,
					conversation_id,
			  }
			: user
			? {
					user_id: user.user_id,
			  }
			: {
					message_id: message.msg_id,
			  };

		return this.call('message/cs', {
			method: 'POST',
			version: 'v3.0',
			body: {
				recipient,
				message: {
					text,
					attachment,
				},
			},
		});
	}

	upload(file) {
		const form = new FormData();
		const readStream = fs.createReadStream(file.localPath);
		form.append('file', readStream);

		const type = file.type === 'image/gif' ? 'gif' : file.type.includes('image') ? 'image' : 'file';

		return this.call(`upload/${type}`, {
			method: 'POST',
			body: form,
			headers: {
				...form.getHeaders(),
			},
		});
	}

	getZNSTemplates() {
		return this.call(`https://business.openapi.zalo.me/template/all`, {
			params: {
				offset: 0,
				limit: 100,
				status: 1,
			},
		});
	}

	getZNSTemplate(template_id) {
		return this.call(`https://business.openapi.zalo.me/template/info`, {
			params: {
				template_id,
			},
		});
	}

	sendZNSTemplate(body) {
		return this.call(`https://business.openapi.zalo.me/message/template`, {
			method: 'POST',
			body,
		});
	}
}

module.exports = {
	Api,
};
