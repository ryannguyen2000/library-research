const _ = require('lodash');
const nodeFetch = require('node-fetch');
const { logger } = require('./logger');

// const HttpsProxyAgent = require('https-proxy-agent');

// require('dnscache')({
// 	enable: true,
// 	ttl: 300,
// 	cachesize: 1000,
// });

// const { logger } = require('./logger');
// const { proxies } = require('../../config/setting');

// const TIME_BETWEEN_TWO_REQUEST = 300;

// const proxiesData = {
// 	Default: {
// 		proxies: [],
// 		lastUsed: [],
// 	},
// };

// const delay = t => new Promise(res => setTimeout(res, t));

// async function getProxy(url = '') {
// 	const match = url.match(/\/\/(.*?)\//);
// 	let origin;
// 	if (match) {
// 		[, origin] = match;
// 		if (!proxiesData[origin]) {
// 			proxiesData[origin] = {
// 				proxies: [],
// 				lastUsed: [],
// 			};
// 		}
// 	} else {
// 		logger.info('Cannot get origin from url:', url);
// 		origin = 'Default';
// 	}

// 	const proxyData = proxiesData[origin];
// 	const newProxies = proxies.filter(p => !proxyData.proxies.includes(p));
// 	if (newProxies.length) {
// 		proxyData.proxies = proxyData.proxies.concat(newProxies);
// 		proxyData.lastUsed = proxyData.lastUsed.concat(new Array(newProxies.length).fill(0));
// 	}

// 	if (proxyData.length === 0) {
// 		logger.error("Don't have any proxy");
// 		return;
// 	}

// 	let last = Math.min(...proxyData.lastUsed);

// 	while (Date.now() - last < TIME_BETWEEN_TWO_REQUEST) {
// 		// eslint-disable-next-line no-await-in-loop
// 		await delay(75);
// 		last = Math.min(...proxyData.lastUsed);
// 	}

// 	const idx = proxyData.lastUsed.indexOf(last);

// 	proxyData.lastUsed[idx] = Date.now();

// 	const proxy = proxyData.proxies[idx];
// 	if (!proxy) {
// 		logger.error('Proxy is null', proxyData, idx, last);
// 		return null;
// 	}

// 	return proxy;
// }

const MAX_RETRY = 2;
// const TIME_OUT = 40000;
const DEFAULT_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36';

async function fetch(url, options, retry = 0) {
	options = options || {};
	// options.timeout = options.timeout || TIME_OUT;
	options.redirect = options.redirect || 'follow';
	options.follow = 10;

	if (!_.get(options, ['headers', 'user-agent'])) _.set(options, ['headers', 'user-agent'], DEFAULT_AGENT);

	try {
		const res = await nodeFetch(url, options);
		return res;
	} catch (e) {
		if (e.code === 'ECONNRESET' && retry < MAX_RETRY) {
			await Promise.delay(500);
			return fetch(url, options, retry + 1);
		}
		logger.error(e);
		return Promise.reject(e);
	}
}

module.exports = fetch;
