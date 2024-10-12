const _ = require('lodash');
const mongoose = require('mongoose');

const { OTAs, LocalOTAs, Services } = require('@utils/const');
const { genSlug } = require('@utils/generate');

const { Schema, Types, Custom } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const ListingSchema = new Schema(
	{
		name: String,
		url: String,
		location: {
			type: {
				type: String,
				enum: ['Point'],
			},
			coordinates: {
				type: Mixed,
			},
		},
		keywords: [String],
		info: {
			description: String,
			description_vn: String,
			accommodates: { type: Number, default: 1 },
			beds: { type: Number, default: 1 },
			bedrooms: { type: Number, default: 1 },
			roomType: String,
			propertyType: String,
			bathrooms: { type: Number, default: 1 },
			amenities: [String],
			images: [String],
			maxOccupancy: Number,
		},
		OTAs: [
			{
				otaName: { type: String, required: true },
				otaListingId: String,
				otaListingName: String,
				secondaryId: String, // such as accommodationId in Luxstay ...
				currency: String,
				active: Boolean,
				account: String,
				genius: Boolean,
				disableSyncCalendar: Boolean,
				other: Mixed,
				staticRooms: { type: Number, min: 0 },
				serviceTypes: [{ type: Number, enum: _.values(Services) }],
				rates: [
					{
						_id: false,
						ratePlanId: { type: Number, ref: 'RatePlan' },
						rateId: { type: String },
						active: { type: Boolean, default: true },
						serviceType: { type: Number, enum: _.values(Services) },
					},
				],
			},
		],
		order: Number,
		view: Number,
		blockId: Custom.Ref({ required: true, ref: 'Block' }),
		roomTypeId: { type: ObjectId, ref: 'RoomType' },
		createdBy: { type: ObjectId, ref: 'User' },
		roomIds: [Custom.Ref({ ref: 'Room' })],
		rateIds: [{ type: ObjectId, ref: 'Rate' }],
		virtualRoomType: { type: Boolean, default: false },
		active: { type: Boolean, default: true },
		public: { type: Boolean, default: true },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

ListingSchema.index({
	location: '2dsphere',
});

/**
 * Virtuals
 */
ListingSchema.virtual('roomCount').get(function () {
	return this.roomIds ? this.roomIds.length : 0;
});

ListingSchema.pre('save', function (next) {
	if (this.isModified('OTAs')) {
		const localOTA = _.find(this.OTAs, o => _.values(LocalOTAs).includes(o.otaName));
		if (!this.url && localOTA) {
			this.url = genSlug(localOTA.otaListingName || this.name);
		}
	}

	this.$locals.isModifiedVirtualRoomType = this.isModified('virtualRoomType');
	this.$locals.isModifiedRoomIds = this.isModified('roomIds');
	this.$locals.isModifiedName = this.isModified('name');

	next();
});

ListingSchema.post('save', function () {
	if (this.$locals.isModifiedName || this.$locals.isModifiedVirtualRoomType || this.$locals.isModifiedRoomIds) {
		mongoose.model('RoomType').syncListingVirtualRoomType(this);
	}
});

/**
 * Methods
 */
ListingSchema.methods = {
	/**
	 * Get OTA
	 * @param {string} name
	 */
	getOTA(name) {
		// const localOTAs = _.values(LocalOTAs);
		// if (localOTAs.includes(name)) {
		// 	return this.OTAs.find(ota => ota.active && localOTAs.includes(ota.otaName));
		// }
		return this.OTAs.find(ota => ota.otaName === name && ota.active);
	},

	/**
	 * check this listing's OTA allow many rooms
	 */
	// isMultiRoomsListing(otas) {
	// 	if (!otas) otas = this.OTAs;
	// 	for (const ota of otas) {
	// 		if (_.has(ListingConfig, [ota.otaName, 'multiRooms'])) return ListingConfig[ota.otaName].multiRooms;
	// 	}
	// 	return true;
	// },
};

/**
 * Statics
 */

ListingSchema.statics = {
	findListingByOTA(otaName, otaListingId) {
		if (otaName === OTAs.Agoda) {
			otaListingId = [otaListingId, otaListingId.split(',')[0]];
		}
		// if (_.values(LocalOTAs).includes(otaName)) {
		// 	otaName = { $in: _.values(LocalOTAs) };
		// }

		return this.findOne({
			OTAs: {
				$elemMatch: {
					otaName,
					otaListingId,
					active: true,
				},
			},
		});
	},

	async getAccommodation(roomId) {
		const listings = await this.findOne({
			roomIds: roomId,
			'info.accommodates': { $exists: true },
		}).select('info.accommodates');

		const accommodates = (listings && listings.info.accommodates) || 2;

		return {
			accommodates,
			roomType: getRoomType(accommodates),
		};
	},

	async findByRooms(roomIds, otaName) {
		const query = {
			roomIds: { $in: roomIds.map(r => Types.ObjectId(r)) },
		};
		if (otaName) {
			query.OTAs = { $elemMatch: { otaName, active: true } };
		}

		return this.find(query);
	},

	findBySlugOrId(slugOrId) {
		const isId = mongoose.Types.ObjectId.isValid(slugOrId);
		const otaFilter = {
			$elemMatch: { otaName: { $in: _.values(LocalOTAs) }, active: true },
		};

		if (isId)
			return this.findOne({
				_id: slugOrId,
				OTAs: otaFilter,
			});

		return this.findOne({
			url: slugOrId,
			OTAs: otaFilter,
		});
	},

	getLocalListings({ roomIds }) {
		const localOTAs = _.values(LocalOTAs);
		roomIds = _.map(roomIds, id => mongoose.Types.ObjectId(id));

		return this.aggregate([
			{
				$match: {
					OTAs: { $elemMatch: { otaName: { $in: localOTAs }, active: true } },
					roomIds: { $in: roomIds },
				},
			},
			{
				$project: {
					_id: 1,
					ota: {
						$arrayElemAt: [
							{
								$filter: {
									input: '$OTAs',
									as: 'ota',
									cond: {
										$and: [
											{ $in: ['$$ota.otaName', localOTAs] }, //
											{ $eq: ['$$ota.active', true] },
										],
									},
								},
							},
							0,
						],
					},
					roomIds: {
						$filter: {
							input: roomIds,
							as: 'roomId',
							cond: {
								$or: [
									{ $in: ['$$roomId', '$roomIds'] }, //
									// { $in: ['$$roomId', '$roomIds'] },
								],
							},
						},
					},
					roomTypeId: 1,
				},
			},
		]);
	},
};

function getRoomType(accommodates) {
	if (accommodates <= 1) return 'Single';
	if (accommodates === 2) return 'Double';
	if (accommodates === 3) return 'Triple';
	if (accommodates === 4) return 'Quadra';
	if (accommodates === 5) return 'Penta';
	return accommodates;
}

module.exports = mongoose.model('Listing', ListingSchema, 'listing');
