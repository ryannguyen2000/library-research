const _ = require('lodash');
const mongoose = require('mongoose');

const { VirtualBookingPhone } = require('@utils/const');
const { genUrl } = require('@utils/generate');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const ecardController = require('@controllers/image_composer/ecard');

async function getCampaigns(req, res) {
	let { start, limit, name, ...query } = _.pickBy(req.query);

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;
	query.groupId = req.decoded.user.groupIds;

	if (name) {
		query.name = new RegExp(_.escapeRegExp(name), 'i');
	}

	const [campaigns, total] = await Promise.all([
		models.CampaignMessage.find(query)
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit)
			.populate('createdBy', 'username name'),
		models.CampaignMessage.countDocuments(query),
	]);

	res.sendData({ campaigns, total });
}

async function getCampaign(req, res) {
	const campaign = await models.CampaignMessage.findOne({
		_id: req.params.id,
		groupId: req.decoded.user.groupIds,
	});

	res.sendData({ campaign });
}

async function getGuestsCampaign(req, res) {
	let { id } = req.params;
	let { start, limit, ...query } = req.query;

	query.campaignId = id;
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const [guests, total] = await Promise.all([
		models.CampaignMessageGuest.find(query)
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit)
			.populate('guestId', 'fullName name')
			.populate('createdBy', 'username name'),

		models.CampaignMessageGuest.countDocuments(query),
	]);

	res.sendData({ guests, total });
}

async function createCampaign(req, res) {
	const data = req.body;
	data.createdBy = req.decoded.user._id;
	data.groupId = _.head(req.decoded.user.groupIds);

	const campaign = await models.CampaignMessage.create(data);

	res.sendData({ campaign });
}

async function updateCampaign(req, res) {
	const { id } = req.params;
	const data = req.body;
	delete data.createdBy;
	delete data.groupId;

	const template = await models.CampaignMessage.findOneAndUpdate(
		{ _id: id, groupId: req.decoded.user.groupIds },
		data
	);

	res.sendData({ campaign: _.pick(template, _.keys(data)) });
}

async function deleteCampaign(req, res) {
	const { id } = req.params;

	const campaign = await models.CampaignMessage.findOne({ _id: id, groupId: req.decoded.user.groupIds });

	if (campaign) {
		if (campaign.active) {
			throw new ThrowReturn('Chiến dịch đang diễn ra!');
		}

		await models.CampaignMessage.deleteOne({ _id: id });
		await models.CampaignMessageGuest.deleteMany({ campaignId: id });

		const docs = await models.CampaignImage.find({ campaignId: id }).populate('campaignId', 'type');
		await docs.asyncMap(doc => ecardController.remove(doc, doc.campaignId && doc.campaignId.type));
		await models.CampaignImage.deleteMany({ campaignId: id });
	}

	res.sendData();
}

async function updateGuestCampaign(req, res) {
	const { id: campaignId } = req.params;
	const { guestId, assigned } = req.body;

	if (!mongoose.Types.ObjectId.isValid(guestId) || !mongoose.Types.ObjectId.isValid(campaignId))
		throw new ThrowReturn('params_invalid');

	const guest = await models.Guest.findById(guestId);
	if (!guest) throw new ThrowReturn('params_invalid');

	const q = { $or: [] };
	if (guest.phone && !VirtualBookingPhone.some(vphone => guest.phone.includes(vphone))) {
		q.$or.push({ phone: guest.phone });
	}
	if (guest.passportNumber) {
		q.$or.push({ passportNumber: guest.passportNumber });
	}

	const guests = q.$or.length
		? await models.Guest.aggregate([{ $match: q }, { $group: { _id: null, guestId: { $addToSet: '$_id' } } }]).then(
				rs => _.get(rs, '0.guestId', [])
		  )
		: [];

	if (assigned === false) {
		await models.CampaignMessageGuest.deleteMany({
			guestId: { $in: [guest._id, ...guests] },
			campaignId,
		});
	} else {
		await Promise.all(
			_.map(guests.length ? guests : [guest._id], id =>
				models.CampaignMessageGuest.updateOne(
					{
						guestId: id,
						campaignId,
					},
					{
						createdBy: req.decoded.user._id,
					},
					{
						upsert: true,
					}
				)
			)
		);
	}

	res.sendData();
}

async function createEcard(req, res) {
	try {
		let { name, lang = 'vi', campaignId } = req.body;

		name = name.trim();
		let fileName = `${genUrl(name)}_${lang}`;

		let campaign = await models.CampaignMessage.findOne({ _id: campaignId, groupId: req.decoded.user.groupIds });
		if (!campaign) throw new ThrowReturn(`Campaign ${campaignId} not found!`);

		let doc = await models.CampaignImage.findOne({
			name,
			fileName,
			campaignId,
		});
		let url = _.get(doc, 'url');

		if (!url) {
			url = await ecardController.create({ name, fileName, lang, type: campaign.type });
			await models.CampaignImage.create({
				name,
				fileName,
				url,
				createdBy: req.decoded.user._id,
				campaignId,
			});
		}

		res.sendData({ url });
	} catch (e) {
		logger.error('createEcard error', e);
		throw new ThrowReturn('Server Error!');
	}
}

async function getGuestCampaigns(req, res) {
	const { id } = req.params;

	const guests = await models.CampaignMessageGuest.find({ guestId: id });
	res.sendData({ guests });
}

module.exports = {
	getCampaigns,
	getCampaign,
	getGuestCampaigns,
	getGuestsCampaign,
	updateGuestCampaign,
	createCampaign,
	updateCampaign,
	deleteCampaign,
	createEcard,
};
