const fs = require('fs');

function loadOTAs() {
	const modules = {};
	fs.readdirSync(__dirname)
		.filter(n => n.endsWith('.rec.js'))
		.forEach(fullName => {
			const modelFile = `./${fullName}`;
			const model = require(modelFile);
			const name = fullName.replace('.rec.js', '');

			modules[name] = model;
		});
	return modules;
}

module.exports = loadOTAs();
