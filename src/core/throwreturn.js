const { ERROR_MSG } = require('./errorCode');

class ThrowReturn extends Error {
	constructor(message, ...args) {
		super(message);
		this.name = 'ThrowReturn';
		this.code = 1;
		this.args = args;
		this.lang = undefined;
	}

	error_code(code) {
		this.code = code;
		return this;
	}

	status(statusCode) {
		this.statusCode = statusCode;
		this.message = this.message || ERROR_MSG[statusCode];

		return this;
	}

	setData(data) {
		this.data = data;
		return this;
	}
}

module.exports = ThrowReturn;
