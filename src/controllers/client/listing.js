const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const models = require('@models');
const { OTAs, Services } = require('@utils/const');
const { logger } = require('@utils/logger');
const { removeAccents } = require('@utils/generate');
const { rangeDate } = require('@utils/date');
const { Settings } = require('@utils/setting');

const { getPromotionPrice } = require('@controllers/promotion/promotion.config');
const { throwError, ERROR_CODE } = require('./error');

const MAX_DAY_LENGTH = 60;

function getVATPercent() {
	return (Settings.VATFee.value || 0) / 100;
}

async function getPipeline(query, user) {
	let {
		checkIn,
		checkOut,
		guests,
		beds,
		bedrooms,
		bathrooms,
		min_price,
		max_price,
		blockId,
		roomId,
		ne_lat,
		ne_lng,
		sw_lat,
		sw_lng,
		otaListingIds,
		slug,
		available,
		rateType,
		roomTypeId,
		ratePlanId,
		serviceType,
		rooms,
		tag,
	} = query;

	serviceType = parseInt(serviceType) || Services.Day;
	rooms = parseInt(rooms);

	const blockQuery = _.pickBy({
		districtId: parseInt(query.district),
		provinceId: parseInt(query.province),
		wardId: parseInt(query.ward),
		streetId: parseInt(query.street),
	});
	if (+ne_lat && +ne_lng && +sw_lat && +sw_lng) {
		blockQuery['info.location'] = {
			$geoWithin: {
				$box: [
					[+ne_lng, +ne_lat],
					[+sw_lng, +sw_lat],
				],
			},
		};
	}

	if (blockId) {
		blockQuery._id = blockId;
	}
	if (user) {
		const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId });
		blockQuery._id = blockIds;
	}

	let activeHomes = await models.Block.getActiveBlock(blockQuery);

	let otas = [OTAs.CozrumWeb];

	if (user) {
		otas.push(OTAs.Cozrum);
	}
	if (rateType === 'walkin') {
		otas = [OTAs.Cozrum];
	}
	if (rateType === 'online') {
		otas = [OTAs.CozrumWeb];
	}

	const listingFilter = {
		blockId: { $in: activeHomes },
		public: true,
		OTAs: {
			$elemMatch: {
				otaName: { $in: otas },
				active: true,
				// serviceTypes: Services.Day,
				'rates.active': true,
			},
		},
	};

	if (roomTypeId) {
		listingFilter.roomTypeId = mongoose.Types.ObjectId(roomTypeId);
	}
	if (roomId) {
		listingFilter.roomIds = mongoose.Types.ObjectId(roomId);
	}
	if (guests) {
		listingFilter['info.accommodates'] = { $gte: Number(guests) || 1 };
	}
	if (beds) {
		listingFilter['info.beds'] = { $gte: Number(beds) || 1 };
	}
	if (bedrooms) {
		listingFilter['info.bedrooms'] = { $gte: Number(bedrooms) || 1 };
	}
	if (bathrooms) {
		listingFilter['info.bathrooms'] = { $gte: Number(bathrooms) || 1 };
	}
	if (tag) {
		listingFilter.keywords = tag;
	}

	const otaMatch = {
		'OTAs.otaName': { $in: otas },
		'OTAs.active': true,
		// 'OTAs.serviceTypes': Services.Day,
	};

	if (otaListingIds) {
		otaListingIds = _.isArray(otaListingIds) ? otaListingIds : otaListingIds.split(',');

		_.set(listingFilter, ['OTAs', '$elemMatch', 'otaListingId', '$in'], otaListingIds);
		otaMatch['OTAs.otaListingId'] = { $in: otaListingIds };
	}

	const rateMatch = { 'rate.active': true, 'rate.serviceType': serviceType };
	if (ratePlanId) {
		rateMatch['rate.ratePlanId'] = Number(ratePlanId);
	}

	const listing = slug && (await models.Listing.findOne({ url: slug }).select('location'));

	const firstMatch =
		listing && listing.location
			? [
					{
						$geoNear: {
							near: listing.location,
							distanceField: 'distance',
							spherical: true,
							maxDistance: 50000,
							query: {
								...listingFilter,
								_id: { $ne: listing._id },
							},
						},
					},
					{
						$sort: {
							distance: 1,
						},
					},
			  ]
			: [{ $match: listingFilter }];

	const pipeline = _.compact([
		...firstMatch,
		{
			$unwind: '$OTAs',
		},
		{
			$match: otaMatch,
		},
		{
			$project: {
				url: 1,
				blockId: 1,
				roomIds: 1,
				name: '$OTAs.otaListingName',
				otaListingId: '$OTAs.otaListingId',
				rate: '$OTAs.rates',
				roomTypeId: 1,
				createdAt: 1,
				order: 1,
				'info.roomType': 1,
				'info.bathrooms': 1,
				'info.bedrooms': 1,
				'info.accommodates': 1,
				'info.beds': 1,
				'info.images': { $slice: ['$info.images', 2] },
			},
		},
		{
			$unwind: '$rate',
		},
		rateMatch && {
			$match: rateMatch,
		},
		{
			$lookup: {
				from: models.CozrumPrice.collection.name,
				let: { roomTypeId: '$roomTypeId', ratePlanId: '$rate.ratePlanId' },
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [
									{ $eq: ['$roomTypeId', '$$roomTypeId'] },
									{ $eq: ['$ratePlanId', '$$ratePlanId'] },
									{
										$or: rangeDate(checkIn, checkOut, false).map(date => ({
											$eq: ['$date', date],
										})),
									},
								],
							},
						},
					},
					{
						$group: {
							_id: null,
							promoPrice: {
								$sum: { $cond: [{ $gt: ['$promotionPrice', 0] }, '$promotionPrice', '$price'] },
							},
							defaultPrice: { $sum: '$price' },
							available: { $min: '$available' },
							nights: { $sum: 1 },
						},
					},
				],
				as: 'prices',
			},
		},
	]);

	const availableMatch = {};

	if (available && available !== '1') {
		if (available === '0') {
			_.set(availableMatch, ['prices.available', '$eq'], 0);
		}
	} else {
		_.set(availableMatch, ['prices.available', '$gt'], 0);
	}

	if (rooms && rooms > 0) {
		_.set(availableMatch, ['prices.available', '$gte'], rooms);
	}

	if (min_price) {
		_.set(availableMatch, ['prices.promoPrice', '$gte'], Number(min_price));

		// _.set(availableMatch, ['$or', 0, 'prices.promoPrice', '$gte'], Number(min_price));
		// _.set(availableMatch, ['$or', 1, 'prices.defaultPrice', '$gte'], Number(min_price));
	} else {
		_.set(availableMatch, ['prices.promoPrice', '$gt'], 0);
	}

	if (max_price) {
		_.set(availableMatch, ['prices.promoPrice', '$lte'], Number(max_price));

		// _.set(availableMatch, ['$or', 0, 'prices.promoPrice', '$lte'], Number(max_price));
		// _.set(availableMatch, ['$or', 1, 'prices.defaultPrice', '$lte'], Number(max_price));
	}

	if (!_.isEmpty(availableMatch)) {
		pipeline.push({
			$match: availableMatch,
		});
	}

	return pipeline;
}

