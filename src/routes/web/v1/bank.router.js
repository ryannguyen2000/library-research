const { URL_CONFIG, SERVER_CONFIG } = require('@config/setting');
const router = require('@core/router').Publish();
const models = require('@models');

async function getBanks(req, res) {
	const banks = await models.Bank.find({
		active: true,
	})
		.sort({ name: 1 })
		.lean();

	banks.forEach(bank => {
		if (bank.logo) {
			bank.logo = `${URL_CONFIG.SERVER}${SERVER_CONFIG.STATIC.URI}${bank.logo}`;
		}
	});

	res.sendData(banks);
}

router.getS('/', getBanks);

module.exports = { router };
