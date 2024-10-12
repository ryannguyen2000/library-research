const _ = require('lodash');

const { URL_CONFIG } = require('@config/setting');
const router = require('@core/router').Publish();
const models = require('@models');
const { AsyncOne } = require('@utils/async');
const { STATIC_CONTENT_TYPE, OTAs } = require('@utils/const');

const { SERVICES_SLUG, SERVICES, PROPERTY_TYPES, SUBDIVITION, mapLocationText, findSTag } = require('./utils');

const SERVICE_KEYS = {};
const LOCATION_KEYS = {};

const asyncOne = new AsyncOne();

_.entries(SERVICES_SLUG).forEach(([k, slug]) => {
	SERVICE_KEYS[slug] = SERVICES[k];
});

(async function init() {
	const blocks = await models.Block.find({
		isTest: false,
		active: true,
		isProperty: true,
	})
		.select('wardId districtId provinceId streetId')
		.lean();

	const provinceIds = _.compact(_.uniq(_.map(blocks, 'provinceId')));
	const districtIds = _.compact(_.uniq(_.map(blocks, 'districtId')));
	const wardIds = _.compact(_.map(blocks, 'wardId'));
	const streetIds = _.compact(_.map(blocks, 'streetId'));

	const provinces = await models.Province.find({ _id: provinceIds }).select('_id slug').lean();
	provinces.forEach(province => {
		LOCATION_KEYS[province.slug] = { province: province._id };
	});
	const provinceObj = _.keyBy(provinces, '_id');

	const districts = await models.District.find({ _id: districtIds }).select('_id slug provinceId').lean();
	districts.forEach(district => {
		LOCATION_KEYS[district.slug] = {
			province: _.get(provinceObj, [district.provinceId, '_id']),
			district: district._id,
		};
	});

	const districtsObj = _.keyBy(districts, '_id');

	const wards = await models.Ward.find({ _id: wardIds }).select('_id slug districtId').lean();

	wards.forEach(ward => {
		const district = districtsObj[ward.districtId];
		if (!district) return;
		const province = _.get(provinceObj, [district.provinceId, '_id']);
		if (!province) return;

		LOCATION_KEYS[ward.slug] = {
			ward: ward._id,
			district: district._id,
			province,
		};
	});

	const streets = await models.Street.find({ _id: streetIds }).select('_id slug districtId').lean();
	streets.forEach(street => {
		const district = districtsObj[street.districtId];
		if (!district) return;
		const province = _.get(provinceObj, [district.provinceId, '_id']);
		if (!province) return;

		LOCATION_KEYS[street.slug] = {
			street: street._id,
			district: district._id,
			province,
		};
	});
})();

async function populateLocation(location, language) {
	const selection = {
		id: 1,
		name: 1,
		alias: 1,
		slug: 1,
		location: 1,
		prefix: 1,
	};

	const data = await Promise.all([
		location.province && models.Province.findById(location.province).select(selection).lean(),
		location.district && models.District.findById(location.district).select(selection).lean(),
		location.ward && models.Ward.findById(location.ward).select(selection).lean(),
		location.street && models.Street.findById(location.street).select(selection).lean(),
	]);

	data.forEach(loc => {
		mapLocationText(loc, language);
	});

	[location.province, location.district, location.ward, location.street] = data;

	return location;
}

async function getSEOStreets({ districtId, streetId, language }) {
	const query = {
		type: SUBDIVITION.STREET,
		street: { $in: streetId },
	};
	if (districtId) {
		query.district = districtId;
	}

	const locations = await models.LocationAlias.find(query)
		.select({
			type: 1,
			[query.type]: 1,
		})
		.limit(10)
		.populate({
			path: query.type,
			select: 'id name slug prefix alias',
		})
		.lean();

	return locations.map(l => {
		const data = mapLocationText(l[l.type], language);

		return {
			count: l.count,
			type: l.type,
			data,
		};
	});
}

