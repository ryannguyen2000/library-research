const mongoose = require('mongoose');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { OTAs, Services } = require('@utils/const');
const { SYS_EVENTS, sysEventEmitter } = require('@utils/events');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const Rate = require('@controllers/ota_api/rates');
// const { syncRatesForNotHaveRatePlanOTA } = require('./utils');

function validateRate(rate) {
	return Object.values(OTAs)
		.filter(key => rate[key])
		.every(key => {
			const accounts = {};
			for (const config of rate[key]) {
				if (accounts[config.rateId]) return false;
				accounts[config.rateId] = 1;
			}
			return true;
		});
}

async function get(req, res) {
	const { blockId, otaName, listingId } = req.query;

	const filter = {
		blockId,
		// $or: [
		// 	{
		// 		parent: { $eq: null },
		// 		otaName: { $nin: OTAsIgnoreParentRate },
		// 	},
		// 	{
		// 		parent: { $ne: null },
		// 		otaName: { $in: OTAsIgnoreParentRate },
		// 	},
		// ],
	};

	if (otaName) {
		filter.otaName = otaName;
	}
	if (listingId) {
		const listing = await models.Listing.findById(listingId).select('rateIds');
		filter._id = { $in: _.get(listing, 'rateIds', []) };
	}

	const rates = await models.Rate.find(filter).sort({ otaName: 1, createdAt: -1 });
	// rates = rates.filter(rate => !(OTAsIgnoreParentRate.includes(rate.otaName) && !rate.parent));

	res.sendData(rates);
}

async function create(req, res) {
	if (!validateRate(req.body)) {
		throw new ThrowReturn('Rate setup error');
	}
	const doc = new models.Rate(req.body);
	await doc.save();
	res.sendData(doc);
}

async function update(req, res) {
	if (!validateRate(req.body)) {
		throw new ThrowReturn('Rate setup error');
	}
	const { id } = req.params;
	const doc = await models.Rate.findByIdAndUpdate(id, req.body, { new: true });
	res.sendData(doc);
}

async function linkToListing(req, res) {
	const { rateId, listingIds } = req.body;
	const rate = await models.Rate.findById(rateId);
	if (!rate) {
		throw new ThrowReturn('Rate not found');
	}

	// unlink
	await models.Listing.updateMany({ _id: { $nin: listingIds }, rateIds: rateId }, { $pull: { rateIds: rateId } });
	// new link
	await models.Listing.updateMany({ _id: listingIds }, { $addToSet: { rateIds: rateId } });

	res.sendData();
}

async function _deleteRate(rateId) {
	const rate = await models.Rate.findById(rateId);
	if (!rate) {
		return;
	}

	if (rate.rateId) {
		const listing = await models.Listing.findOne({
			active: true,
			OTAs: {
				$elemMatch: {
					active: true,
					otaName: rate.otaName,
					account: rate.account,
					'rates.rateId': rate.getOTARateId(),
				},
			},
		}).select('_id');
		if (listing) {
			return;
		}
	}

	logger.info('removeUnuseRate -> blockId -> otaName', rateId);

	// await models.Listing.updateMany({ rateIds: rate._id }, { $pull: { rateIds: rate._id } });
	await models.Rate.deleteOne({ _id: rateId });
}

async function deleteRate(req, res) {
	const { rateId } = req.params;

	await _deleteRate(rateId);

	res.sendData();
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	if (Rate[otaName]) {
		await Rate[otaName].crawlAndGenerateRates(blockId, otaName, account);
	} else {
		logger.warn(`crawlAndGenerateRatesForOTA: Not yet support OTA ${otaName}`);
	}
}

