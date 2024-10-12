const fs = require('fs');
const paths = require('path');
const { UPLOAD_CONFIG } = require('@config/setting');
const { checkFolder } = require('@utils/file');

async function getPath(dir, createFolder) {
	const path = paths.resolve(UPLOAD_CONFIG.PATH, `./${dir}`);

	if (createFolder) {
		await checkFolder(path);
	}
	return path;
}

async function saveFile(file, dir, name) {
	const path = await getPath(dir, true);
	await fs.promises.writeFile(`${path}/${name}`, file, { flag: 'w' });

	return `${UPLOAD_CONFIG.FULL_URI}/${dir}/${name}`;
}

async function removeFile(dir, name) {
	const path = await getPath(dir);

	await fs.promises.unlink(`${path}/${name}`).catch(() => {});

	return path;
}

module.exports = {
	saveFile,
	removeFile,
};
