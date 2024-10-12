const fs = require('fs');

function loadOTAs() {
	if (global.isDev) {
		return {
			cozrum: require('./cozrum.promotion'),
			agoda: require('./agoda.promotion'),
		};
	}

	const modules = {};
	fs.readdirSync(__dirname)
		.filter(n => n.includes('.promotion'))
		.map(n => n.replace('.js', ''))
		.forEach(name => {
			const modelFile = `./${name}`;
			const modelName = name.replace('.promotion', '');
			const model = require(modelFile);
			modules[modelName] = model;
		});
	return modules;
}

module.exports = loadOTAs();
