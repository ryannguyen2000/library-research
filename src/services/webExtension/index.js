const { isMainThread } = require('worker_threads');

module.exports = isMainThread ? require('./main_thread') : require('./worker_thread');
