const { fib } = require('./func');

class AsyncOne {
	constructor() {
		this.queue = {};
		this.result = {};
	}

	acquire(key, func) {
		if (this.queue[key]) {
			return new Promise((resolve, reject) => {
				this.queue[key].push({ resolve, reject });
			});
		}
		const promise = new Promise((resolve, reject) => {
			this.queue[key] = [{ resolve, reject }];
		});

		func()
			.then(rs => {
				this.result[key] = {
					resolve: true,
					data: rs,
				};
			})
			.catch(err => {
				this.result[key] = {
					resolve: false,
					data: err,
				};
			})
			.finally(() => {
				if (this.result[key].resolve) {
					this.queue[key].forEach(({ resolve }) => resolve(this.result[key].data));
				} else {
					this.queue[key].forEach(({ reject }) => reject(this.result[key].data));
				}
				delete this.queue[key];
			});

		return promise;
	}
}

// testing
// (async function () {
// 	const asyncO = new AsyncOne();

// 	const rs = await Promise.all([
// 		asyncO.acquire('1', () => {
// 			return new Promise(resolve => setTimeout(() => resolve('one'), 1000));
// 		}),
// 		asyncO.acquire('1', () => {
// 			return new Promise(resolve => setTimeout(() => resolve('two'), 2000));
// 		}),
// 		asyncO.acquire('1', () => {
// 			return new Promise(resolve => setTimeout(() => resolve('three'), 3000));
// 		}),
// 	]);

// 	console.log(rs);
// })();

async function retryAsync(asyncFunc, options, retried = 0) {
	const { maxRetry, onError, maxTimeEachRetry = 60 * 60 * 1000 * 2 } = options || {};

	try {
		await asyncFunc();
	} catch (e) {
		if (typeof onError === 'function') {
			onError(e);
		}

		if (maxRetry && maxRetry >= retried) {
			return Promise.reject(`Max retry ${retried}`);
		}

		const timeout = Math.min(fib(5 + retried) * 1000, maxTimeEachRetry);

		await Promise.delay(timeout);

		return retryAsync(asyncFunc, options, retried + 1);
	}
}

module.exports = {
	AsyncOne,
	retryAsync,
};
