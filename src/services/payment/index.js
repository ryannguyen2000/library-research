const fs = require('fs');

function loadOTAs() {
	const modules = {};
	fs.readdirSync(__dirname)
		.filter(n => n !== 'index.js')
		.map(n => n.replace('.js', ''))
		.forEach(name => {
			const model = require(`./${name}`);
			modules[name] = model;
		});
	return modules;
}

module.exports = loadOTAs();
