const crypto = require('crypto');

function getTopicUrl(websocketUrl, accessId, env, query) {
	return `${websocketUrl}ws/v2/consumer/persistent/${accessId}/out/${env}/${accessId}-sub${query}`;
}

function buildQuery(query) {
	return Object.keys(query)
		.map(key => `${key}=${encodeURIComponent(query[key])}`)
		.join('&');
}

function buildPassword(accessId, accessKey) {
	const key = crypto.createHash('md5').update(accessKey).digest('hex');
	return crypto.createHash('md5').update(`${accessId}${key}`).digest('hex').substr(8, 16);
}

function decrypt(text, accessKey) {
	try {
		const realKey = Buffer.from(accessKey.substring(8, 24), 'utf-8');
		const decipher = crypto.createDecipheriv('aes-128-ecb', realKey, null);
		let decrypted = decipher.update(text, 'base64', 'utf8');
		decrypted += decipher.final('utf8');
		return JSON.parse(decrypted);
	} catch (error) {
		return '';
	}
}

module.exports = {
	getTopicUrl,
	buildQuery,
	buildPassword,
	decrypt,
};
