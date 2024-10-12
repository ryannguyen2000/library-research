const path = require('path');
const Jimp = require('jimp');

const { saveFile, removeFile } = require('../file');

async function createLetterApology({ name, fileName, type }) {
	const [image, font] = await Promise.all([
		Jimp.read(path.resolve(__dirname, `./template/${type}.png`)),
		Jimp.loadFont(path.resolve(__dirname, `../font/myriad_pro.fnt`)),
	]);

	const buffer = await image
		.print(font, 1405, 855, name)
		.deflateStrategy(0)
		.filterType(Jimp.PNG_FILTER_NONE)
		.getBufferAsync(Jimp.MIME_PNG);

	return saveFile(buffer, 'letter', `${fileName}.png`);
}

function removeLetter({ fileName }) {
	return removeFile('letter', `${fileName}.png`);
}

module.exports = {
	createLetterApology,
	removeLetter,
};
