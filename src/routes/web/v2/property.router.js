const _ = require('lodash');
const geohash = require('ngeohash');

const { useCache, Publish } = require('@core/router');
const listingController = require('@controllers/client/listing');
const models = require('@models');
const { STATIC_CONTENT_TYPE, Services } = require('@utils/const');
const {
	convertToStatic,
	getPrecisionByZoom,
	mapLocationText,
	MIN_ZOOM_FOR_SHOW_PRICE,
	DATA_TYPE,
	CARD_TYPE,
	ROOM_STATUS,
	PROPERTY_TYPES,
} = require('./utils');

const router = Publish();

async function getRoomAvailable(req, res) {
	const { query, language, params } = req;

	const data = await listingController.getListingAvailable(params.slug, {
		...query,
		from: query.from || query.checkIn,
		to: query.to || query.checkOut,
		language,
	});

	const dates = _.get(data, 'dates');

	const available = _.map(dates, date => ({
		available: date.available || 0,
		date: new Date(date.date).toDateMysqlFormat(),
	}));

	res.sendData({ available });
}

function mapPrice(data) {
	return {
		VAT: data.VATPercent,
		price: data.defaultPrice,
		noVATPrice: data.noVATPrice,
		noVATPromoPrice: data.noVATPromoPrice,
		promoPrice: data.promoPrice,
		nights: data.nights,
		ratePlan: data.ratePlan,
		prices: _.map(data.prices, price => ({
			date: new Date(price.date).toDateMysqlFormat(),
			day: price.defautlPrice,
			dayPromo: price.promoPrice,
			discount: price.discount,
		})),
		checkIn: data.checkIn,
		checkOut: data.checkOut,
	};
}

async function getRoomPrice(req, res) {
	const { query, params, language } = req;

	const data = await listingController.getListingPrice(params.slug, {
		...query,
		from: query.check_in || query.checkIn,
		to: query.check_out || query.checkOut,
		language,
	});

	const price = {
		...mapPrice(data),
		ratePlans: _.map(data.ratePlans, mapPrice),
	};

	res.sendData(price);
}

async function getBranchs(req, res) {
	const blocks = await models.Block.find({
		isTest: false,
		active: true,
		isProperty: true,
		visibleOnWebsite: { $ne: false },
		'listingIds.0': { $exists: true },
	})
		.select({
			info: 1,
			virtualRoomId: 1,
		})
		.sort({ order: 1, createdAt: -1 })
		.populate({
			path: 'virtualRoomId',
			select: {
				'info.images': { $slice: 1 },
			},
		})
		.lean();

	const data = blocks.map(block => {
		const images = _.map(_.get(block, 'virtualRoomId.info.images'), img => ({
			source: convertToStatic(img),
		}));

		return {
			_id: block._id,
			address: {
				vi: block.info.address,
				en: block.info.address_en,
			},
			name: block.info.name,
			mapStatic: block.info.mapStatic,
			location: block.info.location,
			slug: block.info.url,
			blog: block.info.blog,
			cover: images[0],
			images,
		};
	});

	res.sendData({ data, total: data.length });
}

function getTags(content, language) {
	const lTags = _.get(content, `tags${_.upperFirst(language)}`) || [];
	const tags = lTags.length ? lTags : _.get(content, 'tags', []);

	return tags;
}

function getTypeIds(propertyContent) {
	return _.uniqBy([PROPERTY_TYPES[0], ..._.get(propertyContent, 'typeId', [])], 'id');
}

