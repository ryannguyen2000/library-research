const { Worker, isMainThread, parentPort } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const { logger } = require('@utils/logger');
const constant = require('./const');

let SYS_EVENTS;
let sysEventEmitter;

if (isMainThread) {
	({ SYS_EVENTS, sysEventEmitter } = require('@utils/events'));
}

const messageQueue = new Map();
const workers = {};

function onMessage(message) {
	if (sysEventEmitter) {
		sysEventEmitter.emit(SYS_EVENTS.WORKER_SENT_MESSAGE, this, message);
	}

	const current = messageQueue.get(message.id);
	if (current) {
		if (message.error) {
			current.reject(message.error);
		} else {
			current.resolve(message.result);
		}

		messageQueue.delete(message.id);
	} else if (isMainThread) {
		if (!constant[message.type]) {
			return;
		}

		runWorker(message)
			.then(result => {
				this.postMessage({
					...message,
					result,
				});
			})
			.catch(error => {
				this.postMessage({
					...message,
					error,
				});
			});
	}
}

function getWorker(type) {
	if (type.startsWith('FILE_')) return workers.file;
	if (type.startsWith('GENERATE_')) return workers.puppeteer;
	return workers.utils;
}

function runWorker(data) {
	if (!Object.values(constant).includes(data.type)) {
		return Promise.reject(`Worker type is not valid: ${data.type}`);
	}

	return new Promise((resolve, reject) => {
		data.id = data.id || uuid();
		messageQueue.set(data.id, { resolve, reject });

		const worker = isMainThread ? getWorker(data.type) : parentPort;
		worker.postMessage(data);
	});
}

if (isMainThread) {
	const loadWorker = function (name) {
		const modelName = name.replace('.worker.js', '');
		const worker = new Worker(path.join(__dirname, `./${name}`), {
			resourceLimits: {
				stackSizeMb: 100,
			},
		});

		worker.on('error', err => {
			logger.error('Error worker', err);
			worker.terminate().finally(() => {
				loadWorker(name);
			});
		});
		worker.on('message', onMessage);
		workers[modelName] = worker;
	};

	const exit = function () {
		Object.values(workers).forEach(worker => {
			worker.postMessage({ type: constant.EXIT });
		});

		setTimeout(() => {
			process.exit(0);
		}, 1000);
	};

	process.on('SIGINT', exit);
	process.on('exit', exit);

	fs.readdirSync(__dirname)
		.filter(n => n.endsWith('worker.js'))
		.forEach(name => {
			loadWorker(name);
		});
} else {
	parentPort.on('message', onMessage);
}

module.exports = { runWorker };
