const redis = require('redis');
const bluebird = require('bluebird');
const config = require('../../config/setting');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

/**
 * RedisPool singleton class
 */
class RedisPool {
	/**
	 * Maximum connection of pool.
	 *
	 * @return {Number} maximum connection of pool
	 */
	static getMaxConnections() {
		return this.maxConnections;
	}

	/**
	 * pool init.
	 *
	 * @param  {object} options redis options,
	 * add maxConnections to create the number of client
	 * @return {RedisPool}  return this
	 */
	static init(options = undefined) {
		this.maxConnections = options.maxConnections;

		// client collection pool
		this.pool = Array(options.maxConnections)
			.fill(null)
			.map(() => redis.createClient(options));

		// list of waiting task request redis client
		this.waitingTasks = [];

		// add some userful function to redis client
		this.pool.forEach(rd => {
			/**
			 * Get value and convert it to integer from redis
			 *
			 * @param {String} key redis key
			 * @param {Number} defaultValue default value if key not exists
			 * @return {Number}
			 */
			rd.getIntAsync = async function(key, defaultValue = 0) {
				const value = await rd.getAsync(key);
				return parseInt(value || defaultValue);
			};

			/**
			 * Get value and convert it to float from redis
			 *
			 * @param {String} key redis key
			 * @param {Number} defaultValue default value if key not exists
			 * @return {Number}
			 */
			rd.getFloatAsync = async function(key, defaultValue = 0.0) {
				const value = await rd.getAsync(key);
				return parseFloat(value || defaultValue);
			};

			/**
			 * Get value and convert it to Object from redis
			 *
			 * @param {String} key redis key
			 * @return {Object}
			 */
			rd.getJSONAsync = async function(key) {
				return await rd.getAsync(key).then(val => (val ? JSON.parse(val) : val));
			};

			/**
			 * release redis client
			 */
			rd.release = function() {
				RedisPool.release(rd);
			};
		});

		// wrapper all client query commands
		Object.getOwnPropertyNames(redis.RedisClient.prototype)
			.filter(name => name.endsWith('Async'))
			.forEach(name => {
				this[name] = (...args) => this.command(name, ...args);
			});

		return this;
	}

	/**
	 * wrapper client query command.
	 * This function pop one client, query command with
	 * this client and push it back to pool
	 *
	 * @param  {String}    name the name of command
	 * @param  {...any} args arguments of command
	 * @return {Promise<RedisClient>}         [description]
	 */
	static async command(name, ...args) {
		const rd = await this.getClient();
		try {
			const ret = await rd[name](...args);
			this.release(rd);
			return ret;
		} catch (err) {
			this.release(rd);
			throw err;
		}
	}

	/**
	 * @brief pop one client.
	 *
	 * This function wait until get and pop one connection.
	 *
	 * @return {Promise<RedisClient>}            redis client
	 */
	static getClient() {
		return new Promise(resolve => {
			if (this.pool.length) {
				resolve(this.pool.pop());
			} else {
				this.waitingTasks.push(resolve);
			}
		});
	}

	/**
	 * push client to pool
	 *
	 * @param  {RedisClient} client The client be released to pool
	 */
	static release(client) {
		// if (this.pool.includes(client)) return;
		if (!this.waitingTasks.length) {
			this.pool.push(client);
			return;
		}

		const resolve = this.waitingTasks.pop();
		resolve(client);
	}
}

RedisPool.pop = RedisPool.getClient;
RedisPool.push = RedisPool.release;

RedisPool.init(config.redis);

module.exports = RedisPool;
