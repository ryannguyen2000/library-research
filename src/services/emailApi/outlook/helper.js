function encodeToURLFormat(inputString) {
	const stringWithQuotes = `"${inputString}"`;
	return encodeURIComponent(stringWithQuotes);
}

function getNextPageQuery(nextLink) {
	if (!nextLink) return { skip: null, skiptoken: null };
	const urlObject = new URL(nextLink);
	const skip = urlObject.searchParams.get('$skip');
	const skiptoken = urlObject.searchParams.get('$skiptoken');
	return { skip, skiptoken };
}

// function getFormatMediaType({ type }) {
// 	switch (type) {
// 		case 'image/png':
// 			return '.jpg';
// 		case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
// 			return '.docx';
// 		case 'application/pdf':
// 			return '.pdf';
// 		case 'text/csv':
// 			return '.xlsx';
// 		default:
// 			return '';
// 	}
// }

// async function saveFile({ emailType, userId, file, name, id }) {
// 	const folder = `${OTT_CONFIG.STATIC_RPATH}/email/${emailType}/${userId}`;
// 	const fileName = `${id}-${name}`;

// 	await checkFolder(folder);
// 	await fs.promises.writeFile(path.resolve(`${folder}/${fileName}`), file);

// 	return `${URL_CONFIG.SERVER + OTT_CONFIG.STATIC_PATH}/email/${emailType}/${userId}/${fileName}`;
// }

module.exports = { encodeToURLFormat, getNextPageQuery };
