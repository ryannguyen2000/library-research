const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { AccountConfigTypes, AccountProvider } = require('@utils/const');
const FacebookCommerceClient = require('./client');

async function initClient() {
	const accountConfig = await models.AccountConfig.findOne({
		active: true,
		accountType: AccountConfigTypes.API,
		provider: AccountProvider.FACEBOOK,
	}).lean();

	if (!accountConfig) throw new ThrowReturn(`${AccountProvider.FACEBOOK} account config doest not exist`);
	const accessToken = _.get(accountConfig, 'authorizationKey.accessToken', '');
	const bussinessId = _.get(accountConfig, 'others.bussinessId', '');
	const client = new FacebookCommerceClient({ accessToken, bussinessId });
	return client;
}

async function batch(catalogId, requests) {
	const client = await initClient();
	const res = await client.batch(catalogId, requests);
	return res;
}

async function getProducts() {
	const facebookCatalog = await models.FacebookCatalog.findOne({
		blockId: '5cd590f02ca5fc403d7e0240',
		active: true,
	}).lean();
	const client = await initClient();
	const res = await client.getProducts(facebookCatalog.catalogId);
	console.log({ res });
}

module.exports = {
	batch,
};
