const _ = require('lodash');

const OPERATORS = {
	ADD: '+',
	SUB: '-',
	MUL: '*',
	DIV: '/',
};

function exec({ operator, values = [] }, dataSource) {
	const parsedValues = values.map(v => parseValue(v, dataSource));

	let rs = 0;

	parsedValues.forEach((value, index) => {
		if (index === 0) {
			rs = value;
			return;
		}
		if (operator === OPERATORS.ADD) {
			rs += value;
		} else if (operator === OPERATORS.SUB) {
			rs -= value;
		} else if (operator === OPERATORS.MUL) {
			rs *= value;
		} else if (operator === OPERATORS.DIV) {
			rs /= value;
		}
	});

	return rs;
}

function parseValue(value, dataSource) {
	if (typeof value === 'number') return value;

	if (typeof value === 'string') {
		const valueFromSource = _.get(dataSource, value);

		if (valueFromSource && valueFromSource.operator) {
			const val = exec(valueFromSource, dataSource);
			dataSource[value] = val;

			return val;
		}

		return _.get(dataSource, value) || 0;
	}

	return value && value.operator ? exec(value, dataSource) : 0;
}

module.exports = {
	OPERATORS,
	exec,
};
