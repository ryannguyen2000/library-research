const mongoose = require('mongoose');

require('./custom.objectid');
require('./custom.datetime');

const { Schema, Ref } = require('./custom.schema');
const Types = require('./custom.types');
const { applyOptimize, optimize } = require('./custom.optimize');

Types.Ref = Ref;
Schema.Types = Types;

const Custom = {
	optimize,
	applyOptimize,
	Ref,
	Schema,
};

mongoose.Custom = Custom;
// mongoose.Schema = Custom.Schema;

module.exports = mongoose;
