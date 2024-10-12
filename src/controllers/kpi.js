const _ = require('lodash');
const { OTAs } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

const reviewOtas = [OTAs.Airbnb, OTAs.Booking, OTAs.Agoda, OTAs.Traveloka];

async function getListingIds(userId) {
	const host = await models.Host.findById(userId).select('hosting');
	const listingIds = await models.Listing.find({ blockId: host.hosting })
		.select('_id')
		.then(listings => listings.map(l => l._id));
	return { listingIds, blockIds: host.hosting };
}

async function getReservations(blockIds, configs, start, end) {
	const ids = await models.Booking.aggregate([
		{
			$match: {
				blockId: blockIds,
				otaName: { $in: configs.chanels.length ? configs.chanels : reviewOtas },
				checkout: { $ne: null },
				to: { $gte: start, $lte: end },
			},
		},
		{
			$project: {
				otaBookingId: 1,
			},
		},
		{
			$group: {
				_id: '$otaBookingId',
				bookingIds: { $push: '$_id' },
			},
		},
	]);
	return ids || [];
}

async function calcReview(kpiId, userId) {
	const KPI = await models.KPI.findById(kpiId);
	const KPIUser = await models.KPIUser.findOne({ kpiId, userId });
	const { blockIds } = await getListingIds(userId);

	const { configs } = KPI;
	const start = new Date(KPIUser.timeStart).minTimes();
	const end = KPIUser.timeEnd ? new Date(KPIUser.timeEnd) : new Date().maxTimes();

	const reservations = await getReservations(blockIds, configs, start, end);
	const reviews = await models.BookingReview.find({ otaBookingId: { $in: reservations.map(r => r._id) } });

	const avgScore = configs.types.length
		? _.meanBy(
				reviews,
				review =>
					_.meanBy(
						configs.types.filter(type => _.get(review.scores, type)),
						type => _.get(review.scores, type)
					) || review.rating
		  )
		: _.meanBy(reviews, 'rating');

	if (KPIUser.status !== 'doing') return { status: KPIUser.status, reviews, reservations, avgScore };

	let status = '';

	if (
		reservations.length >= configs.maxReservations ||
		reviews.length > configs.maxNumberItems ||
		configs.timeEnd.maxTimes() < new Date().maxTimes()
	) {
		if (reviews.length < configs.minNumberItems || avgScore < configs.minScores) {
			status = 'failed';
		}
		if (reviews.length < configs.maxNumberItems || avgScore < configs.maxScores) {
			status = 'done_min';
		}
		status = 'done';
	} else {
		status = 'doing';
	}

	const update = { status };

	if (status === 'done' || status === 'done_min') {
		update.progress = 100;
	} else {
		update.reservationProgress = (reservations.length / configs.maxReservations) * 100;
		update.reviewProgress = (reviews.length / configs.maxNumberItems) * 100;
		update.dateProgress = ((new Date() - start) / (end - start)) * 100;
		update.progress = (avgScore / configs.maxcores) * 100;
	}
	if (status !== 'doing') {
		update.timeEnd = new Date();
	}

	await models.KPIUser.findOneAndUpdate({ kpiId, userId }, update);

	return { status, reviews, reservations, avgScore };
}

async function create(data, user) {
	const { kpiId } = data;
	const { _id: userId, role } = user;

	const KPI = await models.KPI.findById(kpiId);
	const host = await models.Host.findById(userId);

	if (!KPI || !host) {
		throw new ThrowReturn('Dữ liệu không hợp lệ!');
	}

	if (KPI.configs.level > host.level) {
		throw new ThrowReturn('Level của bạn chưa đủ để nhận nhiệm vụ!');
	}

	if (KPI.configs.rolesRequired.length && !KPI.configs.rolesRequired.includes(role)) {
		throw new ThrowReturn('Bộ phận của bạn không thể nhận nhiệm vụ này!');
	}

	const KPIUser = await models.KPIUser.findOne({ userId, kpiId });
	if (KPIUser) {
		throw new ThrowReturn('Bạn đã nhận nhiệm vụ rồi!');
	}

	if (KPI.parentId) {
		const parent = await models.KPIUser.findOne({ userId, kpiId: KPI.parentId, status: ['done', 'done_min'] });
		if (!parent) {
			throw new ThrowReturn('Bạn chưa đủ điều kiện để nhận nhiệm vụ này!');
		}
	}

	await models.KPI.findByIdAndUpdate(kpiId, { $addToSet: { assigned: userId } });
	await KPI.save();

	return await models.KPIUser.create({ userId, kpiId });
}

async function reward({ id, nextKPI, user }) {
	const data = await calcReview(id, user._id);
	const KPIUser = await models.KPIUser.findOne({ kpiId: id, userId: user._id }).populate('kpiId');
	const host = await models.Host.findById(user._id);

	if (['done', 'done_min'].includes(data.status)) {
		if (nextKPI) {
			const newKPIUser = await create({ kpiId: nextKPI }, user);
			return newKPIUser;
		}
		const min = data.status === 'done_min';
		const cashReward = KPIUser.kpiId.configs[min ? 'minCashReward' : 'maxCashReward'];
		KPIUser.cashReward = cashReward;
		const pointReward = KPIUser.kpiId.configs[min ? 'minPointReward' : 'maxPointReward'];
		KPIUser.pointReward = pointReward;
		KPIUser.rewarded = true;
		host.score += pointReward;
		host.cash += cashReward;
		await host.save();
	} else {
		throw new ThrowReturn('Nhiệm vụ chưa hoàn thành!');
	}

	return KPIUser;
}

module.exports = {
	create,
	calcReview,
	reward,
};
