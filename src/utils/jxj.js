const { exec } = require('child_process');
const path = require('path');

const PATH_DECODE = path.resolve(
	`${__dirname}/../../lib/libjxl/${process.platform}/djxl${process.platform === 'win32' ? '.exe' : ''}`
);

function decodeJxl(inputFile, outputFile) {
	const command = `${PATH_DECODE} ${inputFile} ${outputFile}`;

	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, a) => {
			// console.log('decodeJxl', stdout, a);
			if (error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
	});
}

module.exports = {
	decodeJxl,
};
