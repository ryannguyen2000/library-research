const express = require('express');
const { SERVER_CONFIG } = require('@config/setting');
const path = require('path');
const glob = require('glob');

function initStatic({ app }) {
	if (process.env.NODE_ENV !== 'production') {
		const swaggerUi = require('swagger-ui-express');
		const options = {
			explorer: true,
		};
		glob(`swagger/**/*.json`, { sync: true, matchBase: true }).forEach(file => {
			const doc = require(path.resolve(file));
			app.use(
				`/api-doc/${doc.info.title.toLowerCase()}`,
				swaggerUi.serveFiles(doc, options),
				swaggerUi.setup(doc, options)
			);
		});
	}

	// set static folder
	app.use(SERVER_CONFIG.STATIC.URI, express.static(SERVER_CONFIG.STATIC.PATH, SERVER_CONFIG.STATIC.OPTIONS));
}

module.exports = initStatic;
