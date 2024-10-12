const _ = require('lodash');
const fetch = require('node-fetch');
const queryString = require('querystring');

const ThrowReturn = require('@core/throwreturn');
const { FACEBOOK_URL } = require('@config/setting');
const { ITEM_TYPES } = require('./const');

const MAX_RETRY = 3;

class FacebookCommerceClient {
	constructor({ accessToken, url, businessId }) {
		this.accessToken = accessToken;
		this.url = url || FACEBOOK_URL;
		this.businessId = businessId || '';
	}

	async call({ path = '', query = {}, options = {}, retry = 0 }) {
		try {
			const params = new URLSearchParams({
				...query,
				access_token: this.accessToken,
			});
			const url = `${this.url}/${path}?${params}`;
			Object.assign(options);

			const response = await fetch(url, options);
			const data = await response.json();
			if (data.error) throw new Error(_.get(data, 'error.message', `Facebook api error: ${path}`));

			return data;
		} catch (error) {
			if (retry < MAX_RETRY) return await this.call({ path, query, options, retry: retry + 1 });
			throw new ThrowReturn(error);
		}
	}

	// Catalog
	async createCatalog() {}

	async getCatalogs(businessId, fields = []) {
		const path = `${businessId}/owned_product_catalogs`;
		const options = {
			method: 'get',
		};
		const query = {};
		if (fields.length) query.fields.join(',');
		const res = await this.call({ path, query, options });
		return res;
	}

	async getCatalog(catalogId) {}

	async deleteCatalog(catalogId) {}

	// Product
	async batch(catalogId, requests) {
		const path = `${catalogId}/items_batch`;
		const body = {
			item_type: ITEM_TYPES.PRODUCT_ITEM,
			requests: JSON.stringify(requests),
		};

		const options = {
			method: 'post',
			body: queryString.stringify(body),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		};

		const res = await this.call({ path, options });
		return res;
	}

	async getProducts(catalogId, fields = []) {
		const path = `${catalogId}/products`;
		const options = { method: 'get' };
		const query = { fields: fields.join(',') };
		const res = await this.call({ path, query, options });
		return res;
	}

	async getProduct(id, fields = []) {
		const path = id;
		const options = { method: 'get' };
		const query = { fields: fields.join(',') };
		const res = await this.call({ path, query, options });
		return res;
	}
}

module.exports = FacebookCommerceClient;