async function getRooms(req, res) {
	const { language } = req;

	const data = await listingController.getSellingListings({ ...req.query, language });

	const listings = _.get(data, 'listings') || [];

	const [roomContents, propertyContents] = await Promise.all([
		models.BlockStaticContent.find({
			otaListingId: {
				$in: _.map(listings, 'otaListingId'),
			},
		})
			.select({
				otaListingId: 1,
				'content.type': 1,
				'content.videos': { $slice: 1 },
				'content.images': { $slice: 1 },
				'content.vr': 1,
				'content.info': 1,
				'content.occupancy': 1,
				'content.tags': 1,
				'content.tagsEn': 1,
			})
			.lean(),
		models.BlockStaticContent.find({
			blockId: { $in: _.uniqBy(_.map(listings, 'blockId._id'), _.toString) },
			contentType: STATIC_CONTENT_TYPE.PROPERTY,
		})
			.select({
				blockId: 1,
				'content.typeId': 1,
				'content.operator': 1,
				'content.address': 1,
				'content.location': 1,
				'content.districtId': 1,
				'content.provinceId': 1,
				'content.wardId': 1,
			})
			.lean(),
	]);

	const contentOvjs = _.keyBy(roomContents, 'otaListingId');
	const propertyContentOvjs = _.keyBy(propertyContents, 'blockId');

	const rooms = listings.map(listing => {
		const block = listing.blockId;

		const content = _.get(contentOvjs[listing.otaListingId], 'content');
		const propertyContent = _.get(propertyContentOvjs[block._id], 'content') || {};

		const price = _.head(listing.prices);
		const tags = getTags(content, language);

		const property = {
			id: propertyContent.id || block._id,
			address: propertyContent.address || {
				vi: _.get(block, 'info.address'),
				en: _.get(block, 'info.address_en'),
			},
			businessServices: [Services.Day],
			location: _.get(block, 'info.location') || propertyContent.location,
			districtId: mapLocationText(propertyContent.districtId || block.districtId),
			provinceId: mapLocationText(propertyContent.provinceId || block.provinceId),
			wardId: mapLocationText(propertyContent.wardId || block.wardId),
			name: _.get(data.info, 'name'),
			slug: _.get(data.info, 'url'),
			blog: _.get(data.info, 'blog'),
			operator: propertyContent.operator || 1,
			typeId: getTypeIds(propertyContent),
		};

		const media = filterRoomMedias(content);

		return {
			id: listing.otaListingId,
			slug: listing.url,
			hasVR: !!media && !!media.vr.length,
			hasVideo: !!media && !!media.videos.length,
			cover:
				_.get(media, 'vr[0].source') ||
				_.get(media, 'images[0].source') ||
				convertToStatic(_.get(listing.info, 'images[0]')),
			displayName: listing.name,
			info: _.get(content, 'info') || {
				bathroom: _.get(listing.info, 'bathrooms'),
				bed: _.get(listing.info, 'beds'),
				bedroom: _.get(listing.info, 'bedrooms'),
			},
			occupancy: _.get(content, 'occupancy') || {
				maxGuest: _.get(listing.info, 'accommodates'),
				standardGuest: _.get(listing.info, 'accommodates'),
			},
			price: {
				day: _.get(price, 'defaultPrice'),
				dayPromo: _.get(price, 'promoPrice'),
				VATPercent: _.get(price, 'VATPercent'),
				nights: _.get(price, 'nights'),
				ratePlan: _.get(listing.rate, 'ratePlanId'),
			},
			property,
			tags,
			type: _.get(content, 'type') || {
				id: 1,
				name: { vi: 'Studio', en: 'Studio' },
				_id: 1,
			},
		};
	});

	res.sendData({
		data: rooms,
		start: parseInt(req.query.start) || 0,
		limit: parseInt(req.query.limit) || 20,
		total: _.get(data, 'total', 0),
	});
}

async function getRoomsGeo(req, res) {
	const { query, language } = req;

	const data = await listingController.getListingMaps({
		...query,
		blockId: query.property,
		language,
	});

	const listings = _.map(_.get(data, 'listings'), listing => {
		const price = _.get(listing.prices, 'promoPrice') || _.get(listing.prices, 'price');
		const lat = _.get(listing.blockId, 'info.location.coordinates[1]');
		const lng = _.get(listing.blockId, 'info.location.coordinates[0]');
		const ghash = geohash.encode(lat, lng);

		return {
			lat,
			lng,
			slug: listing.url,
			price,
			id: listing.otaListingId,
			geohash: ghash,
		};
	});

	const isShowItems = query.zoom >= MIN_ZOOM_FOR_SHOW_PRICE;
	const precision = getPrecisionByZoom(query.zoom);

	const group = _.chain(listings)
		.groupBy(item => item.geohash.slice(0, precision))
		.map(items => {
			const lat = _.meanBy(items, 'lat');
			const lng = _.meanBy(items, 'lng');
			const ghash = geohash.encode(lat, lng);

			return {
				_id: ghash,
				lat: _.meanBy(items, 'lat'),
				lng: _.meanBy(items, 'lng'),
				geohash: ghash,
				firstItem: items[0].slug,
				count: items.length,
				dataType: DATA_TYPE.ROOM,
				items: isShowItems
					? items.map(item => ({
							id: item.id,
							slug: item.slug,
							price: item.price,
					  }))
					: undefined,
			};
		})
		.value();

	res.sendData({
		data: group,
		precision,
	});
}

