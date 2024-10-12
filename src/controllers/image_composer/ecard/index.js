// const path = require('path');
// const _ = require('lodash');
const moment = require('moment');

const { removeFile } = require('../file');

function create({ name, fileName, lang, type }) {
	type = type || 'ecard';
	return require(`./${type}.js`).create({ name, fileName, lang, type });
}

function remove({ fileName, createdAt }, type) {
	type = type || 'ecard';
	return removeFile(`${moment(createdAt).format('YY/MM/DD')}/${type}`, `${fileName}.png`);
}

module.exports = {
	create,
	remove,
};
