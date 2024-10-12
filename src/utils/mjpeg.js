const url = require('url');
const http = require('http');
const { logger } = require('@utils/logger');

function extractBoundary(contentType) {
	contentType = contentType.replace(/\s+/g, '');

	let startIndex = contentType.indexOf('boundary=');
	let endIndex = contentType.indexOf(';', startIndex);
	if (endIndex === -1) {
		// boundary is the last option
		// some servers, like mjpeg-streamer puts a '\r' character at the end of each line.
		if (contentType.indexOf('\r', startIndex) === -1) {
			endIndex = contentType.length;
		}
	}
	return contentType
		.substring(startIndex + 9, endIndex)
		.replace(/"/gi, '')
		.replace(/^--/gi, '');
}

exports.MjpegProxy = function (mjpegUrl) {
	let self = this;

	if (!mjpegUrl) throw new Error('Please provide a source MJPEG URL');

	self.mjpegOptions = url.parse(mjpegUrl);

	self.audienceResponses = [];
	self.newAudienceResponses = [];

	self.boundary = null;
	self.globalMjpegResponse = null;
	self.mjpegRequest = null;

	self.proxyRequest = function (req, res) {
		if (res.socket == null) {
			return;
		}

		// There is already another client consuming the MJPEG response
		if (self.mjpegRequest !== null) {
			self._newClient(req, res);
		} else {
			// Send source MJPEG request
			self.mjpegRequest = http.request(self.mjpegOptions, function (mjpegResponse) {
				// console.log('request');
				self.globalMjpegResponse = mjpegResponse;
				self.boundary = extractBoundary(mjpegResponse.headers['content-type']);

				self._newClient(req, res);

				let lastByte1 = null;
				let lastByte2 = null;

				mjpegResponse.on('data', function (chunk) {
					// Fix CRLF issue on iOS 6+: boundary should be preceded by CRLF.
					if (lastByte1 != null && lastByte2 != null) {
						let oldheader = `--${self.boundary}`;
						let p = chunk.indexOf(oldheader);

						if (
							(p === 0 && !(lastByte2 === 0x0d && lastByte1 === 0x0a)) ||
							(p > 1 && !(chunk[p - 2] === 0x0d && chunk[p - 1] === 0x0a))
						) {
							let b1 = chunk.slice(0, p);
							let b2 = Buffer.from(`\r\n--${self.boundary}`);
							let b3 = chunk.slice(p + oldheader.length);
							chunk = Buffer.concat([b1, b2, b3]);
						}
					}

					lastByte1 = chunk[chunk.length - 1];
					lastByte2 = chunk[chunk.length - 2];

					for (let i = self.audienceResponses.length; i--; ) {
						let fRes = self.audienceResponses[i];

						// First time we push data... lets start at a boundary
						if (self.newAudienceResponses.indexOf(fRes) >= 0) {
							let p = chunk.indexOf(`--${self.boundary}`);
							if (p >= 0) {
								fRes.write(chunk.slice(p));
								self.newAudienceResponses.splice(self.newAudienceResponses.indexOf(fRes), 1); // remove from new
							}
						} else {
							fRes.write(chunk);
						}
					}
				});
				mjpegResponse.on('end', function () {
					// console.log("...end");
					for (let i = self.audienceResponses.length; i--; ) {
						self.audienceResponses[i].end();
					}
				});
				mjpegResponse.on('close', function () {
					// console.log("...close");
				});
			});

			self.mjpegRequest.on('error', function (e) {
				logger.error('problem with request: ', e);
			});
			self.mjpegRequest.end();
		}
	};

	self._newClient = function (req, res) {
		res.writeHead(200, {
			Expires: 'Mon, 01 Jul 1980 00:00:00 GMT',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			Pragma: 'no-cache',
			'Content-Type': `multipart/x-mixed-replace;boundary=${self.boundary}`,
		});

		self.audienceResponses.push(res);
		self.newAudienceResponses.push(res);

		res.socket.on('close', function () {
			// console.log('exiting client!');

			self.audienceResponses.splice(self.audienceResponses.indexOf(res), 1);
			if (self.newAudienceResponses.indexOf(res) >= 0) {
				self.newAudienceResponses.splice(self.newAudienceResponses.indexOf(res), 1); // remove from new
			}

			if (self.audienceResponses.length === 0) {
				self.mjpegRequest = null;
				self.globalMjpegResponse.destroy();
			}
		});
	};
};
