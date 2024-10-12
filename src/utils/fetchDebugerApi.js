const xml2js = require('xml2js');
const _ = require('lodash');

const fetch = require('@utils/fetch');
const models = require('@models');
const { logger } = require('@utils/logger');

// const { logger } = require('./logger');

// debugger, url,

async function fetchDebugerApi(url, options, debugOption = {}) {
	const debuger = await models.APIDebugger.create({
		from: debugOption.otaConfig.name,
		request: {
			headers: options.headers,
			method: options.method,
			requestMessage: options.body,
		},
		url,
		data: { otaConfig: debugOption.otaConfig },
	});

	const res = await fetch(url, options);
	const contentType = res.headers.get('content-type');

	const headersObj = {};
	res.headers.forEach((value, name) => {
		headersObj[name] = value;
	});
	const responseStatus = res.status;

	if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
		const xmlResponse = await res.text();
		const parser = new xml2js.Parser();
		const data = await parser.parseStringPromise(xmlResponse);
		const uniqId = _.get(data, [debugOption.responseElement, 'UniqueID', ['0'], '$', 'ID']);

		// Convert headers to an object

		await models.APIDebugger.updateOne(
			{
				_id: debuger._id,
			},
			{
				$set: {
					response: {
						headers: headersObj,
						status: responseStatus,
						responseMessage: xmlResponse,
						timeStamp: _.get(data, [debugOption.responseElement, '$', 'TimeStamp']),
						uniqId,
					},
				},
			}
		);
		return data;
	}
	await models.APIDebugger.updateOne(
		{
			_id: debuger._id,
		},
		{
			$set: {
				response: {
					headers: headersObj,
					status: responseStatus,
					responseMessage: res.statusText,
				},
			},
		}
	);

	if (responseStatus === 500) logger.error('Fetch debugger api', url, res.statusText);

	return res;
}

module.exports = fetchDebugerApi;
