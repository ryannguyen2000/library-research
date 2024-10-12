const dotenv = require('dotenv');

// load env file
dotenv.config({ path: `${__dirname}/../.env` });

const env = process.env.NODE_ENV;
console.log('env', env);
console.log('platform', process.platform);

module.exports = env === 'production' ? require('./setting.production') : require('./setting.local');