async function getRoomSuggestions(req, res) {
	const { query, params } = req;

	const { listings } = await listingController.getListingsSuggestion({
		slug: params.slug,
		checkIn: query.check_in || query.checkIn,
		checkOut: query.check_out || query.checkOut,
		limit: 3,
		language: req.language,
	});

	const roomContents = await models.BlockStaticContent.find({
		otaListingId: {
			$in: _.map(listings, 'otaListingId'),
		},
	})
		.select({
			otaListingId: 1,
			'content.videos': { $slice: 1 },
			'content.images': { $slice: 1 },
			'content.vr': 1,
			'content.info': 1,
			'content.occupancy': 1,
		})
		.lean();

	const contentOvjs = _.keyBy(roomContents, 'otaListingId');

	const rs = _.map(listings, listing => {
		const block = listing.blockId;
		const price = _.head(listing.prices);

		const property = {
			id: block._id,
			address: {
				vi: _.get(block, 'info.address'),
				en: _.get(block, 'info.address_en'),
			},
			location: _.get(block, 'info.location'),
			name: _.get(block, 'info.name'),
			slug: _.get(block, 'info.url'),
		};

		const content = _.get(contentOvjs[listing.otaListingId], 'content');
		const media = filterRoomMedias(content);

		return {
			id: listing.otaListingId,
			price: {
				day: _.get(price, 'defaultPrice'),
				dayPromo: _.get(price, 'promoPrice'),
				VATPercent: _.get(price, 'VATPercent'),
				nights: _.get(price, 'nights'),
				ratePlan: _.get(listing.rate, 'ratePlanId'),
			},
			info: _.get(content, 'info') || {
				bathroom: _.get(listing.info, 'bathrooms'),
				bed: _.get(listing.info, 'beds'),
				bedroom: _.get(listing.info, 'bedrooms'),
			},
			displayName: listing.name,
			cover:
				_.get(media, 'vr[0].source') ||
				_.get(media, 'images[0].source') ||
				convertToStatic(_.get(listing.info, 'images[0]')),
			hasVR: !!media && !!media.vr.length,
			hasVideo: !!media && !!media.videos.length,
			dataType: DATA_TYPE.ROOM,
			viewType: CARD_TYPE.LARGE,
			slug: listing.url,
			property,
		};
	});

	res.sendData({ data: rs });
}

async function getListing(req, res) {
	const data =
		(await getProperty(req.params.slug, req.query, req.language)) ||
		(await getRoom(req.params.slug, req.query, req.language));

	res.sendData(data);
}