async function updateViewCount(Model, ids) {
	ids = _.compact(ids);
	if (!ids || !ids.length) return;

	await Model.updateMany({ _id: { $in: ids } }, { $inc: { view: 1 } });
}

function getSorter(sort, sort_type) {
	const sorter = {};

	// newest / recommended / price
	if (sort === 'newest') {
		sorter.createdAt = -1;
	} else if (sort === 'price') {
		const s = sort_type === 'desc' ? -1 : 1;
		sorter['prices.promoPrice'] = s;
		sorter.order = 1;
		sorter.createdAt = -1;
		// sorter['prices.defaultPrice'] = s;
	} else {
		sorter.order = 1;
		sorter.createdAt = -1;
	}

	return sorter;
}

async function _getListingsProcessing(query, showTotal, user) {
	const { checkIn, checkOut, sort, sort_type } = query;

	const pipeline = await getPipeline(query, user);

	const sorter = getSorter(sort, sort_type);

	const project = {
		available: 1,
		blockId: 1,
		info: 1,
		name: 1,
		otaListingId: 1,
		prices: 1,
		url: 1,
		createdAt: 1,
		rate: 1,
		roomTypeId: 1,
	};
	if (user) {
		project.roomIds = 1;
	} else {
		project.roomIds = { $arrayElemAt: ['$roomIds', 0] };
	}

	const [listings, total] = await Promise.all([
		models.Listing.aggregate([
			...pipeline,
			{
				$sort: sorter,
			},
			{
				$skip: query.start,
			},
			{
				$limit: query.limit,
			},
			{
				$project: project,
			},
		]),
		showTotal &&
			models.Listing.aggregate([
				...pipeline,
				{ $group: { _id: null, total: { $sum: 1 } } },
				{ $project: { _id: 0 } },
			]).then(rs => _.get(rs, [0, 'total'], 0)),
	]);

	const VATPercent = getVATPercent();
	const vatRate = 1 + VATPercent;
	const populate = [];

	if (showTotal) {
		populate.push({
			path: 'blockId',
			select: '_id info provinceId districtId wardId',
			options: { lean: true },
		});
	}

	if (user) {
		populate.push(
			{
				path: 'roomIds',
				select: 'info.roomNo',
				options: { lean: true },
			},
			{
				path: 'roomTypeId',
				select: 'name',
				options: { lean: true },
			}
		);
	}

	await Promise.all([
		populate.length && models.Listing.populate(listings, populate),
		models.RatePlan.populate(listings, {
			path: 'rate.ratePlanId',
			select: 'policies benefits name nameEn',
			populate: {
				path: 'policies.policyId',
				select: 'displayName displayNameEn type',
			},
			options: { lean: true },
		}),
	]);

	if (user) {
		await listings.asyncMap(async listing => {
			listing.available = await models.BlockScheduler.findAvailableRooms(
				listing.roomIds.map(r => r._id),
				_.get(listing, 'blockId._id') || listing.blockId,
				checkIn,
				checkOut
			);
		});
	}

	listings.forEach(l => {
		// const mapperId = _.chain(l.blockId.OTAProperties)
		// 	.find(ota => ota.otaName === OTAs.Famiroom)
		// 	.get('propertyId')
		// 	.value();

		// const roomNos = _.map(l.roomIds, 'info.roomNo');
		// l.roomNos = roomNos;

		if (!user) {
			l.roomIds = undefined;
		}

		// if (mapperId) {
		// 	l.blockId = { ...l.blockId, mapperId };
		// }

		// l.blockId.OTAProperties = undefined;

		const temp = _.head(l.prices);
		if (!temp) return;

		l.prices = [
			{
				...temp,
				VATPercent,
				noVATPrice: _.round(temp.defaultPrice / vatRate),
				noVATPromoPrice: _.round(temp.promoPrice / vatRate),
			},
		];
	});

	if (!user) {
		updateViewCount(models.Listing, _.map(listings, '_id'));
	}

	return {
		listings,
		total,
		checkIn,
		checkOut,
	};
}

