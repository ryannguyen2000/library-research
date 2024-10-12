const glob = require('glob');
const path = require('path');
const router = require('@core/router').Router();
const { Settings } = require('@utils/setting');
const { Currency } = require('@utils/const');

function loadRouter() {
	const EXT = '.ctg';
	const baseFolder = path.join(__dirname, '../../../controllers/categories');
	const files = glob(`${baseFolder}/*${EXT}.js`, {
		sync: true,
		matchBase: true,
	});

	const activity = {};

	files.forEach(file => {
		const ctgModule = require(file);
		const name = path.basename(file, path.extname(file)).replace(EXT, '');
		const prefix = `CATEGORY_${name.toUpperCase()}`;

		if (ctgModule.get) {
			router.getS(`/${name}`, ctgModule.get);
		}
		if (ctgModule.create) {
			router.postS(`/${name}`, ctgModule.create);
			activity[`${prefix}_CREATE`] = {
				key: name,
			};
		}
		if (ctgModule.update) {
			router.putS(`/${name}/:id`, ctgModule.update);
			activity[`${prefix}_UPDATE`] = {
				key: name,
				method: 'PUT',
			};
		}
		if (ctgModule.del) {
			router.deleteS(`/${name}/:id`, ctgModule.del);
			activity[`${prefix}_DELETE`] = {
				key: name,
				method: 'DELETE',
			};
		}
	});

	return activity;
}

const activity = loadRouter();

async function getCurrencyExchange(req, res) {
	const rs = [
		{
			currency: Currency.USD,
			exchange: Settings.BuyCurrencyExchange.value,
			updatedAt: Settings.BuyCurrencyExchange.updatedAt,
		},
		{
			currency: Currency.EUR,
			exchange: Settings.BuyEURCurrencyExchange.value,
			updatedAt: Settings.BuyEURCurrencyExchange.updatedAt,
		},
	];

	res.sendData(rs);
}

router.getS(`/currency/exchange`, getCurrencyExchange);

module.exports = { router, activity };
