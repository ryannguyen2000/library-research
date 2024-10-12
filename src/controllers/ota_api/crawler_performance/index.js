const fs = require('fs');

function loadOTAs() {
	const modules = {};
	fs.readdirSync(__dirname)
		.filter(n => n !== 'index.js')
		.map(n => n.replace('.js', ''))
		.forEach(name => {
			modules[name] = require(`./${name}`);
		});
	return modules;
}

module.exports = loadOTAs();
