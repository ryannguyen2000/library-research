const crypto = require('crypto');

const { CRYPT_CONFIG } = require('@config/setting');

// const algorithm = 'aes-256-cbc';

// generate 16 bytes of random data
// const initVector = crypto.randomBytes(16);

// secret key generate 32 bytes of random data
// const securityKey = crypto.randomBytes(32).toString('base64');

function encryptData(message) {
	// the cipher function
	const initVector = Buffer.from(CRYPT_CONFIG.VECTOR, CRYPT_CONFIG.ENCODING);
	const securityKey = Buffer.from(CRYPT_CONFIG.KEY, CRYPT_CONFIG.ENCODING);

	const cipher = crypto.createCipheriv(CRYPT_CONFIG.ALGORITHM, securityKey, initVector);

	// encrypt the message
	// input encoding
	// output encoding
	const encryptedData = cipher.update(message, 'utf-8', 'hex');

	return encryptedData + cipher.final('hex');
}

function decryptData(data) {
	const initVector = Buffer.from(CRYPT_CONFIG.VECTOR, CRYPT_CONFIG.ENCODING);
	const securityKey = Buffer.from(CRYPT_CONFIG.KEY, CRYPT_CONFIG.ENCODING);

	const decipher = crypto.createDecipheriv(CRYPT_CONFIG.ALGORITHM, securityKey, initVector);

	const decryptedData = decipher.update(data, 'hex', 'utf-8');

	return decryptedData + decipher.final('utf8');
}

function md5(data) {
	return crypto.createHash('md5').update(data).digest('hex');
}

module.exports = {
	encryptData,
	decryptData,
	md5,
};
