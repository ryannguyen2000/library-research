const _ = require('lodash');

const router = require('@core/router').Publish();
const listingController = require('@controllers/client/listing');
const models = require('@models');
const { findSTag } = require('./utils');

async function searchListings(req, res) {
	const data = await listingController.searchListings({ ...req.query, language: req.language });

	const metas = _.map(data.bestMatch, item => ({
		...item.meta,
		ward: _.get(item.meta, 'wardId'),
		province: _.get(item.meta, 'provinceId'),
		district: _.get(item.meta, 'districtId'),
	}));

	await Promise.all([
		models.District.populate(metas, {
			path: 'district',
			select: 'id name slug',
			options: {
				lean: true,
			},
		}),
		models.Province.populate(metas, {
			path: 'province',
			select: 'id name slug',
			options: {
				lean: true,
			},
		}),
		models.Ward.populate(metas, {
			path: 'ward',
			select: 'id name slug',
			options: {
				lean: true,
			},
		}),
	]);

	const bestMatch = _.map(data.bestMatch, (item, index) => ({
		...item,
		meta: metas[index],
	}));

	res.sendData({ bestMatch });
}

async function getTag(req, res) {
	const tagSlug = _.trim(req.params.slug);

	if (!tagSlug) {
		return res.sendData(null);
	}

	const roomTag = await findSTag(tagSlug);

	res.sendData({
		tag: roomTag,
	});
}

router.getS('/suggestion', searchListings);
router.getS('/tag/:slug', getTag);

module.exports = { router };
