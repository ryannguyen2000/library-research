const _ = require('lodash');

function replaceMultiple(str, replacements) {
	return replacements.reduce((acc, curr) => acc.replaceAll(curr.search, curr.replaceValue), str);
}

function getOverviewChildren(data) {
	return _.entries(data).map(([key, item], index) => {
		return {
			...item,
			key,
			rowClass: 'text-bold bg-grey',
			index: item && item.name ? index + 1 : '',
			children: _.entries(_.get(item, 'data')).map(([ckey, child]) => {
				return {
					...child,
					parentKey: key,
					key: `${key}_${ckey}`,
				};
			}),
		};
	});
}

function groupItems(array, size) {
	const chunkedArr = [];
	for (let i = 0; i < array.length; i += size) {
		chunkedArr.push(array.slice(i, i + size));
	}
	return chunkedArr;
}

module.exports = {
	replaceMultiple,
	getOverviewChildren,
	groupItems,
};
