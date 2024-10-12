const fs = require('fs');
const { isMainThread } = require('worker_threads');

function loadOTAs() {
	const modules = {};

	if (isMainThread) {
		fs.readdirSync(__dirname)
			.filter(n => n !== 'index.js')
			.map(n => n.replace('.js', ''))
			.forEach(name => {
				modules[name] = require(`./${name}`);
			});
	}

	return modules;
}

module.exports = loadOTAs();
