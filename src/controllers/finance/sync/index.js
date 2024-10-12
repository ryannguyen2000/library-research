const { isMainThread } = require('worker_threads');

module.exports = isMainThread ? require('./main') : require('./worker');
