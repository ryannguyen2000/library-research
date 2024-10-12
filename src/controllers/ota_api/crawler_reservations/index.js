const fs = require('fs');

function loadOTAs() {
	if (process.env.NODE_ENV === 'production') {
		const modules = {};
		fs.readdirSync(__dirname)
			.filter(n => n !== 'index.js' && n.endsWith('.js'))
			.map(n => n.replace('.js', ''))
			.forEach(name => {
				const modelFile = `./${name}`;
				const model = require(modelFile);
				modules[name] = model;
			});
		return modules;
	}
	return {};
}

module.exports = loadOTAs();
