const { runWorker } = require('@workers/index');

const CONSTANT = require('@workers/const');

function generateImagePath(data) {
	return runWorker({
		type: CONSTANT.GENERATE_IMAGE_PATH,
		data,
	});
}

function generatePdfPath(html, fileDir, fileName, options) {
	return runWorker({
		type: CONSTANT.GENERATE_PDF_PATH,
		data: {
			html,
			fileDir,
			fileName,
			options,
		},
	});
}

module.exports = {
	generateImagePath,
	generatePdfPath,
};
