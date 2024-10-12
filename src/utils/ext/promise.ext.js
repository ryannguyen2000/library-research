// Promise extension function

/**
 * create delay function
 *
 * @param  {[Number]} milliseconds time in millisecond to delay
 * @return {None}              [description]
 */
Promise.delay = function(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
};

/**
 * delay for next tick of nodejs loop.
 * see more at https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/
 */
Promise.nextTick = function() {
	return new Promise(resolve => process.nextTick(resolve));
};

/**
 * convert callback function to Async function
 *
 * @param  {Function} callback [description]
 * @return {[Promise]}            [description]
 */
Promise.toAsync = function(callback, errFirst = true) {
	return function(...args) {
		return new Promise((resolve, reject) => {
			if (errFirst) {
				callback(...args, (err, data) => (err != null ? reject(err) : resolve(data)));
			} else {
				callback(...args, (data, err) => {
					resolve(data, err);
				});
			}
		});
	};
};
