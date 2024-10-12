const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema, Custom } = mongoose;
const { ObjectId } = Schema.Types;

const HostBlockSchema = new Schema(
	{
		userId: Custom.Ref({
			ref: 'User',
			required: true,
			virtual: 'user',
		}),
		blockId: Custom.Ref({
			ref: 'Block',
			required: true,
			virtual: 'block',
		}),
		roomIds: [
			Custom.Ref({
				ref: 'Room',
			}),
		],
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
	}
);

HostBlockSchema.index({ userId: 1, blockId: 1 }, { unique: true });

HostBlockSchema.statics = {
	async addBlocksToUsers(blockIds, userIds, user) {
		blockIds = blockIds.toMongoObjectIds();
		userIds = userIds.toMongoObjectIds();

		const bulks = [];

		blockIds.forEach(blockId => {
			userIds.forEach(userId => {
				bulks.push({
					updateOne: {
						filter: {
							blockId,
							userId,
						},
						update: {
							createdBy: user._id,
						},
						upsert: true,
					},
				});
			});
		});

		const rs = await this.bulkWrite(bulks);

		// await this.model('Host').updateMany(
		// 	{ _id: { $in: userIds } },
		// 	{
		// 		$addToSet: {
		// 			blockIds: { $each: blockIds },
		// 		},
		// 	}
		// );

		return _.map(rs.result.upserted, '_id');
	},

	async removeBlocksFromUsers(blockIds, userIds) {
		blockIds = blockIds.toMongoObjectIds();
		userIds = userIds.toMongoObjectIds();

		const rs = await this.deleteMany({
			userId: userIds,
			blockId: blockIds,
		});

		// await this.model('Host').updateMany(
		// 	{ _id: { $in: userIds } },
		// 	{
		// 		$pull: {
		// 			blockIds: { $in: blockIds },
		// 		},
		// 	}
		// );

		return rs;
	},

	getUserIdsOfBlocks(blockIds) {
		return this.aggregate()
			.match({
				blockId: { $in: blockIds },
			})
			.group({
				_id: null,
				userIds: { $addToSet: '$userId' },
			})
			.then(rs => _.get(rs, [0, 'userIds']) || []);
	},
};

module.exports = mongoose.model('HostBlock', HostBlockSchema, 'host_block');