async function _getListingsSuggestions(query) {
	const pipeline = await getPipeline(query);

	const project = {
		available: 1,
		blockId: 1,
		info: 1,
		name: 1,
		otaListingId: 1,
		prices: 1,
		url: 1,
		createdAt: 1,
		rate: 1,
		roomIds: { $arrayElemAt: ['$roomIds', 0] },
	};

	const listings = await models.Listing.aggregate([
		...pipeline,
		{
			$project: project,
		},
		{
			$limit: query.limit,
		},
	]);

	const VATPercent = getVATPercent();
	const vatRate = 1 + VATPercent;

	await Promise.all([
		models.Listing.populate(listings, [
			{
				path: 'blockId',
				select: '_id info',
				options: { lean: true },
			},
			// {
			// 	path: 'roomIds',
			// 	select: 'info.roomNo',
			// 	options: { lean: true },
			// },
		]),
		models.RatePlan.populate(listings, {
			path: 'rate.ratePlanId',
			select: 'policies benefits name nameEn',
			populate: {
				path: 'policies.policyId',
				select: 'displayName displayNameEn type',
			},
			options: { lean: true },
		}),
	]);

	listings.forEach(l => {
		const temp = _.head(l.prices);
		if (!temp) return;

		// const mapperId = _.chain(l.blockId.OTAProperties)
		// 	.find(ota => ota.otaName === OTAs.Famiroom)
		// 	.get('propertyId')
		// 	.value();
		// const roomNos = _.map(l.roomIds, 'info.roomNo');
		// if (mapperId) {
		// 	l.blockId = { ...l.blockId, mapperId };
		// }
		// l.blockId.OTAProperties = undefined;
		// l.roomIds = undefined;
		// l.roomNos = roomNos;
		l.prices = [
			{
				...temp,
				VATPercent,
				noVATPrice: _.round(temp.defaultPrice / vatRate),
				noVATPromoPrice: _.round(temp.promoPrice / vatRate),
			},
		];
	});

	return {
		listings,
	};
}

