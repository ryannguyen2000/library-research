const fs = require('fs');
const moment = require('moment');

const { UPLOAD_CONFIG } = require('@config/setting');
const fetch = require('@utils/fetch');
const { checkFolder } = require('@utils/file');

async function generateStatic({ lat, lng }) {
	const center = `${lat},${lng}`;
	const marker = encodeURIComponent(`color:red|label:C|${center}`);
	const key = process.env.GOOGLE_MAP_API_KEY;

	const uri = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=16&size=600x400&key=${key}&markers=${marker}&format=jpg`;

	const buffer = await fetch(uri).then(res => res.buffer());

	const folderPath = `${moment().format('YY/MM/DD')}`;
	const fileName = `map-static-${Math.ceil(Date.now() / 1000)}.jpg`;

	const fp = await checkFolder(`${UPLOAD_CONFIG.PATH}/${folderPath}`);

	await fs.promises.writeFile(`${fp}/${fileName}`, buffer);

	return {
		filePath: `${UPLOAD_CONFIG.FULL_URI}/${folderPath}/${fileName}`,
	};
}

module.exports = {
	generateStatic,
};