async function getProperty(slug, query, language) {
	let data = await listingController.getBlockByUrl(slug, {
		...query,
		checkIn: query.check_in || query.checkIn,
		checkOut: query.check_out || query.checkOut,
		language,
	});

	if (!data) {
		return null;
	}

	const [roomContents, propertyContent] = await Promise.all([
		models.BlockStaticContent.find({
			otaListingId: {
				$in: _.map(data.roomTypes, 'otaListingId'),
			},
			contentType: STATIC_CONTENT_TYPE.ROOM,
		})
			.select({
				otaListingId: 1,
				'content.type': 1,
				'content.images': { $slice: 1 },
				'content.vr': { $slice: 1 },
				'content.info': 1,
				'content.occupancy': 1,
			})
			.lean(),
		models.BlockStaticContent.findOne({
			blockId: data._id,
			contentType: STATIC_CONTENT_TYPE.PROPERTY,
		})
			.select({
				blockId: 1,
				'content.typeId': 1,
				'content.operator': 1,
				'content.address': 1,
				'content.location': 1,
				'content.districtId': 1,
				'content.provinceId': 1,
				'content.wardId': 1,
				'content.description': 1,
				'content.review': 1,
				'content.seo': 1,
				'content.images': 1,
				'content.vr': 1,
				'content.videos': 1,
				'content.area': 1,
			})
			.lean(),
	]);

	const content = _.get(propertyContent, 'content', null);

	const rs = {
		districtId: data.districtId,
		provinceId: data.provinceId,
		wardId: data.wardId,
		...content,
		typeId: getTypeIds(content),
		businessServices: [Services.Day],
		location: _.get(content, 'location') || _.get(data, 'info.location'),
		name: _.get(data.info, 'name'),
		slug: _.get(data.info, 'url'),
		blog: _.get(data.info, 'blog'),
		service: {
			wifiFee: _.get(content, 'service.wifiFee') || '',
			freeParking: parseInt(_.get(content, 'service.freeParking')) ? 1 : 0,
			freeWaterBottle: parseInt(_.get(content, 'service.waterBottleFee')) ? 0 : 1,
			towels: 1,
		},
		dataType: data.dataType,
	};

	if (!rs.address) {
		rs.address = {
			vi: _.get(data, 'info.address'),
			en: _.get(data, 'info.address_en'),
		};
	}

	rs.roomTypes = data.roomTypes.map(listing => {
		const roomMapper =
			_.get(
				roomContents.find(rt => rt.otaListingId === listing.otaListingId),
				'content'
			) || {};
		const price = _.head(listing.prices) || {};

		return {
			available: price.available || _.get(listing.roomIds, 'length'),
			id: listing.otaListingId,
			displayName: listing.name,
			images:
				roomMapper.images ||
				_.map(_.get(data, 'virtualRoomId.info.images'), image => ({ source: convertToStatic(image) })),
			vr: roomMapper.vr,
			info: roomMapper.info || {
				bathroom: _.get(listing.info, 'bathrooms'),
				bed: _.get(listing.info, 'beds'),
				bedroom: _.get(listing.info, 'bedrooms'),
			},
			occupancy: roomMapper.occupancy || {
				standardGuest: _.get(listing.info, 'accommodates'),
			},
			price: {
				day: price.defaultPrice,
				dayPromo: price.promoPrice,
				VATPercent: price.VATPercent,
				nights: price.nights,
				ratePlan: _.get(listing.rate, 'ratePlanId'),
			},
			slug: listing.url,
			type: roomMapper.type || {
				id: 1,
				name: { vi: 'Studio', en: 'Studio' },
				_id: 1,
			},
		};
	});

	rs.roomTypes = _.orderBy(rs.roomTypes, ['price.dayPromo'], ['asc']);

	return rs;
}

async function getPropertyLayout(req, res) {
	const { slug } = req.params;

	let block = await models.Block.findOne({
		isTest: { $ne: true },
		active: true,
		isProperty: true,
		'info.url': slug,
	})
		.select('_id')
		.lean();

	if (!block) return res.sendData({ layout: null });

	const propertyContent = await models.BlockStaticContent.findOne({
		blockId: block._id,
		contentType: STATIC_CONTENT_TYPE.PROPERTY,
	})
		.select({
			blockId: 1,
			'content.layout': 1,
		})
		.lean();

	const layout = _.get(propertyContent, 'content.layout');

	// const { listings, rooms } = await listingController.getBlockInfo(block._id, {
	// 	...req.query,
	// 	language: req.language,
	// });
	// const roomNoKeys = _.keyBy(rooms, 'info.roomNo');
	// const listingSlugKeys = _.keyBy(listings, 'url');

	// _.forEach(layout.layoutY, layoutY => {
	// 	_.forEach(layoutY.layoutX, layoutX => {
	// 		if (!layoutX.roomId || !layoutX.roomId.roomTypeId) return;

	// 		layoutX.roomId.status = ROOM_STATUS.AVAILABLE;

	// 		const mapRoom = roomNoKeys[layoutX.roomId.info.roomNo];
	// 		if (mapRoom) {
	// 			layoutX.roomId.active = true;
	// 			layoutX.roomId.status = mapRoom.available ? ROOM_STATUS.AVAILABLE : ROOM_STATUS.FULL;
	// 		}

	// 		const { roomTypeId } = layoutX.roomId;
	// 		if (roomTypeId) {
	// 			const mapListing = listingSlugKeys[roomTypeId.slug];
	// 			if (mapListing) {
	// 				_.set(roomTypeId, ['price', 'day'], mapListing.totalPrice);
	// 				_.set(roomTypeId, ['price', 'dayPromo'], mapListing.totalPromotionPrice);
	// 				_.set(roomTypeId, ['price', 'nights'], mapListing.nights);
	// 			}
	// 		}
	// 	});
	// });

	res.sendData({ layout });
}

