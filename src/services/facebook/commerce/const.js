const _ = require('lodash');

const PRODUCT_FIELDS = {
	ID: 'id',
	NAME: 'name',
	DESCRIPTION: 'DESCRIPTION',
	PRICE: 'price',
	CURRENCY: 'currency',
	AVAILABILITY: 'availability',
	CONDITION: 'condition',
	LINK: 'link',
};
const PRODUCT_FIELDS_FULL_TXT = _.values(PRODUCT_FIELDS).join(',');

const ITEM_TYPES = {
	PRODUCT_ITEM: 'PRODUCT_ITEM',
};

const METHODS = {
	CREATE: 'CREATE',
	UPDATE: 'UPDATE',
	DELETE: 'DELETE',
};

module.exports = { PRODUCT_FIELDS, PRODUCT_FIELDS_FULL_TXT, ITEM_TYPES, METHODS };
