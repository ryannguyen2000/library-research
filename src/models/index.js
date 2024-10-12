// const path = require('path');
const glob = require('glob');
const { isMainThread } = require('worker_threads');

require('@utils/mongoose');
const { logger } = require('@utils/logger');

const modelFiles = glob(`${__dirname}/**/*.model.js`, {
	sync: true,
	matchBase: true,
});
const models = {};
const secondaryModels = [];

for (const modelFile of modelFiles) {
	try {
		const mod = require(modelFile);

		const model = mod.getModel ? mod.getModel() : mod;
		models[model.modelName] = model;

		if (mod.getModel) secondaryModels.push(mod);
	} catch (e) {
		logger.error('Load model error', modelFile, e);
	}
}

function loadModels() {
	// all models

	// for (const modelFile of modelFiles) {
	// 	try {
	// 		const mod = require(modelFile);
	// 		const model = mod.getModel ? mod.getModel() : mod;
	// 		// console.log(model.getModel);
	// 		models[model.modelName] = model;
	// 	} catch (e) {
	// 		logger.error('Load model error', modelFile, e);
	// 	}

	// 	// logger.info(`loaded model ${model.modelName} -> ${relativePath}`);
	// }

	for (const modelName in models) {
		if (typeof models[modelName].initial === 'function') {
			if (isMainThread || models[modelName].initOnAllWorkers) {
				models[modelName].initial();
			}
		}
	}
}

loadModels();

models.loadModels = loadModels;

models.loadSecondaryModels = function (connection) {
	secondaryModels.forEach(sModel => {
		const newModel = sModel.setModel(connection);
		models[newModel.modelName] = newModel;
	});
};

module.exports = models;