async function validateQuery(data) {
	data.start = parseInt(data.start || 0);
	data.limit = Math.min(parseInt(data.limit || 20), 100);

	const checkIn = data.check_in || data.checkIn;
	const checkOut = data.check_out || data.checkOut;

	data.checkIn = checkIn && moment(checkIn).isValid() ? new Date(checkIn) : new Date();
	data.checkOut =
		checkOut && moment(checkOut).isValid() ? new Date(checkOut) : moment(data.checkIn).add(1, 'day').toDate();

	data.checkIn.zeroHours();
	data.checkOut.zeroHours();

	if (moment(data.checkOut).diff(data.checkIn, 'day') > MAX_DAY_LENGTH) {
		return throwError(ERROR_CODE.OUT_OF_RANGE, data.language, [MAX_DAY_LENGTH]);
	}

	if (data.blockId) {
		if (mongoose.Types.ObjectId.isValid(data.blockId)) {
			data.blockId = mongoose.Types.ObjectId(data.blockId);
		} else {
			const block = await models.Block.findOne({
				'info.url': data.blockId,
			})
				.select('_id')
				.lean();

			data.blockId = block && block._id;
		}
	}
}

async function getSellingListings(data, showTotal = true) {
	await validateQuery(data);

	return _getListingsProcessing(data, showTotal);
}

async function getCMSellingListings(data, user) {
	await validateQuery(data);

	const { listings, total } = await _getListingsProcessing(data, true, user);

	const roomContents = await models.BlockStaticContent.find({
		otaListingId: {
			$in: _.map(listings, 'otaListingId'),
		},
	})
		.select({
			otaListingId: 1,
			'content.images': { $slice: 1 },
			'content.vr': { $slice: 1 },
		})
		.lean();

	const contentOvjs = _.keyBy(roomContents, 'otaListingId');

	listings.forEach(listing => {
		const content = _.get(contentOvjs[listing.otaListingId], 'content');

		if (content) {
			const cover = _.get(content, 'vr[0].source.url.medium') || _.get(content, 'images[0].source.url.medium');
			if (cover) {
				_.set(listing, ['info', 'images'], [cover]);
			}
		}
	});

	return { listings, total };
}

