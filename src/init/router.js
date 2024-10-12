const path = require('path');
const glob = require('glob');
const routeOTT = require('@ott/route');

function loadRouters(baseUri, routerFolder, prefix) {
	const routerFiles = glob(
		`${routerFolder}/**/*.${prefix}`, //
		{ sync: true, matchBase: true }
	);

	return routerFiles.map(routerFile => {
		let routerPath = path.relative(routerFolder, routerFile);

		if (routerPath.endsWith(`index.${prefix}`)) {
			routerPath = routerPath.replace(new RegExp(`index.${prefix}$`), '').slice(0, -1);
		} else {
			routerPath = routerPath.replace(new RegExp(`.${prefix}$`), '');
		}

		const urlPath = `${baseUri}${routerPath}`.replace(/\\/g, '/');
		const routeData = require(routerFile);

		return {
			...routeData,
			urlPath,
		};
	});
}

function initRouter({ app, server }) {
	const activityMethods = {};
	app.set('activityMethods', activityMethods);

	const routes = loadRouters('/', `${__dirname}/../routes`, 'router.js');
	routes.forEach(route => {
		if (route.router) {
			app.use(route.urlPath, route.router);
			activityMethods[route.urlPath] = route.activity;
		}
	});

	routeOTT(app);

	require('@src/wss').init(server);

	// fallback url
	app.get('/zalo_verifierRzci8E_AANWBwB5Toy0r1nJ1ZmluiLzMDp4.html', (req, res) => {
		res.sendFile(path.resolve(`publish/zalo_verifierRzci8E_AANWBwB5Toy0r1nJ1ZmluiLzMDp4.html`));
	});
	app.use('*', (req, res) => res.status(404).json({ error_code: 404, error_msg: 'not_found_data' }));
}

module.exports = initRouter;
