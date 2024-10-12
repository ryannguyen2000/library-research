const { isMainThread } = require('worker_threads');

module.exports = isMainThread ? require('./thread/main') : require('./thread/worker');
