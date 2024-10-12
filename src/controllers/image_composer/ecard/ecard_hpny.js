const path = require('path');
const Jimp = require('jimp');
const moment = require('moment');

const { saveFile } = require('../file');

const P_X = 1643;
const P_Y = 190;

async function create({ name, fileName, lang, type }) {
	const [image, font] = await Promise.all([
		Jimp.read(path.resolve(__dirname, `./template/${type}_${lang}.png`)),
		Jimp.loadFont(path.resolve(__dirname, `../font/roboto.fnt`)),
	]);

	const width = Jimp.measureText(font, name);

	const buffer = await image
		.print(font, P_X - width, P_Y, name)
		.deflateStrategy(0)
		.filterType(Jimp.PNG_FILTER_NONE)
		.getBufferAsync(Jimp.MIME_PNG);

	return saveFile(buffer, `${moment().format('YY/MM/DD')}/${type}`, `${fileName}.png`);
}

module.exports = {
	create,
};
