const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const Const = require('@utils/const');
const { SYS_EVENTS, sysEventEmitter } = require('@utils/events');
const { updateDoc } = require('@utils/schema');
const { logger } = require('@utils/logger');
const { nanoid } = require('@utils/generate');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

// const { synchronizeSchedules } = require('@controllers/sync');
const { fetchListingDetail } = require('@controllers/sync/crawler');
const crawlers = require('@controllers/ota_api/crawler_reservations');
// const { syncRates } = require('@controllers/rate/rate.controller');

async function createListing(req, res) {
	const { blockId, roomIds, cloneId } = req.body;

	if (!_.isArray(roomIds) || roomIds.length === 0) {
		throw new ThrowReturn('roomIds must be an array and not empty');
	}

	const listing = new models.Listing(req.body);
	const block = await models.Block.findOne({ _id: blockId }).select('info.location');
	if (_.get(block, 'info.location')) {
		listing.location = _.get(block, 'info.location');
	}
	if (cloneId) {
		const cloneListing = await models.Listing.findById(cloneId).select('info');
		if (cloneListing) {
			listing.info = cloneListing.info;
		}
	}

	listing.createdBy = req.decoded.user._id;
	await listing.save();

	await models.Block.updateOne({ _id: blockId }, { $addToSet: { listingIds: listing._id } });

	res.sendData({ listing });
}

async function updateListing(req, res) {
	const { listing } = req.data;
	const { roomIds, OTAs } = req.body;

	// check allow multi rooms listing
	// const listingRooms = roomIds || listing.roomIds;
	// if (listingRooms && listingRooms.length > 1 && !listing.isMultiRoomsListing(OTAs)) {
	// 	throw new ThrowReturn("This listing's OTA require one room only");
	// }

	const prevRoomIds = _.map(listing.roomIds, r => _.toString(r));
	const otasChanged = [];

	if (OTAs) {
		const localOTAs = _.values(Const.LocalOTAs);

		if (
			_(OTAs)
				.groupBy('otaName')
				.some(v => v.length > 1)
		) {
			throw new ThrowReturn(`This listing have a duplicated OTA`);
		}

		await OTAs.asyncMap(async (data, index) => {
			const oldData = listing.OTAs.find(ota => ota.otaName === data.otaName);
			const oldJsonData = oldData && oldData.toJSON();
			const isLocalOTA = localOTAs.includes(data.otaName);

			if (isLocalOTA && !oldJsonData) {
				data.otaListingId = nanoid(10);
			}

			const fields = isLocalOTA ? ['otaName'] : ['otaName', 'otaListingId', 'account'];

			if (!_.isEqual(_.pick(oldJsonData, fields), _.pick(data, fields))) {
				// changed
				otasChanged.push({ currentData: data, oldData: oldJsonData, blockId: listing.blockId });
				const fetchConfig = _.get(crawlers, [data.otaName, 'fetchListingConfig']);

				if (typeof fetchConfig === 'function') {
					const [account] = await models.OTAManager.findByName(data.otaName, data.account);
					const config = await fetchConfig(data, account);
					if (!config) {
						throw new ThrowReturn(`Can'n find ID '${data.otaListingId}' on ${data.otaName}`);
					}
					_.assign(data, config);
				}
			} else if (!oldJsonData || !_.isEqual(oldJsonData.rates, data.rates)) {
				otasChanged.push({ currentData: data, oldData: oldJsonData, blockId: listing.blockId });
			}

			if (data.rates) {
				const ratePlans = await models.RatePlan.find({ _id: _.map(data.rates, 'ratePlanId') }).lean();

				data.rates.forEach(rate => {
					const ratePlan = ratePlans.find(r => r._id === rate.ratePlanId);
					rate.active = ratePlan.active;
					rate.serviceType = ratePlan.serviceType;
				});
			}

			OTAs[index] = _.assign(oldData, data);
		});
	}

	// if (cloneId) {
	// 	const cloneListing = await models.Listing.findById(cloneId).select('info');
	// 	if (cloneListing) {
	// 		req.body.info = cloneListing.info;
	// 	}
	// }

	// update listing
	await updateDoc(listing, req.body);

	if (roomIds && !_.isEqual(prevRoomIds, roomIds)) {
		const from = moment().startOf('days').toDate();
		const to = moment(from).add(6, 'month').toDate();

		models.JobCalendar.createByListing({
			listingIds: listing._id,
			from,
			to,
			description: 'Update Listing Rooms',
		});
	}

	if (otasChanged.length) {
		const from = moment().startOf('days').toDate();
		const to = moment(from).add(6, 'month').toDate();

		otasChanged.asyncMap(ota =>
			models.JobCalendar.createByListing({
				listingIds: listing._id,
				from,
				to,
				description: 'Update OTA Listing',
				otas: [
					{
						otaName: ota.currentData.otaName,
						account: ota.currentData.account,
					},
				],
			})
		);
	}

	// check fetch listing data
	if (!listing.info.description && listing.getOTA(Const.OTAs.Airbnb)) {
		fetchListingDetail(Const.OTAs.Airbnb, listing._id).catch(e => {
			logger.error(e);
		});
	}

	if (otasChanged.length) {
		otasChanged.forEach(data => {
			sysEventEmitter.emit(SYS_EVENTS.LISTING_UPDATE, data, listing);
			// syncRates({ blockId: listing.blockId, otaName }).catch(e => {
			// 	logger.error(e);
			// });
		});
	}

	res.sendData({ listing: _.pick(listing, _.keys(req.body)) });
}

