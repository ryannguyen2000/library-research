const _ = require('lodash');
// const moment = require('moment');

const { URL_CONFIG } = require('@config/setting');
// const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const { OTAs, STATIC_CONTENT_TYPE } = require('@utils/const');
const models = require('@models');

async function syncPropertiesContent({ blockId }) {
	const blocks = await models.Block.find(
		_.pickBy({
			active: true,
			isProperty: true,
			'OTAProperties.otaName': OTAs.Famiroom,
			_id: blockId,
		})
	)
		.select('_id OTAProperties')
		.lean();

	await blocks.asyncForEach(block => {
		return syncPropertyContent(block);
	});
}

function normRoomName(name) {
	return _.trim(name).toLowerCase();
}

async function syncPropertyContent(block) {
	const otaFamiId = _.find(block.OTAProperties, ota => ota.otaName === OTAs.Famiroom);
	if (!otaFamiId) {
		return;
	}

	const data = await fetch(
		`${URL_CONFIG.FAMIROOM}/api/client/property/contentAPI?propertyId=${otaFamiId.propertyId}`
	).then(res => res.json());

	const property = _.get(data, 'data.property');
	const roomTypes = _.get(data, 'data.roomTypes');

	delete property._id;

	const rooms = await models.Room.find({ blockId: block._id, virtual: false }).select('info.roomNo').lean();

	const listings = await models.Listing.find({
		blockId: block._id,
		OTAs: {
			$elemMatch: {
				active: true,
				otaName: OTAs.CozrumWeb,
			},
		},
	}).select('roomIds url OTAs');

	const roomNameJobs = _.keyBy(rooms, r => normRoomName(r.info.roomNo));

	if (property.layout) {
		property.layout.layoutY.forEach(layoutY => {
			layoutY.layoutX.forEach(layoutX => {
				if (!layoutX.roomId || !layoutX.roomId.roomTypeId) return;

				const room = roomNameJobs[normRoomName(layoutX.roomId.info.roomNo)];

				if (room) {
					layoutX.roomId._id = room._id;

					const { roomTypeId } = layoutX.roomId;

					if (roomTypeId) {
						const mapListing = _.find(listings, l =>
							_.some(l.roomIds, rId => rId.toString() === room._id.toString())
						);

						if (mapListing) {
							const ota = mapListing.getOTA(OTAs.CozrumWeb);
							roomTypeId.slug = mapListing.url;
							roomTypeId.otaListingId = ota.otaListingId;
							roomTypeId.displayName = ota.otaListingName;
						}
					}
				}
			});
		});
	}

	await models.BlockStaticContent.updateOne(
		{
			blockId: block._id,
			contentType: STATIC_CONTENT_TYPE.PROPERTY,
		},
		{
			content: property,
			sourceBlockId: property.id,
		},
		{
			upsert: true,
		}
	);

	await models.BlockStaticContent.deleteMany({
		blockId: block._id,
		contentType: STATIC_CONTENT_TYPE.ROOM,
	});

	const bulksUpdate = [];

	const bulksRoomTypes = roomTypes.map(roomType => {
		const roomContent = {
			...roomType,
		};

		delete roomContent._id;

		const roomNos = _.map(roomType.rooms, r => normRoomName(r.info.roomNo));
		const currentRooms = rooms.filter(r => roomNos.includes(normRoomName(r.info.roomNo)));
		const roomIds = _.map(currentRooms, '_id');

		const mapListing = _.find(listings, l =>
			_.some(l.roomIds, rId => roomIds.some(roomId => roomId.toString() === rId.toString()))
		);

		let otaListingId;

		if (mapListing) {
			otaListingId = mapListing.getOTA(OTAs.CozrumWeb).otaListingId;

			if (roomType.stags) {
				bulksUpdate.push({
					updateOne: {
						filter: {
							_id: mapListing._id,
						},
						update: {
							keywords: _.map(roomType.stags, 'slug'),
						},
					},
				});
			}
		}

		return {
			blockId: block._id,
			contentType: STATIC_CONTENT_TYPE.ROOM,
			sourceBlockId: property.id,
			sourceRoomTypeId: roomType.id,
			content: roomContent,
			roomIds,
			otaListingId,
		};
	});

	await models.BlockStaticContent.insertMany(bulksRoomTypes);

	if (bulksUpdate.length) {
		await models.Listing.bulkWrite(bulksUpdate);
	}
}

module.exports = {
	syncPropertiesContent,
};