async function getListingsSuggestion(data) {
	await validateQuery(data);

	const { listings } = await _getListingsSuggestions(data);

	return { listings };
}

async function getListingMaps(data) {
	await validateQuery(data);

	const pipeline = await getPipeline(data);

	const listings = await models.Listing.aggregate([
		...pipeline,
		{
			$project: {
				available: 1,
				blockId: 1,
				info: 1,
				name: 1,
				otaListingId: 1,
				prices: 1,
				url: 1,
			},
		},
	]);

	await models.Listing.populate(listings, {
		path: 'blockId',
		select: 'info provinceId districtId wardId',
	});

	listings.forEach(l => {
		const temp = l.prices[0];
		if (!temp) return;

		l.prices = {
			price: temp.defaultPrice,
			promoPrice: temp.promoPrice,
		};
	});

	return {
		listings,
	};
}

async function getBlocks({ wardId, districtId, provinceId, streetId }) {
	const blocks = await models.Block.find(
		_.pickBy({
			active: true,
			isProperty: true,
			isTest: { $eq: false },
			visibleOnWebsite: { $ne: false },
			'listingIds.0': { $exists: true },
			wardId: parseInt(wardId),
			districtId: parseInt(districtId),
			provinceId: parseInt(provinceId),
			streetId: parseInt(streetId),
		})
	).select('info provinceId districtId wardId streetId');

	return blocks;
}

async function getListingById(listingId) {
	let listing = await models.Listing.findBySlugOrId(listingId)
		.populate('blockId', 'info OTAProperties wardId provinceId districtId')
		.populate('roomIds', 'info')
		.lean();

	if (listing) {
		listing.dataType = 'room';

		const mapperId = _.chain(listing.blockId.OTAProperties)
			.find(ota => ota.otaName === OTAs.Famiroom)
			.get('propertyId')
			.value();

		const roomNos = _.map(listing.roomIds, 'info.roomNo');
		listing.roomNos = roomNos;
		listing.roomIds = undefined;

		const cozrumOTA = _.find(listing.OTAs, { active: true, otaName: OTAs.CozrumWeb });

		listing.otaListingId = _.get(cozrumOTA, 'otaListingId');

		if (mapperId) {
			listing.blockId = { ...listing.blockId, mapperId };
		}

		listing.blockId.OTAProperties = undefined;

		const localOTA = _.find(listing && listing.OTAs, o => o.otaName === OTAs.CozrumWeb);
		if (localOTA) listing.name = localOTA.otaListingName || listing.name;
	}

	return listing;
}

async function getBlockByUrl(url, query) {
	let data = await models.Block.findOne({
		active: true,
		isProperty: true,
		'info.url': url,
		isTest: { $ne: true },
	})
		.select('info virtualRoomId')
		.populate('virtualRoomId', 'info.images')
		.lean();

	if (data) {
		data.dataType = 'property';

		// const mapperId = _.chain(data.OTAProperties)
		// 	.find(ota => ota.otaName === OTAs.Famiroom)
		// 	.get('propertyId')
		// 	.value();
		// data.OTAProperties = undefined;

		// if (mapperId) {
		// 	data.mapperId = mapperId;
		// }

		const { listings } = await getSellingListings(
			{
				...query,
				blockId: data._id,
			},
			false
		);

		data.roomTypes = listings;
	}

	return data;
}