function filterRoomMedias(content, roomId) {
	if (!content) return null;

	if (roomId) {
		const remoteRoomId = _.toString(
			_.get(
				_.find(content.rooms, item => item.id === parseInt(roomId)),
				'_id'
			)
		);
		const vrByRoomId = _.filter(content.vr, vr => vr.roomId && vr.roomId === remoteRoomId);
		const imgsByRoomId = _.filter(content.images, img => img.roomId && img.roomId === remoteRoomId);
		const videosByRoomId = _.filter(content.videos, v => v.roomId && v.roomId === remoteRoomId);

		return {
			vr: vrByRoomId.length ? vrByRoomId : _.filter(content.vr, vr => !vr.roomId),
			images: imgsByRoomId.length ? imgsByRoomId : _.filter(content.images, img => !img.roomId),
			videos: videosByRoomId.length ? videosByRoomId : _.filter(content.videos, v => !v.roomId),
		};
	}

	const vrs = _.filter(content.vr, vr => !vr.roomId);
	const images = _.filter(content.images, img => !img.roomId);
	const videos = _.filter(content.videos, video => !video.roomId);

	return {
		vr: vrs.length ? vrs : content.vr || [],
		images: images.length ? images : content.images || [],
		videos: videos.length ? videos : content.videos || [],
	};
}

