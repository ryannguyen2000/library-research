const dot = require('dot-object');
const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

dot.keepArray = true;

async function updateDoc(doc, data) {
	const dobjs = {};
	const objs = {};

	_.forEach(data, (value, key) => {
		if (mongoose.Types.ObjectId.isValid(value)) {
			objs[key] = value;
		} else {
			dobjs[key] = value;
		}
	});

	const dotData = dot.dot(dobjs);

	doc.set({ ...objs, ...dotData });

	await doc.save({
		validateModifiedOnly: true,
	});

	return doc;
}

const parseVal = function (val, field, logValueMapper) {
	if (val === undefined || val === null) return '';
	if (_.isBoolean(val)) return val ? 'Có' : 'Không';
	if (_.isDate(val)) return moment(val).format('DD/MM/YYYY HH:mm');

	return _.get(logValueMapper, [field, val]) || val;
};

function getParseLog(logFieldLabels, logValueMapper, options) {
	const parsedKey = _.get(options, 'parsedTxtKey') || 'parsed';

	const parseLog = function (log) {
		const txt = `${logFieldLabels[log.field] || log.field}: ${parseVal(
			log.oldData,
			log.field,
			logValueMapper
		)} -> ${parseVal(log.newData, log.field, logValueMapper)}`;

		return {
			...log,
			[parsedKey]: txt,
		};
	};

	return parseLog;
}

module.exports = {
	updateDoc,
	getParseLog,
};
