const _ = require('lodash');
const { OTTs } = require('@utils/const');
const models = require('@models');

const otts = _.values(OTTs).reduce(
	(acc, ott) => ({
		...acc,
		[ott]: require(`@ott/${ott}`),
	}),
	{}
);

function parseQuery(query) {
	if (query.fromMe) query.fromMe = query.fromMe === 'true';

	if (query.ott && !_.isArray(query.ott)) {
		query.ott = query.ott.split(',');
	}

	if (query.from) {
		query.from = new Date(query.from);
		query.from.setHours(0, 0, 0, 0);
	}
	if (query.to) {
		query.to = new Date(query.to);
		query.to.setHours(23, 59, 59, 999);
	}

	return query;
}

async function getStats(req, res) {
	const { fromMe, from, to, ott } = parseQuery(req.query);

	if (!from || !to) {
		return res.sendData({
			data: [],
		});
	}

	const modules = {};
	_.assign(modules, ott ? _.pick(otts, ott) : otts);

	const { user } = req.decoded;
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const filter = {
		active: true,
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockId: { $in: blockIds },
			},
		],
	};
	if (ott) filter[ott] = true;
	const groupOtts = await models.Ott.find(filter);

	const data = await _.entries(modules)
		.filter(([, modul]) => modul.getStats)
		.asyncMap(async ([ottName, modul]) => {
			const stats = await modul
				.getStats({
					fromMe,
					from,
					to,
					ottPhones: _.filter(groupOtts, o => o[ottName]).map(o => o.phone),
				})
				.catch(() => {});

			return {
				ottName,
				stats,
			};
		});

	res.sendData({
		data,
	});
}

module.exports = {
	getStats,
};
