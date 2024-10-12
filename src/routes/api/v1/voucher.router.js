const moment = require('moment');
const _ = require('lodash');

const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const voucherController = require('@controllers/image_composer/voucher');

const languages = {
	vi: {
		max: 'tối đa',
		night: 'đêm',
		unlimit: 'Không giới hạn',
		people: 'người',
	},
	en: {
		max: 'max',
		night: 'night',
		unlimit: 'Unlimit',
		people: 'peoples',
	},
};

function getPrefix(nums, language) {
	if (language === 'en' && nums > 1) return 's';
	return '';
}

function getValueVoucher({ discount, discountType, maxDiscount, night, body, language }) {
	if (body) {
		return body;
	}
	return `${discount.toLocaleString()}${discountType === 'value' ? '' : '%'}${
		maxDiscount ? ` ${languages[language].max} ${maxDiscount.toLocaleString()}` : ''
	}${night ? `, ${night} ${languages[language].night}${getPrefix(night, language)}` : ''}`;
}

function getRoomType(roomType, language) {
	if (!roomType) return languages[language].unlimit;
	if (roomType === 1) return 'Single';
	if (roomType === 2) return 'Double';
	if (roomType === 3) return 'Triple';
	return `${roomType} ${languages[language].people}`;
}

async function createVoucher(req, res) {
	let { roomType, dateExpired, language = 'vi' } = req.body;

	dateExpired = dateExpired ? moment(dateExpired).toDate() : moment().add(6, 'month').endOf('day').toDate();
	roomType = getRoomType(roomType, language);
	const value = getValueVoucher(req.body);

	const code = await models.Voucher.createCode();
	const url = await voucherController.createVoucher({ code, dateExpired, value, roomType, language });

	if (!url) {
		throw new ThrowReturn('Server error!');
	}

	delete req.body.otaBookingId;

	const voucher = await models.Voucher.create({
		...req.body,
		dateExpired,
		code,
		url,
		createdBy: req.decoded.user._id,
		groupIds: req.decoded.user.groupIds,
	});

	res.sendData({ voucher });
}

async function getVouchers(req, res) {
	let { start, limit, ...query } = req.query;
	start = parseInt(start || 0);
	limit = parseInt(limit || 10);
	query.groupIds = { $in: req.decoded.user.groupIds };
	query = _.pickBy(query);

	const vouchers = await models.Voucher.find(query)
		.sort({ createdAt: -1 })
		.skip(start)
		.limit(limit)
		.populate('booking', '_id otaName otaBookingId')
		.populate('createdBy', 'username name');
	const total = await models.Voucher.countDocuments(query);

	res.sendData({ vouchers, total });
}

async function getVoucher(req, res) {
	const { id } = req.params;
	const voucher = await models.Voucher.findOne({ _id: id, groupIds: { $in: req.decoded.user.groupIds } })
		.populate('booking', '_id otaName otaBookingId')
		.populate('createdBy', 'username name');

	res.sendData({ voucher });
}

async function deleteVoucher(req, res) {
	const { id } = req.params;
	const voucher = await models.Voucher.findOne({ _id: id, groupIds: { $in: req.decoded.user.groupIds } });

	if (voucher) {
		if (voucher.otaBookingId) throw new ThrowReturn('Voucher has already used!');

		await models.Voucher.findByIdAndDelete(id);
		await voucherController.removeVoucher(voucher);
	}

	res.sendData(voucher);
}

async function getVoucherDiscount(req, res) {
	const { code, otaBookingId } = req.query;

	const discount = await models.Voucher.getDiscount(req.decoded.user, code, otaBookingId);

	res.sendData(discount);
}

router.getS('/', getVouchers, true);
router.getS('/discount', getVoucherDiscount, true);
router.getS('/:id', getVoucher, true);

router.postS('/', createVoucher, true);
router.deleteS('/:id', deleteVoucher, true);

const activity = {
	VOUCHER_CREATE: {
		key: '',
		method: 'POST',
	},
	VOUCHER_DELETE: {
		key: '',
		method: 'DELETE',
	},
};

module.exports = { router, activity };
