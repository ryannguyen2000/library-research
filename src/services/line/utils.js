const fs = require('fs');
// const path = require('path');
const mime = require('mime-types');

// const { URL_CONFIG, OTT_CONFIG } = require('@config/setting');
// const { checkFolder } = require('@utils/file');
// prettier-ignore

const VideoExt = ['.webm', '.mkv', '.flv', '.flv', '.vob', '.ogv', '.ogg', '.drc', '.gif', '.gifv', '.mng', '.avi', '.MTS', '.M2TS', '.mov', '.qt', '.wmv', '.yuv', '.rm', '.rmvb', '.asf', '.amv', '.mp4', '.m4p', '.m4v', '.mpg', '.mp2', '.mpeg', '.mpe', '.mpv', '.mpg', '.mpeg', '.m2v', '.m4v', '.svi', '.3gp', '.3g2', '.mxf', '.roq', '.nsv', '.flv', '.f4v', '.f4p', '.f4a', '.f4b'];

// prettier-ignore
const AudioExt = ['.3gp', '.aa', '.aac', '.aax', '.act', '.aiff', '.amr', '.ape', '.au', '.awb', '.dct', '.dss', '.dvf', '.flac', '.gsm', '.iklax', '.ivs', '.m4a', '.m4b', '.m4p', '.mmf', '.mp3', '.mpc', '.msv', '.nmf', '.nsf', '.ogg', '.oga', '.mogg', '.opus', '.ra', '.rm', '.raw', '.sln', '.tta', '.voc', '.vox', '.wav', '.wma', '.wv', '.webm', '.8svx'];

const ImageExt = ['.jpeg', '.jpg', '.png', '.gif', '.tiff', '.psd', '.pdf', '.eps', '.ai', '.indd', '.raw'];

function getFileType(mimeType) {
	const fileType = mime.extension(mimeType);
	const formatType = `.${fileType}`;
	if (ImageExt.includes(formatType)) {
		return ['image', formatType];
	}
	if (AudioExt.includes(formatType)) {
		return ['audio', formatType];
	}
	if (VideoExt.includes(formatType)) {
		return ['video', formatType];
	}

	return ['file', formatType];
}

async function removeFile(url) {
	try {
		await fs.promises.unlink(url);
	} catch (err) {
		console.error(err);
	}
}

// async function saveBase64ToFile(base64Data, userId, imageId) {
// 	const folder = `${OTT_CONFIG.STATIC_RPATH}/line/${userId}`;
// 	const mimeType = base64Data.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
// 	const [type, format] = getFileType(mimeType);
// 	const fileName = `${imageId}${format}`;
// 	const buff = base64Data.split(';base64,').pop();
// 	await checkFolder(folder);
// 	await fs.promises.writeFile(path.resolve(`${folder}/${fileName}`), buff, 'base64');
// 	return [`${URL_CONFIG.SERVER + OTT_CONFIG.STATIC_PATH}/line/${userId}/${fileName}`, type, folder, fileName];
// }

module.exports = {
	// saveBase64ToFile,
	removeFile,
	getFileType,
};
