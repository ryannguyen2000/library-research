const _ = require('lodash');

const { Publish, useCache } = require('@core/router');
const models = require('@models');
const { SUBDIVITION, PROPERTY_TYPES, mapLocationText } = require('./utils');

const router = Publish();

async function getPropertyType(req, res) {
	res.sendData({ data: PROPERTY_TYPES });
}

async function getProvince(req, res) {
	const provinces = await models.Province.find()
		.sort({ order: -1, _id: 1 })
		.select({
			id: 1,
			name: 1,
			alias: 1,
			slug: 1,
			prefix: 1,
		})
		.lean();

	res.sendData({ data: mapLocationText(provinces, req.language) });
}

async function getDistrict(req, res) {
	const provinceId = parseInt(req.query.province) || 1;

	const districts = await models.District.find({ provinceId })
		.select('id name alias slug prefix')
		.lean()
		.then(rs => _.keyBy(rs, '_id'));

	const alias = await models.LocationAlias.find({
		type: SUBDIVITION.DISTRICT,
		locId: { $in: _.map(districts, '_id') },
	})
		.sort({ count: -1 })
		.select('locId')
		.lean();

	const data = alias.map(loc => districts[loc.locId]).filter(item => item);

	res.sendData({ data: mapLocationText(data, req.language) });
}

async function getWard(req, res) {
	const districtId = parseInt(req.query.district);
	if (!districtId) return res.sendData({ data: [] });

	const wards = await models.Ward.find({ districtId }).select('id code name alias slug prefix').lean();
	const alias = await models.LocationAlias.find({ type: SUBDIVITION.WARD, locId: { $in: _.map(wards, '_id') } })
		.sort({ count: -1 })
		.select('locId')
		.lean();

	const wardsObj = _.keyBy(wards, '_id');
	const data = alias.map(loc => wardsObj[loc.locId]).filter(item => item);

	res.sendData({ data: mapLocationText(data, req.language) });
}

async function getStreet(req, res) {
	const districtId = parseInt(req.query.district);
	if (!districtId) return res.sendData({ data: [] });

	const streets = await models.Street.find({ districtId })
		.select('id code name alias slug prefix')
		.lean()
		.then(rs => _.keyBy(rs, '_id'));
	const alias = await models.LOC_ALIAS.find({ type: SUBDIVITION.STREET, locId: { $in: _.map(streets, '_id') } })
		.sort({ count: -1 })
		.select('locId')
		.lean();

	const data = alias.map(loc => streets[loc.locId]).filter(item => item);

	res.sendData({ data: mapLocationText(data, req.language) });
}

router.getS('/propertytype', useCache(), getPropertyType);
router.getS('/province', useCache(), getProvince);
router.getS('/district', useCache(), getDistrict);
router.getS('/ward', useCache(), getWard);
router.getS('/street', useCache(), getStreet);

module.exports = { router };
