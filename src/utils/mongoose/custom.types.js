const urlRegex = require('url-regex');
const { isEmail } = require('@utils/validate');

const validators = {
	Date: {
		validator(v) {
			return v === null || v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v);
		},
		message: props => `${props.value} is not valid date with format 'YYYY-MM-DD'`,
	},

	DateTime: {
		validator(v) {
			return v === null || v === undefined || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}[:\d{2}]$/.test(v);
		},
		message: props => `${props.value} is not valid time with format 'YYYY-MM-DD hh:mm:ss'`,
	},

	Time: {
		validator(v) {
			return v === null || v === undefined || /^\d{2}:\d{2}:\d{2}$/.test(v) || /^\d{2}:\d{2}$/.test(v);
		},
		message: props => `${props.value} is not valid time with format 'hh:mm[:ss]'`,
	},

	Url: {
		validator(v) {
			return v === null || v === undefined || urlRegex().test(v);
		},
		message: props => `${props.value} is not valid url`,
	},

	Email: {
		validator(v) {
			return v === null || v === undefined || isEmail(v);
		},
		message: props => `${props.value} is not email`,
	},
};

const Types = {
	Date: {
		type: String,
		validate: validators.Date,
	},
	DateTime: {
		type: String,
		validate: validators.DateTime,
	},
	Time: {
		type: String,
		validate: validators.Time,
	},
	Url: {
		type: String,
		validate: validators.Url,
	},
	Email: {
		type: String,
		validate: validators.Email,
	},
};

Types.validators = validators;

module.exports = Types;
