const path = require('path');
const glob = require('glob');

function loadModels(folder) {
	if (process.env.NODE_ENV === 'production') {
		const baseFolder = path.join(__dirname, folder);
		const modelFiles = glob(`${baseFolder}/**/*.job.js`, {
			sync: true,
			matchBase: true,
		});
		for (const modelFile of modelFiles) {
			require(modelFile);
		}
	}

	require('./exportOperationReport.job');
	// require('./fileCrawler.job');
	// require('./autoPricing.job');
	// require('./autoPromotion.job');
}

module.exports = loadModels('.');
