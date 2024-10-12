const schedule = require('node-schedule');
const cheerio = require('cheerio');
const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const { Settings } = require('@utils/setting');
const models = require('@models');

function parseNumber(txt) {
	return txt && Number(txt.replace(/,/g, ''));
}

async function updateSetting(val, settingKey) {
	const exchange = parseNumber(val);
	if (exchange) {
		const setting = await models.Setting.getSetting(settingKey);
		setting.value = exchange;
		await setting.save();
	}
}

async function syncCurrency() {
	try {
		const xml = await fetch('https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10').then(
			res => res.text()
		);

		const $ = cheerio.load(xml, {
			xmlMode: true,
		});
		const usdElem = $('Exrate[CurrencyCode=USD]');
		const eurElem = $('Exrate[CurrencyCode=EUR]');

		await updateSetting(usdElem.attr('Buy'), Settings.BuyCurrencyExchange);
		await updateSetting(usdElem.attr('Transfer'), Settings.CurrencyExchange);
		await updateSetting(eurElem.attr('Buy'), Settings.BuyEURCurrencyExchange);
	} catch (e) {
		logger.error(e);
	}
}

schedule.scheduleJob('*/30 * * * *', syncCurrency);
