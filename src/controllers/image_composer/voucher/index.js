const Jimp = require('jimp');
const path = require('path');
const moment = require('moment');

const { saveFile, removeFile } = require('../file');

async function createVoucher({ code, dateExpired, value, roomType, language }) {
	const [image, carpentrySign, font] = await Promise.all([
		Jimp.read(path.resolve(__dirname, `./template/voucher_${language}.png`)),
		Jimp.read(path.resolve(__dirname, `./template/carpentrySign.png`)),
		Jimp.loadFont(path.resolve(__dirname, `../font/open-sans.fnt`)),
	]);

	const dateFormat = moment(dateExpired).format('DD/MM/Y');

	const buffer = await image
		.print(font, 1240, 1003, code)
		.print(font, 1385, 1098, dateFormat)
		.print(font, 1385, 1192, value)
		.print(font, 1385, 1288, roomType)
		.composite(carpentrySign, 1445, 1240)
		.deflateStrategy(Jimp.PNG_FILTER_NONE)
		.filterType(Jimp.PNG_FILTER_NONE)
		.getBufferAsync(Jimp.AUTO);

	const url = await saveFile(buffer, `${moment().format('YY/MM/DD')}/voucher`, `${code}.png`);
	return url;
}

function removeVoucher({ code, createdAt }) {
	return removeFile(`${moment(createdAt).format('YY/MM/DD')}/voucher`, `${code}.png`);
}

module.exports = {
	createVoucher,
	removeVoucher,
};
