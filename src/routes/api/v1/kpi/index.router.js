const router = require('@core/router').Router();
const kpi = require('./kpi.subrouter');
const kpi_user = require('./kpi_user.subrouter');

const activity = {};

router.getS(`/kpi`, kpi.list);
router.getS(`/kpi/:id`, kpi.view);
router.postS(`/kpi`, kpi.create);
router.putS(`/kpi/:id`, kpi.modify);
router.deleteS(`/kpi/:id`, kpi.del);

router.getS(`/kpi_user`, kpi_user.list);
router.getS(`/kpi_user/:id`, kpi_user.view);
router.postS(`/kpi_user`, kpi_user.create);
router.postS(`/kpi_user/reward`, kpi_user.reward);

router.getS(`/types`, kpi.getTypes);

// activity[`ASSET_UPDATE`] = {
// 	method: 'PUT',
// 	key: `/asset`,
// };

module.exports = { router, activity };
