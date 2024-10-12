const router = require('@core/router').Router();
const { getEvents, initWS } = require('@controllers/events');

router.getS('/', getEvents, true);

module.exports = { router, ws: initWS };
