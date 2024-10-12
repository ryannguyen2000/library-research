const mongoose = require('mongoose');
const _ = require('lodash');

const { UserRoles } = require('@utils/const');
const { getIdsByQuery } = require('@utils/mongo');

const { Schema } = mongoose;

const HostSchema = new Schema(
	{
		description: String,
		blockIds: [{ type: Schema.Types.ObjectId, ref: 'Block' }],
		hosting: [{ type: Schema.Types.ObjectId, ref: 'Block' }],
		score: { type: Number, default: 0 },
		cash: { type: Number, default: 0 },
		level: { type: Number, default: 0 },
	},
	{
		timestamps: true,
	}
);

HostSchema.statics = {
	async getBlocksOfUser({ user, filterBlockIds, excludeBlockId, blockKey = 'blockId', roomKey = 'roomIds' }) {
		const result = { blockIds: [], blockKey, roomKey };

		const parsedIds =
			filterBlockIds &&
			_.compact(
				_.isArray(filterBlockIds) ? filterBlockIds : filterBlockIds.toString().split(',')
			).toMongoObjectIds();

		const isExclude = excludeBlockId === 'true' || excludeBlockId === true;

		if (user.role === UserRoles.ADMIN) {
			const query = { active: true, groupIds: { $in: user.groupIds } };
			if (parsedIds) query._id = { [isExclude ? '$nin' : '$in']: parsedIds };
			result.blockIds = await getIdsByQuery(this.model('Block'), query);
			result.filters = {
				[blockKey]: { $in: result.blockIds },
			};
		} else {
			const query = { userId: user._id };
			if (parsedIds) query.blockId = { [isExclude ? '$nin' : '$in']: parsedIds };

			const hostBlocks = await this.model('HostBlock').find(query).select('-_id blockId roomIds').lean();
			result.blockIds = _.map(hostBlocks, 'blockId');

			const limitRooms = hostBlocks.filter(h => h.roomIds && h.roomIds.length);
			const fullRooms = hostBlocks.filter(r => !r.roomIds || !r.roomIds.length).map(r => r.blockId);

			const $or = [];

			if (fullRooms.length) {
				result.fullRooms = fullRooms;
				$or.push({ [blockKey]: { $in: fullRooms } });
			}
			if (limitRooms.length) {
				result.limitRooms = limitRooms;
				$or.push(
					...limitRooms.map(r => ({
						[blockKey]: r.blockId,
						[roomKey]: { $in: r.roomIds },
					}))
				);
			}

			if ($or.length) {
				result.filters = { $or };
			} else {
				result.filters = {
					[blockKey]: { $in: result.blockIds },
				};
			}
		}

		return result;
	},

	async getBlockHosting(blockIds) {
		if (!Array.isArray(blockIds)) blockIds = [blockIds];

		const host = await this.findOne({ hosting: { $in: blockIds } }).select('_id');

		return _.get(host, '_id');
	},
};

module.exports = mongoose.model('Host', HostSchema, 'host');
