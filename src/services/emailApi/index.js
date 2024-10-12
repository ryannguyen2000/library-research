const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { EMAIL_TYPE } = require('@utils/const');
const { MSAL_CONFIG, GMAIL_CONFIG } = require('@config/setting');
const GmailClient = require('./gmail');
const OutlookClient = require('./outlook');

const createEmailClient = (config, type) => {
	const { GMAIL, OUTLOOK } = EMAIL_TYPE;
	switch (type) {
		case GMAIL:
			return new GmailClient(config);
		case OUTLOOK:
			return new OutlookClient(config);
		default:
			throw new ThrowReturn(`This email type ${type} does not supported`);
	}
};

const getAuthorizeUrl = async type => {
	if (!_.values(EMAIL_TYPE).includes(type)) throw new ThrowReturn(`This email type ${type} does not supported`);

	let authorizeUrl = '';
	if (type === EMAIL_TYPE.OUTLOOK) {
		const urlParameters = {
			scopes: MSAL_CONFIG.CONFIG.OAUTH_SCOPES.split(','),
			redirectUri: MSAL_CONFIG.CONFIG.REDIRECT_URI,
		};
		authorizeUrl = await OutlookClient.getMsalClient().getAuthCodeUrl({
			...urlParameters,
			redirectUri: `${urlParameters.redirectUri}`,
		});
	} else {
		authorizeUrl = GmailClient.getClient(GMAIL_CONFIG.AUTH).generateAuthUrl({
			access_type: 'offline',
			scope: GMAIL_CONFIG.CONFIG.OAUTH_SCOPES,
		});
	}

	return authorizeUrl;
};

module.exports = { createEmailClient, getAuthorizeUrl };
