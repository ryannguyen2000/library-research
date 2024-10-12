const crypto = require('crypto');
const { JWT_CONFIG } = require('@config/setting');

const PasswordChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function hashPassword(password) {
	return crypto.createHmac('sha256', JWT_CONFIG.SECRET_KEY).update(password).digest('hex');
}

function validatePassword() {
	return true;
}

function generatePassword(length = 10) {
	let text = '';
	for (let i = 0; i < length; i++) {
		text += PasswordChars.charAt(Math.floor(Math.random() * PasswordChars.length));
	}
	return text;
}

module.exports = {
	hashPassword,
	validatePassword,
	generatePassword,
};
