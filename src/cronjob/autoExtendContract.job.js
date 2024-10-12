// const schedule = require('node-schedule');
// const _ = require('lodash');
// const moment = require('moment');

// const models = require('@models');
// const Contract = require('@controllers/booking/contract');
// const { logger } = require('@utils/logger');
// const { ContractStatus } = require('@utils/const');

// async function autoExtendContract() {
// 	try {
// 		const contracts = await models.BookingContract.find({
// 			autoExtend: true,
// 			status: ContractStatus.CONFIRMED,
// 			endDate: { $gte: moment().startOf('month').toDate(), $lte: moment().endOf('month').toDate() },
// 		});

// 		if (_.isEmpty(contracts)) return;

// 		const bookingIds = _.compact(_.map(contracts, c => _.last(c.bookingIds)));
// 		const bookings = await models.Booking.find({ _id: { $in: bookingIds } });

// 		if (!_.isEmpty(bookings)) {
// 			bookings.asyncForEach(async booking => {
// 				const contract = _.find(contracts, c =>
// 					_.includes(
// 						_.map(c.bookingIds, b => _.toString(b)),
// 						_.toString(booking._id)
// 					)
// 				);
// 				const to = moment(contract.endDate).add(1, 'month').toDate();

// 				if (contract) {
// 					try {
// 						await Contract.updateRange(booking, {
// 							contract,
// 							endDate: to,
// 							roomId: _.get(booking, 'reservateRooms[0]'),
// 						});
// 					} catch (err) {
// 						logger.error(`AutoExtendContract: Contract-${contract._id} ${err}`);
// 					}
// 				}
// 			});
// 		}
// 	} catch (err) {
// 		logger.error(err);
// 	}
// }

// schedule.scheduleJob(`0 0 0 1 */1 *`, autoExtendContract);
