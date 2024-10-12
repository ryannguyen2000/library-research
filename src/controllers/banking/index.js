const _ = require('lodash');
// const moment = require('moment');

const { SYS_BANK_ACCOUNT_TYPE, BANK_ACCOUNT_TYPE, SMSBankingPhones } = require('@utils/const');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const BankServices = require('@services/bank');
const models = require('@models');

async function getAccounts(user) {
	const accounts = await models.BankAccount.find({
		active: true,
		groupIds: { $in: user.groupIds },
		accountType: {
			$in: [BANK_ACCOUNT_TYPE.PERSONAL, BANK_ACCOUNT_TYPE.COMPANY_PERSONAL, BANK_ACCOUNT_TYPE.COMPANY],
		},
	})
		.populate('createdBy', 'user username')
		.lean();

	return {
		accounts,
	};
}

async function getServiceAccounts(user, query) {
	const serviceAccounts = await models.BankServiceAccount.find({
		active: true,
		accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND,
		bankCode: query.bankCode,
	})
		.select('-configs')
		.lean();

	return {
		serviceAccounts,
	};
}

async function getBanks() {
	const banks = SMSBankingPhones.map(s => ({
		name: s,
		id: s,
	}));

	return {
		banks,
	};
}

async function createAccount(user, data) {
	const account = await models.BankAccount.create({
		...data,
		groupIds: user.groupIds,
	});

	return {
		account,
	};
}

async function updateAccount(user, accountId, data) {
	const account = await findAccount(user, accountId);

	_.assign(account, data);
	await account.save();

	return {
		account,
	};
}

async function deleteAccount(user, accountId) {
	const account = await findAccount(user, accountId);

	account.active = false;
	await account.save();
}

async function findAccount(user, accountId) {
	const account = await models.BankAccount.findOne({ _id: accountId, groupIds: { $in: user.groupIds } });

	if (!account) {
		throw new ThrowReturn('Account not found!');
	}

	return account;
}

async function callService(account, action, data) {
	if (!BankServices[account.shortName] || !BankServices[account.shortName][action]) {
		throw new ThrowReturn('Not support!');
	}

	const serviceAccount = await models.BankServiceAccount.findOne({
		active: true,
		accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND,
		bankCode: account.bankCode,
	});

	try {
		const res = await BankServices[account.shortName][action]({
			serviceAccount,
			account,
			data,
		});

		return res;
	} catch (e) {
		logger.error('callService banking', e);
		throw new ThrowReturn(_.toString(e));
	}
}

async function requestSubscribeNotification(user, accountId) {
	const account = await findAccount(user, accountId);

	return callService(account, 'requestSubscribeNotification');
}

async function confirmSubscribeNotification(user, accountId, data) {
	const account = await findAccount(user, accountId);

	await callService(account, 'confirmSubscribeNotification', data);

	account.subscribedNotification = true;
	await account.save();

	return {
		subscribedNotification: account.subscribedNotification,
	};
}

async function requestUnsubscribeNotification(user, accountId) {
	const account = await findAccount(user, accountId);

	return callService(account, 'requestUnsubscribeNotification');
}

async function confirmUnsubscribeNotification(user, accountId, data) {
	const account = await findAccount(user, accountId);

	await callService(account, 'confirmUnsubscribeNotification', data);

	account.subscribedNotification = false;
	await account.save();

	return {
		subscribedNotification: account.subscribedNotification,
	};
}

module.exports = {
	getAccounts,
	getServiceAccounts,
	getBanks,
	createAccount,
	updateAccount,
	deleteAccount,
	requestSubscribeNotification,
	confirmSubscribeNotification,
	requestUnsubscribeNotification,
	confirmUnsubscribeNotification,
};
