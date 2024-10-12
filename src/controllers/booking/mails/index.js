const path = require('path');
const glob = require('glob');
const _ = require('lodash');

function loadMail(folder) {
	const mails = {};

	const baseFolder = path.join(__dirname, folder);
	const mailFiles = glob(`${baseFolder}/**/*.mail.js`, {
		sync: true,
		matchBase: true,
	});

	for (const mailFile of mailFiles) {
		const mail = require(mailFile);
		const mailName = _.last(mailFile.split('/')).replace('.mail.js', '');
		mails[mailName] = mail;
	}

	return mails;
}

module.exports = loadMail('.');