async function getListingPrice(listingId, query) {
	let { from, to } = validateDate(query, 'day');
	let { rooms, businessService, language } = query;

	rooms = parseInt(rooms) || 1;
	const serviceType = parseInt(businessService) || Services.Day;

	const listing = await models.Listing.findBySlugOrId(listingId);
	const ota = _.find(listing && listing.OTAs, o => o.otaName === OTAs.CozrumWeb);
	if (!ota) {
		logger.error('getListingPrice not found', listingId, query, listing);
		return throwError(ERROR_CODE.NOT_FOUND_LISTING, language);
	}

	try {
		const prices = await ota.rates
			.filter(r => r.ratePlanId && r.active && r.serviceType === serviceType)
			.asyncMap(rate =>
				getPromotionPrice({
					blockId: listing.blockId,
					roomTypeId: listing.roomTypeId,
					roomIds: listing.roomIds,
					checkIn: from,
					checkOut: to,
					otaListingId: ota.otaListingId,
					numRoom: rooms,
					ratePlanId: rate.ratePlanId,
				})
			);

		return {
			...prices[0],
			ratePlans: prices,
			checkIn: new Date(from).toDateMysqlFormat(),
			checkOut: new Date(to).toDateMysqlFormat(),
		};
	} catch (e) {
		logger.error(e);
		throwError(ERROR_CODE.DEFAULT, language);
	}
}

async function searchListings({ keyword, page, limit }) {
	keyword = _.escapeRegExp(_.trim(keyword));
	page = Math.max(parseInt(page) || 1, 1);
	limit = Math.min(parseInt(limit) || 10, 50);

	const regex = keyword && new RegExp(keyword, 'i');

	const query = {
		active: true,
		isProperty: true,
		isTest: false,
		visibleOnWebsite: { $ne: false },
	};

	if (regex) {
		query.$or = [
			{
				'info.name': regex,
			},
			{
				'info.address': regex,
			},
			{
				keywords: new RegExp(removeAccents(keyword)),
			},
		];
	}

	const skip = (page - 1) * limit;

	const blocks = await models.Block.find(query)
		.sort({
			order: 1,
			createdAt: -1,
		})
		.skip(skip)
		.limit(limit)
		.select('virtualRoomId info wardId districtId provinceId')
		.populate('virtualRoomId', 'info.images')
		.lean();

	const properties = blocks.map(block => {
		const address = _.get(block, 'info.address');
		return {
			type: 'property',
			displayText: {
				vi: block.info.name,
				en: block.info.name,
			},
			meta: {
				id: block.info.url,
				slug: block.info.url,
				displayName: block.info.name,
				cover: _.get(block, 'virtualRoomId.info.images[0]'),
				wardId: block.wardId,
				districtId: block.districtId,
				provinceId: block.provinceId,
				address: {
					vi: address,
					en: _.get(block, 'info.address_en') || address,
				},
				images: undefined,
				blockId: undefined,
			},
		};
	});

	return {
		// bestMatch: [...properties, ...rooms],
		bestMatch: properties,
	};
}

function validateDate({ from, to, language }, type = 'month') {
	from = from ? new Date(from) : new Date();
	from.zeroHours();

	if (to) {
		to = new Date(to);
	} else {
		to = moment().add(1, type).toDate();
	}
	to.zeroHours();

	// const today = new Date().zeroHours();
	// if (from < today) {
	// 	from = today;
	// }
	if (from > to) {
		throwError(ERROR_CODE.INVALID_RANGE, language);
	}

	if (moment(to).diff(from, 'day') > MAX_DAY_LENGTH) {
		return throwError(ERROR_CODE.OUT_OF_RANGE, language, [MAX_DAY_LENGTH]);
	}

	return {
		from,
		to,
	};
}

async function getListingAvailable(listingId, query) {
	const { from, to } = validateDate(query);
	const { ratePlanId, language } = query;

	const listing = await models.Listing.findBySlugOrId(listingId).select('OTAs roomTypeId');
	const localOTA = _.find(listing && listing.OTAs, o => o.otaName === OTAs.CozrumWeb);
	if (!localOTA) {
		return throwError(ERROR_CODE.NOT_FOUND_LISTING, language);
	}

	const filter = {
		date: {
			$gte: from,
			$lte: to,
		},
		roomTypeId: listing.roomTypeId,
	};

	if (ratePlanId) {
		filter.ratePlanId = Number(ratePlanId);
	} else {
		filter.ratePlanId = _.get(
			_.find(localOTA.rates, r => r.active),
			'ratePlanId'
		);
	}

	const dates = await models.CozrumPrice.find(filter).select('-_id date available');

	return { dates };
}

