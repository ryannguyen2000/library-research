const moment = require('moment');
// const puppeteer = require('puppeteer-extra');
// const pluginStealth = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer');

const ThrowReturn = require('@core/throwreturn');
// const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');

const PUPPETEER_MINIMAL_ARGS = [
	'--no-sandbox', //
	'--disable-site-isolation-trials',
	'--disable-web-security',
];

const USER_DATA_DIR = 'puppeteer/data/kovena';
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.0 Safari/537.36';

// puppeteer.use(pluginStealth());

async function processPayment({ url, notifyUrl, cardInfo, timeout = 40000, email }) {
	const browser = await puppeteer.launch({
		headless: !global.isDev,
		devtools: false,
		args: PUPPETEER_MINIMAL_ARGS,
		// executablePath: originPuppeteer.executablePath(),
		ignoreHTTPSErrors: true,
		userDataDir: USER_DATA_DIR,
	});
	await browser.userAgent(USER_AGENT);

	const page = await browser.newPage();

	await page.setUserAgent(USER_AGENT);

	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new ThrowReturn('processPayment kovena timeout'));
		}, timeout);

		try {
			await page.goto(url, {
				waitUntil: 'networkidle2',
			});

			const iframe = await page.waitForSelector('iframe.sceneInput');
			const frame = await iframe.contentFrame();

			await frame.waitForSelector('input[name="cardName"]');
			await frame.type('input[name="cardName"]', cardInfo.cardName);

			const cardFrame = await frame.waitForSelector('.cardNumber > iframe');

			const cardFrameContent = await cardFrame.contentFrame();

			await cardFrameContent.waitForSelector('#field');
			await cardFrameContent.type('#field', cardInfo.cardNumber);

			await frame.type('input.expiryDate', moment(cardInfo.expirationDate, 'MM/YYYY').format('MM/YY'));

			const cgvFrame = await frame.waitForSelector('.cvv > iframe');
			const cgvFrameContent = await cgvFrame.contentFrame();

			await cgvFrameContent.waitForSelector('#field');
			await cgvFrameContent.type('#field', cardInfo.cvc);

			if (email && (await frame.$('input[name="cardHolderEmail"]'))) {
				await frame.type('input[name="cardHolderEmail"]', email);
			}

			page.on('response', async function (response) {
				if (response.url() === notifyUrl) {
					const rs = await response.json();

					if (rs.error_code === 0) {
						resolve(rs.data);
					} else {
						reject(new ThrowReturn(rs.error_msg));
					}

					clearTimeout(timer);

					logger.info('close automation kovena');
					await page.close();
					await browser.close();
				}
			});

			await Promise.delay(400);

			await page.click('#tokenizeButton');
		} catch (e) {
			logger.error('process auto payment', e);

			clearTimeout(timer);

			logger.info('close automation kovena');
			await page.close();
			await browser.close();

			reject(e);
		}
	});
}

module.exports = {
	processPayment,
};