async function getSEOLocations({ districtId, provinceId, blocks, language }) {
	const query = {};
	if (districtId) {
		query.type = SUBDIVITION.WARD;
		query.district = districtId;
		query.ward = { $in: _.map(blocks, 'wardId') };
	} else if (provinceId) {
		query.type = SUBDIVITION.DISTRICT;
		query.province = provinceId;
		query.district = { $in: _.map(blocks, 'districtId') };
	} else {
		query.type = SUBDIVITION.PROVINCE;
		query.province = { $in: _.map(blocks, 'provinceId') };
	}

	const locations = await models.LocationAlias.find(query)
		.select({
			type: 1,
			[query.type]: 1,
		})
		.limit(10)
		.populate({
			path: query.type,
			select: 'id name slug alias prefix',
		})
		.lean();

	return locations.map(l => {
		const data = mapLocationText(l[l.type], language);

		return {
			count: l.count,
			type: l.type,
			data,
		};
	});
}

async function getSEO({ districtId, provinceId, wardId }, language) {
	districtId = parseInt(districtId);
	provinceId = parseInt(provinceId);
	wardId = parseInt(wardId);

	const blocks = await models.Block.find({
		isTest: false,
		active: true,
		isProperty: true,
		visibleOnWebsite: { $ne: false },
		..._.pickBy({ districtId, provinceId }),
	})
		.select('wardId districtId provinceId streetId')
		.lean();

	const streetId = _.map(wardId ? blocks.filter(b => b.wardId === wardId) : blocks, 'streetId');

	const [locations, streets] = await Promise.all([
		getSEOLocations({ districtId, provinceId, blocks, language }),
		getSEOStreets({ districtId, streetId, language }),
	]);

	return {
		locations,
		streets,
	};
}

async function findLocationKey(slug) {
	const cached = LOCATION_KEYS[slug];

	if (cached) {
		return _.clone(cached);
	}

	let result;

	const province = await models.Province.findOne({ slug }).select('_id').lean();
	if (province) {
		result = {
			province: province._id,
		};
	}

	if (!result) {
		const district = await models.District.findOne({ slug }).select('_id provinceId').lean();
		if (district) {
			result = {
				province: district.provinceId,
				district: district._id,
			};
		}
	}

	if (!result) {
		const ward = await models.Ward.findOne({ slug })
			.select('_id districtId')
			.populate('districtId', '_id provinceId')
			.lean();

		if (ward) {
			result = {
				province: ward.districtId.provinceId,
				district: ward.districtId._id,
				ward: ward._id,
			};
		}
	}

	if (result) {
		LOCATION_KEYS[slug] = result;
	}

	return result;
}

async function resolveUrl(req, res) {
	let { url, tag } = req.body;
	let { language } = req;

	if (!url || typeof url !== 'string') {
		return res.sendData(null);
	}

	const serviceSlug = _.keys(SERVICE_KEYS).find(key => url.includes(key));
	const urlWithoutService = url.replace(serviceSlug, '').substr(1);
	const businessService = SERVICE_KEYS[serviceSlug];
	const propertyType = PROPERTY_TYPES.find(p => urlWithoutService.includes(p.slug));

	const urlWithLocationOnly = urlWithoutService.replace(_.get(propertyType, 'slug'), '').substr(1);

	const rs = {
		businessService,
		propertyType,
		propertyTypes: PROPERTY_TYPES,
	};

	const rs2 = await asyncOne.acquire(`${urlWithLocationOnly}${tag || ''}${language}`, async () => {
		const location = await findLocationKey(urlWithLocationOnly);

		const districtId = _.get(location, 'district');
		const provinceId = _.get(location, 'province');
		const wardId = _.get(location, 'ward');

		const data = {
			seo: {
				link: {},
			},
		};

		[{ locations: data.seo.link.locations, streets: data.seo.link.streets }, data.location, data.tag] =
			await Promise.all([
				getSEO(
					{
						districtId,
						provinceId,
						wardId,
					},
					language
				),
				location ? { ...(await populateLocation(location, language)), slug: urlWithLocationOnly } : undefined,
				tag ? findSTag(tag) : undefined,
			]);

		return data;
	});

	res.sendData({
		...rs,
		...rs2,
	});
}