async function getRoom(slug, query, language) {
	const listing = await listingController.getListingById(slug, {
		...query,
		checkIn: query.check_in || query.checkIn,
		checkOut: query.check_out || query.checkOut,
		language,
	});

	if (!listing) return null;

	const block = listing.blockId;

	const [roomContent, propertyData] = await Promise.all([
		models.BlockStaticContent.findOne({
			otaListingId: listing.otaListingId,
			contentType: STATIC_CONTENT_TYPE.ROOM,
		})
			.select({
				'content.type': 1,
				'content.images': 1,
				'content.vr': 1,
				'content.videos': 1,
				'content.info': 1,
				'content.occupancy': 1,
				'content.tags': 1,
				'content.tagsEn': 1,
				'content.description': 1,
				'content.direction': 1,
				'content.amenities': 1,
				'content.rooms': 1,
			})
			.lean(),
		models.BlockStaticContent.findOne({
			blockId: listing.blockId._id,
			contentType: STATIC_CONTENT_TYPE.PROPERTY,
		})
			.select({
				'content.typeId': 1,
				'content.operator': 1,
				'content.address': 1,
				'content.location': 1,
				'content.districtId': 1,
				'content.provinceId': 1,
				'content.wardId': 1,
				'content.seo': 1,
			})
			.lean(),
	]);

	const content = _.get(roomContent, 'content');
	const propertyContent = _.get(propertyData, 'content') || {};

	const property = {
		id: propertyContent.id || block._id,
		address: propertyContent.address || {
			vi: _.get(block, 'info.address'),
			en: _.get(block, 'info.address_en'),
		},
		businessServices: [Services.Day],
		location: _.get(block, 'info.location') || propertyContent.location,
		districtId: mapLocationText(propertyContent.districtId || block.districtId),
		provinceId: mapLocationText(propertyContent.provinceId || block.provinceId),
		wardId: mapLocationText(propertyContent.wardId || block.wardId),
		name: _.get(block.info, 'name'),
		slug: _.get(block.info, 'url'),
		blog: _.get(block.info, 'blog'),
		operator: propertyContent.operator || 1,
		typeId: getTypeIds(propertyContent),
	};

	const medias = filterRoomMedias(content, query.roomId);

	const rs = {
		id: listing.otaListingId,
		slug: listing.url,
		property,
		displayName: listing.name,
		seo: _.get(propertyContent, 'seo'),
		tags: getTags(content, language),
		...medias,
		type: _.get(content, 'type') || {
			id: 1,
			name: {
				vi: `${listing.info.beds || 1} Phòng ngủ`,
			},
		},
		onlinePayment: true,
		dataType: DATA_TYPE.ROOM,
		occupancy: _.get(content, 'occupancy') || {
			maxGuest: listing.info.accommodates,
			standardGuest: listing.info.accommodates,
		},
		info: _.get(content, 'info') || {
			bathroom: _.get(listing, 'info.bathrooms'),
			bed: _.get(listing, 'info.beds'),
			bedroom: _.get(listing, 'info.bedrooms'),
		},
		description: _.get(content, 'description') || {
			vi: _.get(listing, 'info.description_vn'),
			en: _.get(listing, 'info.description'),
		},
		direction: _.get(content, 'direction'),
		amenities:
			_.get(content, 'amenities') ||
			_.map(listing.info.amenities, (a, index) => ({
				id: {
					id: index + 1,
					name: {
						vi: a,
					},
					groupId: {
						id: 1,
						name: {
							vi: 'Amenities',
						},
					},
				},
			})),
		rooms: _.get(content, 'rooms'),
	};

	if (!medias || !medias.images.length) {
		rs.images = _.map(listing.info.images, img => ({
			source: convertToStatic(img),
		}));
	}

	return rs;
}

async function getPropertyPlaces(req, res) {
	let block = await models.Block.findOne({
		isTest: { $ne: true },
		active: true,
		isProperty: true,
		'info.url': req.params.slug,
	})
		.select('_id')
		.lean();

	if (!block) return res.sendData(null);

	const propertyContent = await models.BlockStaticContent.findOne({
		blockId: block._id,
		contentType: STATIC_CONTENT_TYPE.PROPERTY,
	})
		.select('content.place')
		.lean();

	res.sendData(_.get(propertyContent, 'content.place'));
}

async function getPropertyAllotment(req, res) {
	const { slug } = req.params;

	const { listings, rooms, from, to } = await listingController.getBlockInfo(slug, {
		...req.query,
		language: req.language,
	});

	const prices = _(listings)
		.orderBy(['totalPromotionPrice'], ['asc'])
		.uniqBy('otaListingId')
		.map(listing => ({
			id: listing.otaListingId,
			name: listing.otaListingName,
			ratePlanId: listing.ratePlanId,
			slug: listing.url,
			price: listing.totalPrice,
			promotionPrice: listing.totalPromotionPrice,
			nights: listing.nights,
		}))
		.value();

	const allotments = rooms.map(room => ({
		id: room._id,
		name: room.info.roomNo,
		status: room.available ? ROOM_STATUS.AVAILABLE : ROOM_STATUS.FULL,
		active: true,
	}));

	res.sendData({
		prices,
		allotments,
		checkIn: new Date(from).toDateMysqlFormat(),
		checkOut: new Date(to).toDateMysqlFormat(),
	});
}

router.getS('/branch', getBranchs);

router.getS('/room', getRooms);
router.getS('/room/geo', getRoomsGeo);
router.getS('/room/:slug', getListing);
router.getS('/room/:slug/available', getRoomAvailable);
router.getS('/room/:slug/price', getRoomPrice);
router.getS('/room/:slug/suggestion', getRoomSuggestions);

router.getS('/:slug', getListing);
router.getS('/:slug/allotment', getPropertyAllotment);
router.getS('/:slug/layout', useCache(), getPropertyLayout);
router.getS('/:slug/place', useCache(), getPropertyPlaces);

module.exports = { router };
