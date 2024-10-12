const moment = require('moment');
const _ = require('lodash');
const mongoose = require('mongoose');

const { OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const apis = require('@controllers/ota_api/synchronize');
const sync = require('./index');

function getDatesRange(from, to, format = 'YYYY-MM-DD') {
	const toTime = moment(to).unix();

	const arr = [];
	let current = moment(from).startOf('days').add(12, 'hours');

	while (true) {
		const date = current.toDate();
		const dateString = current.format(format);

		if (arr.length) {
			arr[arr.length - 1].nextDate = date;
			arr[arr.length - 1].nextDateString = dateString;
		}

		if (current.unix() > toTime) {
			break;
		}

		arr.push({
			date,
			dateString,
			nextDate: null,
			nextDateString: null,
		});

		current = current.add(1, 'days');
	}

	return arr;
}

function getFromTo(notMatch) {
	const fromTo = [];
	let fromToIndex = 0;
	for (let i = 0; i < notMatch.length; i++) {
		let { from, to } = fromTo[fromToIndex] || {};
		if (!from) {
			fromTo[fromToIndex] = {};
			fromTo[fromToIndex].from = from = notMatch[i];
			fromTo[fromToIndex].to = to = notMatch[i];
		}

		if (
			to.dataDate.dateString === notMatch[i].dataDate.dateString ||
			to.dataDate.nextDateString === notMatch[i].dataDate.dateString
		) {
			fromTo[fromToIndex].to = notMatch[i];
		} else {
			fromTo.push({
				from: notMatch[i],
				to: notMatch[i],
			});
			fromToIndex += 1;
		}
	}

	return fromTo;
}

async function autoSyncByListing(listing, dataDates, from, to) {
	const listingId = listing._id;
	const activeOTAs = listing.OTAs.filter(ota => ota.active && _.get(apis[ota.otaName], 'fetchRoomsToSell'));

	const results = await activeOTAs.asyncMap(async otaListing => {
		const { otaName, account, otaListingId } = otaListing;

		const [otaInfo] = await models.OTAManager.findByName(otaName, account);

		let propertyId = await models.Block.getPropertyIdOfABlock(listing.blockId, otaName, account);
		if (!propertyId && otaName === OTAs.Agoda) {
			propertyId = otaListingId.split(',')[0].trim();
		}

		let rateIds = [];
		if (otaName === OTAs.Expedia || otaName === OTAs.Tiket) {
			rateIds = await models.Rate.find({ _id: { $in: listing.rateIds }, otaName })
				.select('rateId')
				.then(rates => rates.map(r => r.rateId));
		}

		const otaDates = await apis[otaName]
			.fetchRoomsToSell({
				otaListingInfo: otaListing,
				propertyId,
				from,
				to,
				otaInfo,
				rateIds,
			})
			.catch(err => {
				logger.error('SyncAuto: autoSyncBooking -> err', err);
			});

		const notMatch = dataDates
			.map(({ available, dataDate }) => {
				if (!otaDates || otaDates[dataDate.dateString] === undefined) {
					return;
				}

				const otaAvailable = parseInt(otaDates[dataDate.dateString]);
				if (available !== otaAvailable) {
					logger.info(
						'TCL: autoSyncByListing -> otaRoomsToSell diff',
						otaName,
						otaListingId,
						dataDate.dateString,
						available,
						otaAvailable
					);
					return {
						dataDate,
						available,
						otaAvailable,
					};
				}

				return null;
			})
			.filter(r => r);

		const fromTo = getFromTo(notMatch);

		return fromTo.map(info => ({
			from: info.from.dataDate.date,
			to: info.to.dataDate.nextDate,
			listingId,
			otaName,
			account,
		}));
	});

	return _.flatten(results);
}

function groupTaskByOTAAccount(_tasks) {
	const groupTask = _.groupBy(_tasks, v => `${v.from.getTime()}|${v.to.getTime()}|${v.otaName}|${v.account}`);

	const result = _.values(groupTask).map(v => {
		const listingIds = [...new Set(v.map(t => String(t.listingId)))].map(id => mongoose.Types.ObjectId(id));

		return {
			from: v[0].from,
			to: v[0].to,
			listingIds,
			otas: [
				{
					otaName: v[0].otaName,
					account: v[0].account,
				},
			],
		};
	});

	return result;
}

function groupListing(listing) {
	return `${listing.blockId}_${_.map(listing.roomIds, _.toString).sort().toString()}`;
}

async function syncAutoFromTo(from, to) {
	const datesRange = getDatesRange(from, to);
	const otas = _.entries(apis)
		.filter(([__, func]) => func && func.fetchRoomsToSell)
		.map(([ota]) => ota);

	const activeHomes = await models.Block.getActiveBlock();
	const listings = await models.Listing.find({
		blockId: activeHomes,
		OTAs: {
			$elemMatch: {
				otaName: { $in: otas },
				active: true,
			},
		},
	});

	const roomGroups = _.groupBy(listings, groupListing);
	const sellData = {};
	await _.entries(roomGroups).syncMap(async ([roomsKey, [listing]]) => {
		const dataDates = await datesRange.syncMap(async dataDate => {
			const { date, nextDate } = dataDate;
			const availableRooms = await models.BlockScheduler.findAvailableRooms(
				listing.roomIds,
				listing.blockId,
				date,
				nextDate
			);

			return { dataDate, available: availableRooms.length };
		});

		sellData[roomsKey] = dataDates;
	});

	const tasks = await listings.syncMap(async listing => {
		const dataDates = sellData[groupListing(listing)];

		const _tasks = await autoSyncByListing(listing, dataDates, from, to);
		const result = groupTaskByOTAAccount(_tasks);

		return result;
	});

	const description = `Created by Auto Sync(${datesRange.length})`;

	await _.flatten(tasks)
		.sort((a, b) => a.from.getTime() - b.from.getTime())
		.asyncForEach(task =>
			models.JobCalendar.createByListing({
				listingIds: task.listingIds,
				from: task.from,
				to: task.to,
				otas: task.otas,
				description,
			})
		);
}

async function syncAuto(from, to) {
	try {
		const _from = from ? moment(from) : moment();
		const _to = to ? moment(to) : moment(from).add(6, 'months');

		await syncAutoFromTo(_from.startOf('day').toDate(), _to.startOf('day').toDate());
	} catch (e) {
		logger.error('syncAuto error', from, to, e);
	}
}

async function syncAll(from, to) {
	try {
		const activeHomes = await models.Block.getActiveBlock();

		const listings = await models.Listing.find({
			blockId: activeHomes,
			'OTAs.active': true,
		}).select('_id');

		await listings.asyncForEach(listing => {
			return sync.synchronizeSchedules({ listingId: listing._id, from, to });
		});
	} catch (e) {
		logger.error('syncAll error', e);
	}
}

module.exports = {
	syncAuto,
	syncAll,
};