async function syncRatesForHasRatePlanOTA(blockId, ota) {
	const otaNameAccounts = await models.Listing.aggregate([
		{
			$match: {
				blockId,
			},
		},
		{ $unwind: '$OTAs' },
		{
			$match: {
				'OTAs.active': true,
				'OTAs.otaName': _.pickBy({ $in: Object.keys(Rate), $eq: ota }),
			},
		},
		{
			$group: {
				_id: '$OTAs.otaName',
				account: { $addToSet: '$OTAs.account' },
			},
		},
		{ $unwind: '$account' },
	]);
	logger.info(' otaNameAccounts', otaNameAccounts);

	return await otaNameAccounts.asyncMap(({ _id: otaName, account }) =>
		crawlAndGenerateRates(blockId, otaName, account).catch(e => {
			logger.error('crawlAndGenerateRates', blockId, otaName, account, e);
		})
	);
}

async function removeUnuseRate(blockId, otaName) {
	const rates = await models.Rate.find(_.pickBy({ blockId, otaName })).select('_id');

	await rates.asyncMap(rate => _deleteRate(rate._id).catch(e => logger.error('removeUnuseRate error', e)));
}

async function syncRates({ blockId, otaName }) {
	if (!blockId || !mongoose.Types.ObjectId.isValid(blockId)) {
		throw new ThrowReturn('blockId is required!');
	}

	blockId = mongoose.Types.ObjectId(blockId);

	await removeUnuseRate(blockId, otaName);
	// await syncRatesForNotHaveRatePlanOTA(blockId, otaName);
	await syncRatesForHasRatePlanOTA(blockId, otaName);
}

async function roomTypeRates({ blockId, roomType, serviceType }) {
	if (!blockId) {
		throw new ThrowReturn('blockId is null');
	}

	serviceType = parseInt(serviceType) || Services.Day;

	const filter = {
		blockId,
		'rateIds.0': { $exists: true },
		'roomIds.0': { $exists: true },
		OTAs: {
			$elemMatch: {
				active: true,
				serviceTypes: serviceType,
			},
		},
	};

	const roomFilters = _.pickBy({
		active: true,
		'info.name': roomType,
	});

	const rateFilters = {
		isOtaChildRate: { $ne: true },
		serviceType,
	};

	const listings = await models.Listing.find(filter)
		.select('roomIds rateIds OTAs')
		.populate({
			path: 'roomIds',
			select: 'info.name',
			match: roomFilters,
		})
		.populate({
			path: 'rateIds',
			select: 'otaRateName name otaName account rateId isOtaChildRate parent genius',
			match: rateFilters,
		});

	const data = {};

	listings.forEach(listing => {
		listing.roomIds.forEach(room => {
			const { roomType: currentRoomType, _id: roomId } = room;

			listing.OTAs.filter(ota => ota.active && _.includes(ota.serviceTypes, serviceType)).forEach(ota => {
				const { otaName } = ota;

				listing.rateIds
					.filter(rate => rate.otaName === otaName)
					.forEach(rate => {
						data[currentRoomType] = data[currentRoomType] || {};
						data[currentRoomType][otaName] = data[currentRoomType][otaName] || [];

						const old = data[currentRoomType][otaName].find(r => r._id.toString() === rate._id.toString());
						if (old) {
							const oldRoom = old.roomIds.find(id => id.equals(roomId));
							if (!oldRoom) {
								old.roomIds.push(roomId);
							}
						} else {
							data[currentRoomType][otaName].push({
								_id: rate._id,
								name: rate.otaRateName || rate.name.split(' - ').slice(1).join(' - '),
								roomIds: [roomId],
								genius: rate.genius,
							});
						}
					});
			});
		});
	});

	return data;
}

async function onListingUpdated({ currentData, blockId }) {
	try {
		await syncRates({
			blockId,
			otaName: currentData.otaName,
		});
	} catch (e) {
		logger.error('onListingUpdated', blockId, currentData, e);
	}
}

sysEventEmitter.on(SYS_EVENTS.LISTING_UPDATE, onListingUpdated);

module.exports = {
	get,
	create,
	update,
	deleteRate,
	syncRates,
	linkToListing,
	roomTypeRates,
};