async function getListingsInfo(blockId, from, to) {
	const listings = await models.Listing.aggregate()
		.match({
			blockId,
			OTAs: {
				$elemMatch: {
					active: true,
					otaName: OTAs.CozrumWeb,
					'rates.active': true,
				},
			},
		})
		.unwind('$OTAs')
		.match({
			'OTAs.active': true,
			'OTAs.otaName': OTAs.CozrumWeb,
		})
		.unwind('$OTAs.rates')
		.match({
			'OTAs.rates.active': true,
			'OTAs.rates.ratePlanId': { $ne: null },
		})
		.project({
			otaListingId: '$OTAs.otaListingId',
			otaListingName: '$OTAs.otaListingName',
			ratePlanId: '$OTAs.rates.ratePlanId',
			roomTypeId: 1,
			roomIds: 1,
			url: 1,
		});

	const calendar = await models.CozrumPrice.aggregate()
		.match({
			date: {
				$gte: from,
				$lt: to,
			},
			roomTypeId: { $in: _.map(listings, 'roomTypeId') },
			ratePlanId: { $in: _.uniq(_.map(listings, 'ratePlanId')) },
		})
		.group({
			_id: { roomTypeId: '$roomTypeId', ratePlanId: '$ratePlanId' },
			totalPromotionPrice: {
				$sum: { $cond: [{ $gt: ['$promotionPrice', 0] }, '$promotionPrice', '$price'] },
			},
			totalPrice: { $sum: '$price' },
			available: { $min: '$available' },
			nights: { $sum: 1 },
		});

	const calendarObj = _.keyBy(calendar, c => c._id.roomTypeId + c._id.ratePlanId);

	return listings.map(listing => ({
		...listing,
		...(calendarObj[listing.roomTypeId + listing.ratePlanId] || null),
	}));
}

async function getRoomsInfo(blockId, from, to) {
	const [roomsData, blockSchedules, rules] = await Promise.all([
		models.Room.find({ blockId, virtual: false, isSelling: [true, null] })
			.select('_id info.roomNo info.name relationRoomIds')
			.lean(),
		models.BlockScheduler.find({
			blockId,
			date: {
				$gte: from,
				$lt: to,
			},
		}),
		models.Block.getRules(blockId),
	]);

	const options = {
		rules,
		serviceType: Services.Day,
	};

	const rooms = [];

	roomsData.forEach(room => {
		const relationRooms = _.mapKeys(room.relationRoomIds);

		const unAvailable = blockSchedules.length
			? blockSchedules.some(schedule => !schedule.isAvailable(relationRooms, options))
			: false;

		rooms.push({
			_id: room._id,
			info: room.info,
			available: !unAvailable,
		});
	});

	return rooms;
}

async function getBlockInfo(blockId, query) {
	const block = await models.Block.findBySlugOrId(blockId).select('info.name info.address info.url').lean();
	if (!block) {
		return throwError(ERROR_CODE.NOT_FOUND_PROPERTY, query.language);
	}

	const { from, to } = validateDate({ from: query.check_in || query.from, to: query.check_out || query.to }, 'day');

	const [listings, rooms] = await Promise.all([
		getListingsInfo(block._id, from, to),
		getRoomsInfo(block._id, from, to),
	]);

	return { ...block, listings, rooms, from, to };
}

module.exports = {
	getSellingListings,
	getListingsSuggestion,
	getListingMaps,
	getBlocks,
	getListingById,
	getBlockByUrl,
	getListingPrice,
	getListingAvailable,
	searchListings,
	getBlockInfo,
	getCMSellingListings,
};
