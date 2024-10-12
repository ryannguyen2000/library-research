const _ = require('lodash');
const moment = require('moment');

const { SMSBankingPhones, OTAs, BANK_ACCOUNT, BANK_ACCOUNT_TYPE } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const router = require('@core/router').Router();
const models = require('@models');

// const banks = ['VietinBank', 'Vietcombank', 'BIDV', 'HDBank', 'Timo', 'VPBank', 'Techcombank'];
// const forceDisplayPhones = ['VietnamPost'];

async function getAll(req, res) {
	let { start = 0, limit = 20, read, data = true, phone, keyword, from, to } = req.query;
	start = parseInt(start);
	limit = parseInt(limit);
	keyword = _.trim(keyword);
	data = JSON.parse(data);

	const { user } = req.decoded;

	const { blockIds } = await models.Host.getBlocksOfUser({ user });
	const group = await models.UserGroup.findOne({ _id: user.groupIds });

	const query = {
		phone: { $in: SMSBankingPhones },
		isSMSBanking: true,
		isIgnore: false,
	};
	const otts = await models.Ott.find({
		[OTAs.SMS]: true,
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockId: { $in: blockIds },
			},
		],
	}).select('phone');

	const bankAccounts = await models.BankAccount.find({
		active: true,
		type: BANK_ACCOUNT.PRIVATE,
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockIds: { $in: blockIds },
			},
		],
	}).select('accountNos');
	const accounts = _.uniq([..._.map(otts, 'phone'), ..._.flatten(_.map(bankAccounts, 'accountNos'))]);

	if (!group.primary && _.get(group.configs, 'displayPrimaryBankAccountTransaction')) {
		const companyBankAccounts = await models.BankAccount.find({
			active: true,
			accountType: BANK_ACCOUNT_TYPE.COMPANY,
			serviceAccountId: { $ne: null },
		}).select('accountNos');

		const sfilter = {
			account: { $in: _.flatten(_.map(companyBankAccounts, 'accountNos')) },
		};

		if (group.configs.maxTransactionAmountToDisplay) {
			sfilter['data.amount'] = { $lte: group.configs.maxTransactionAmountToDisplay };
		}
		if (group.configs.maxTimeToDisplay) {
			sfilter['data.date'] = { $gte: Date.now() - group.configs.maxTransactionAmountToDisplay };
		}

		query.$or = [
			{
				account: { $in: accounts },
			},
			sfilter,
		];
	} else {
		query.account = accounts;
	}

	if (read) {
		query.read = read === 'true';
	}
	if (keyword) {
		query['data.body'] = new RegExp(_.escapeRegExp(keyword), 'i');
	}
	if (phone) {
		query.phone = new RegExp(_.escapeRegExp(phone), 'i');
	}
	if (from) {
		_.set(query, ['data.date', '$gte'], moment(from).startOf('date').valueOf());
	}
	if (to) {
		_.set(query, ['data.date', '$lte'], moment(to).endOf('date').valueOf());
	}

	const [sms, total] = await Promise.all([
		data
			? models.SMSMessage.find(query)
					.sort({ 'data.date': -1 })
					.skip(start)
					.limit(limit)
					.populate({
						path: 'payoutId',
						select: 'bookingId transactionFee currencyAmount',
						populate: {
							path: 'bookingId',
							select: 'otaBookingId otaName price reservateRooms blockId',
							populate: [
								{
									path: 'reservateRooms',
									select: 'info.roomNo',
								},
								{
									path: 'blockId',
									select: 'info.name info.shortName',
								},
							],
						},
					})
			: [],
		models.SMSMessage.countDocuments(query),
	]);

	if (sms.length) {
		await models.SMSMessage.parseMessages(sms, req.decoded.user);
	}

	res.sendData({
		data: sms,
		total,
	});
}

async function getSMS(req, res) {
	const sms = await models.SMSMessage.findById(req.params.id).populate({
		path: 'payoutId',
		select: 'bookingId transactionFee currencyAmount',
		populate: {
			path: 'bookingId',
			select: 'otaBookingId otaName price reservateRooms blockId',
			populate: [
				{
					path: 'reservateRooms',
					select: 'info.roomNo',
				},
				{
					path: 'blockId',
					select: 'info.name info.shortName',
				},
			],
		},
	});

	await models.SMSMessage.parseMessages(sms, req.decoded.user);

	res.sendData({
		data: sms,
	});
}

async function updateSMS(req, res) {
	const { id } = req.params;
	const { read = true } = req.body;

	const sms = await models.SMSMessage.findById(id);
	if (!sms) {
		throw new ThrowReturn('SMS không tồn tại!');
	}

	sms.read = read;
	await sms.save();

	if (sms.payoutId) {
		const payout = await models.Payout.findById(sms.payoutId).select('blockIds');
		if (payout && payout.blockIds && payout.blockIds[0]) {
			_.set(req, ['logData', 'blockId'], payout.blockIds[0]);
		}
	}

	res.sendData();
}

async function getBankTransactions(req, res) {
	const { bank, ...query } = req.query;

	await models.BankAccount.getTransactions(bank, query);

	res.sendData();
}

async function getAccounts(req, res) {
	const { user } = req.decoded;

	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const bankAccounts = await models.BankAccount.find({
		active: true,
		type: BANK_ACCOUNT.PRIVATE,
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockIds: { $in: blockIds },
			},
			{
				serviceAccountId: { $ne: null },
			},
		],
	}).select('shortName accountName accountNos');

	const accounts = bankAccounts.map(a => ({
		name: `${a.shortName} ${a.accountNos[0]}`,
		account: a.accountNos[0],
	}));

	res.sendData({
		accounts,
	});
}

router.getS('/', getAll, true);
router.getS('/account', getAccounts);
router.getS('/:id', getSMS, true);
router.postS('/bankTransaction', getBankTransactions, true);
router.postS('/:id', updateSMS, true);

const activity = {
	SMS_UPDATE_STATUS: {
		key: '/{id}',
		method: 'POST',
	},
};

module.exports = { router, activity };
