const schedule = require('node-schedule');
const path = require('path');
const fs = require('fs');

const { logger } = require('@utils/logger');
const { decodeJxl } = require('@utils/jxj');
const { runWorker } = require('@workers/index');
const { FILE_CRAWLER } = require('@workers/const');
const models = require('@models');

const CONCURENT = 4;
const MAX_RETRY = 4;
let running = false;

function download(data) {
	return runWorker({
		type: FILE_CRAWLER,
		data,
	});
}

const TRANSFORM_EXT = ['.jxl'];

async function runJob() {
	if (running) return;

	try {
		running = true;

		const files = await models.FileCrawler.find({
			done: false,
			retried: { $lt: MAX_RETRY },
		})
			.sort({ updatedAt: 1 })
			.limit(CONCURENT);

		if (files.length) {
			await files.asyncMap(async file => {
				try {
					const filePath = await download(file.toJSON());

					const extName = path.extname(filePath);

					if (TRANSFORM_EXT.includes(extName)) {
						await decodeJxl(filePath, filePath.replace(extName, '.jpg'))
							.then(() => {
								file.done = true;
							})
							.catch(async e => {
								if (e.toString().includes('could not decode losslessly')) {
									await fs.promises.rename(filePath, filePath.replace(extName, '.jpg'));
									file.done = true;
								} else {
									logger.error('fileCrawler.job -> decodeJxl', file, e);
									file.done = false;
								}
							});
					} else {
						file.done = true;
					}
				} catch (e) {
					file.done = false;
					file.retried = (file.retried || 0) + 1;

					logger.error('fileCrawler.job -> download', file, e);
				} finally {
					await file.save();
				}
			});
		}
	} catch (e) {
		logger.error('fileCrawler.job', e);
	} finally {
		running = false;
	}
}

schedule.scheduleJob(`*/1 * * * * *`, runJob);