async function genBlogSitemap(page = 1) {
	const LIMIT = 100;
	const start = (page - 1) * LIMIT;

	const URL = `${URL_CONFIG.BLOG}/api/blog/public?start=${start}&limit=${LIMIT}`;

	const data = await fetch(URL)
		.then(res => res.json())
		.catch(() => null);

	const sites = _.map(_.get(data, 'data'), item => ({
		loc: `${URL_CONFIG.HOME}/blog/${item.short_url}`,
		lastmod: item.last_update,
	}));

	if (data && data.total > data.data.length + page * LIMIT) {
		return [...sites, ...(await genBlogSitemap(page + 1))];
	}

	return sites;
}

async function genBuildingMappersSitemap() {
	const homes = await models.Block.find({
		isTest: false,
		active: true,
		isProperty: true,
		visibleOnWebsite: { $ne: false },
		'listingIds.0': { $exists: true },
	})
		.select('wardId updatedAt info.url')
		.populate('wardId', 'slug')
		.lean();

	const contents = await models.BlockStaticContent.find({
		blockId: { $in: _.map(homes, '_id') },
		contentType: STATIC_CONTENT_TYPE.PROPERTY,
	}).select('blockId updatedAt');

	const contentObjs = _.keyBy(contents, 'blockId');

	return _.compact(
		homes.map(home => {
			const service = SERVICES_SLUG.DAY;
			const ward = _.get(home.wardId, 'slug');
			if (!ward || !service) return;

			return {
				loc: `${URL_CONFIG.HOME}/${service}-homestay-${ward}/${home.info.url}`,
				lastmod: _.get(contentObjs[home._id], 'updatedAt') || home.updatedAt,
			};
		})
	);
}

async function genRoomMapperSitemap() {
	const activeHomes = await models.Block.getActiveBlock();

	const rooms = await models.Listings.find({
		blockId: { $in: activeHomes },
		public: true,
		OTAs: {
			$elemMatch: {
				otaName: OTAs.CozrumWeb,
				active: true,
				'rates.active': true,
			},
		},
	})
		.select('blockId url updatedAt OTAs')
		.populate({
			path: 'blockId',
			select: 'wardId',
			populate: {
				path: 'wardId',
				select: 'slug',
			},
		})
		.lean();

	const service = SERVICES_SLUG.DAY;

	const contents = await models.BlockStaticContent.find({
		blockId: { $in: activeHomes },
		contentType: STATIC_CONTENT_TYPE.ROOM,
	}).select('otaListingId updatedAt');

	const contentObjs = _.keyBy(contents, 'otaListingId');

	const result = [];

	_.forEach(rooms, room => {
		const ward = _.get(room.blockId, 'blockId.wardId.slug');
		if (!ward) return;

		result.push({
			loc: `${URL_CONFIG.HOME}/${service}-homestay-${ward}/${room.url}`,
			lastmod:
				_.get(contentObjs[room.OTAs.find(o => o.otaName === OTAs.CozrumWeb).otaListingId], 'updatedAt') ||
				room.updatedAt,
		});
	});

	return _.compact(result);
}

async function getSitemap(req, res) {
	const blogs = await genBlogSitemap();

	const roomsMappers = await genRoomMapperSitemap();

	const buildingMappers = await genBuildingMappersSitemap();

	res.sendData({
		blogs,
		roomsMappers,
		buildingMappers,
	});
}

router.postS('/url/resolver', resolveUrl);
router.getS('/sitemap', getSitemap);

module.exports = { router };
