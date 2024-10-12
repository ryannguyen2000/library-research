const fs = require('fs');

function loadOTAs() {
	if (process.env.NODE_ENV === 'production') {
		const modules = {};
		fs.readdirSync(__dirname)
			.filter(n => n !== 'index.js')
			.map(n => n.replace('.js', ''))
			.forEach(name => {
				const modelFile = `./${name}`;
				const modelName = name.replace('.payout', '');
				const model = require(modelFile);
				modules[modelName] = model;
			});
		return modules;
	}
	return {};
}

module.exports = loadOTAs();