async function fetchListingInfo(req, res) {
	const { listingId, otaName } = req.params;

	const listing = await fetchListingDetail(otaName, listingId);

	res.sendData({ listing });
}

async function getListings(req, res) {
	let { start, limit, blockId, ota, active, name, excludeBlockId } = req.query;
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const { filters } = await models.Host.getBlocksOfUser({
		user: req.decoded.user,
		filterBlockIds: blockId,
		excludeBlockId,
	});

	const match1 = {
		...filters,
	};

	const match2 = {};
	if (ota) {
		match2['OTAs.otaName'] = { $in: ota.split(',') };
	}
	if (active) {
		match2['OTAs.active'] = active === 'true';
	}
	if (name) {
		match2['OTAs.otaListingName'] = new RegExp(_.escapeRegExp(name), 'i');
	}

	const listings = await models.Listing.aggregate([
		{ $match: { ...match1, ...match2 } },
		{ $unwind: '$OTAs' },
		{ $match: match2 },
		{ $sort: { blockId: 1, 'OTAs.otaName': 1 } },
		{ $skip: start },
		{ $limit: limit },
	]);

	const count = await models.Listing.aggregate([
		{ $match: { ...match1, ...match2 } },
		{ $unwind: '$OTAs' },
		{ $match: match2 },
		{ $group: { _id: null, count: { $sum: 1 } } },
	]).then(results => _.get(results, [0, 'count'], 0));

	await models.Listing.populate(listings, [
		{
			path: 'blockId',
			select: 'info.name info.address',
		},
		{
			path: 'roomIds',
			select: 'info.name info.roomNo',
		},
	]);

	res.sendData({ listings, count });
}

async function getListing(req, res) {
	let { otaName } = req.params;
	let { listing } = req.data;

	await models.Listing.populate(listing, [
		{
			path: 'blockId',
			select: 'info.name info.address',
		},
		{
			path: 'roomIds',
			select: 'info.name info.roomNo info.images',
		},
	]);

	if (!listing.getOTA(otaName)) {
		throw new ThrowReturn('Listing not found');
	}

	listing.OTAs = listing.OTAs.filter(ota => ota.otaName === otaName);

	res.sendData({ listing });
}

async function syncListing(req, res) {
	const { listingId } = req.params;
	const { otas, blockId, from, to } = req.body;

	const ffrom = from || new Date().zeroHours();
	const fto = to || moment(ffrom).add(6, 'month').toDate().zeroHours();

	let listingIds;

	if (blockId) {
		const query = { blockId };
		if (otas) {
			query.OTAs = {
				$elemMatch: { otaName: { $in: otas }, active: true },
			};
		}
		const listings = await models.Listing.find(query).select('_id');

		// await listings.asyncForEach(l => synchronizeSchedules({ listingId: l._id, from, to, otas }));

		listingIds = _.map(listings, '_id');
	} else {
		// await synchronizeSchedules({ listingId, from, to, otas });
		listingIds = [mongoose.Types.ObjectId(listingId)];
	}

	await models.JobCalendar.createByListing({
		listingIds,
		from: ffrom,
		to: fto,
		otas,
		description: 'Manual sync',
	});

	res.sendData();
}

module.exports = {
	getListings,
	getListing,
	createListing,
	updateListing,
	fetchListingInfo,
	syncListing,
};
