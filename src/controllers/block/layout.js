const _ = require('lodash');

const fetch = require('@utils/fetch');
const { URL_CONFIG } = require('@config/setting');
const { LAYOUT_TYPE, OTAs } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function getLayout(blockId) {
	const layout = await models.BlockLayout.findOne({ blockId, layoutType: LAYOUT_TYPE.ROOT }).populate({
		path: 'layouts',
		options: { sort: { order: -1 } },
		populate: {
			path: 'layouts',
			options: { sort: { order: -1 } },
			populate: {
				path: 'roomId',
				select: 'info.roomNo info.name info.price info.nameLT info.layoutBg info.layoutBgLT',
			},
		},
	});

	return {
		layout,
	};
}

async function updateLayout(blockId, data, user) {
	const rs = await Promise.all(
		_.map(data, async ({ action, ...item }) => {
			item.blockId = blockId;

			if (action === 'create') {
				const newItem = await models.BlockLayout.create(item);
				return {
					success: true,
					data: {
						_id: newItem._id,
					},
				};
			}
			if (action === 'update') {
				const doc = await models.BlockLayout.findByIdAndUpdate(item._id, item);
				return {
					success: !!doc,
					data: {
						_id: doc._id,
					},
				};
			}
			if (action === 'delete') {
				const deleted = await models.BlockLayout.deleteOne({ _id: item._id });
				if (item.layoutType === LAYOUT_TYPE.Y) {
					await models.BlockLayout.deleteMany({ parentId: item._id });
				}
				return {
					success: !!deleted.ok,
				};
			}
			return {
				success: false,
			};
		})
	);

	return rs;
}

async function syncLayout(user, block) {
	const fami = block.OTAProperties.find(ota => ota.otaName === OTAs.Famiroom);
	if (!fami) {
		throw new ThrowReturn('Chưa cấu hình ID Famiroom!');
	}

	const res = await fetch(`${URL_CONFIG.FAMIROOM}/api/client/property/${fami.propertyId}/layout?viewType=2`);
	const json = await res.json();
	const layout = _.get(json, 'data.layout');

	if (!layout) {
		throw new ThrowReturn('Layout not found!');
	}

	const rootLayout = await models.BlockLayout.findOrCreate({
		blockId: block._id,
		layoutType: LAYOUT_TYPE.ROOT,
	});

	await layout.layoutY.asyncMap(async lY => {
		const data = {
			blockId: block._id,
			layoutType: LAYOUT_TYPE.Y,
			refId: lY._id,
		};
		let layoutY = await models.BlockLayout.findOne(data);
		if (!layoutY) {
			layoutY = new models.BlockLayout(data);
		}
		layoutY.parentId = rootLayout._id;
		layoutY.name = _.get(lY, 'name.vi');
		layoutY.order = lY.order;
		await layoutY.save();

		await lY.layoutX.asyncMap(async lX => {
			const lXData = {
				blockId: block._id,
				layoutType: LAYOUT_TYPE.X,
				refId: lX._id,
			};
			let layoutX = await models.BlockLayout.findOne(lXData);
			if (!layoutX) {
				layoutX = new models.BlockLayout(lXData);
			}
			layoutX.parentId = layoutY._id;
			layoutX.order = lX.order;
			if (lX.roomId) {
				const room = await models.Room.findOne({
					blockId: block._id,
					'info.roomNo': lX.roomId.info.roomNo,
				}).select('_id');

				if (room) {
					layoutX.roomId = room._id;
				} else {
					layoutX.name = lX.roomId.info.roomNo;
				}
			} else {
				layoutX.name = _.get(lX, 'name.vi');
			}

			await layoutX.save();
		});
	});

	// return layout;
}

module.exports = {
	getLayout,
	updateLayout,
	syncLayout,
};
