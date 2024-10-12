const router = require('@core/router').Router();
const guests = require('@controllers/guest');
const register = require('@controllers/guest/registration');
const autoRegister = require('@controllers/guest/autoRegistration');
// const guestMerger = require('@controllers/guest/merger');
const guestMergerV2 = require('@controllers/guest/mergerV2');

router.getS('/', guests.getGuests, true);
router.postS('/', guests.createGuest, true);
router.getS('/phone', guests.getGuestByPhone, true);

router.getS('/tag', guests.getTags, true);
router.postS('/tag', guests.createTag, true);
router.putS('/tag/:id', guests.updateTag, true);

router.getS('/blacklist', guests.getBLs, true);
router.getS('/blacklist/:id', guests.getBL, true);
router.postS('/blacklist', guests.createBL, true);
router.putS('/blacklist/:id', guests.updateBL, true);
router.deleteS('/blacklist/:id', guests.deleteBL, true);

router.getS('/residence', register.getRegistrations, true);
router.getS('/residence/export', register.exportRegistrations, true);

router.getS('/registration', autoRegister.getRegistrations, true);
router.postS('/registration', autoRegister.autoRegistration, true);
router.deleteS('/registration', autoRegister.resetRegistration, true);
router.getS('/registration/capcha', autoRegister.getCapcha, true);
router.postS('/registration/capcha', autoRegister.sendCapcha, true);
router.getS('/registration/otp', autoRegister.getOTP, true);
router.postS('/registration/otp', autoRegister.sendOTP, true);

router.getS('/dataPassport', guests.getDataPassport, false);
router.postS('/csv', guests.CSVDetect, true);

router.getS('/history/:guestId', guests.getHistory, true);
router.postS('/history/:guestId', guests.createHistory, true);
router.putS('/history/:guestId/:historyId', guests.updateHistory, true);
router.deleteS('/history/:guestId/:historyId', guests.removeHistory, true);

router.getS('/logs/:guestId', guests.getLogs, true);

// router.getS('/merger/group', guestMerger.getGroups, true);
// router.getS('/merger/group/list', guestMerger.getGuestsByKey, true);
// router.getS('/merger/history', guestMerger.getHistories, true);
// router.postS('/merger/merge', guestMerger.mergeGuests, true);
// router.postS('/merger/history/:id/rollback', guestMerger.rollbackMerger, true);

router.getS('/merger/mergev2/group', guestMergerV2.getGroups, true);
router.postS('/merger/mergev2', guestMergerV2.mergeGuests, true);
router.getS('/merger/mergev2/group/list', guestMergerV2.getGuestsByKey, true);
router.postS('/merger/mergev2/history/:id/rollback', guestMergerV2.rollbackMerger, true);
router.putS('/merger/mergev2/history/:id', guestMergerV2.updateGuestMerger, true);

router.getS('/:guestId', guests.getGuestInfo, true);
router.putS('/:guestId', guests.updateGuestInfo, true);
router.postS('/:guestId/link', guests.link, true);
router.postS('/:guestId/:bookingId', guests.addToBooking, true);
router.deleteS('/:guestId/:bookingId', guests.removeFromBooking, true);

router.getS('/:departmentId/:account', guests.getGuestsByDepartment, true);

const activity = {
	GUEST_UPDATE: {
		key: '/{id}',
		exact: true,
		method: 'PUT',
	},
	GUEST_TAG_CREATE: {
		key: '/tag',
		exact: true,
	},
	GUEST_TAG_UPDATE: {
		key: '/tag/{id}',
		exact: true,
		method: 'PUT',
	},
	GUEST_NOTE_CREATE: {
		key: '/history/{id}',
		exact: true,
	},
	GUEST_NOTE_UPDATE: {
		key: '/history/{id}/{id}',
		exact: true,
		method: 'PUT',
	},
	GUEST_NOTE_DELETE: {
		key: '/history/{id}/{id}',
		exact: true,
		method: 'DELETE',
	},
	GUEST_LINK: {
		key: '/{id}/link',
		exact: true,
		method: 'POST',
	},
	GUEST_ADD_TO_BOOKING: {
		key: '/{id}/{id}',
		method: 'POST',
		exact: true,
	},
	GUEST_DELETE_FROM_BOOKING: {
		key: '/{id}/{id}',
		method: 'DELETE',
		exact: true,
	},
	GUEST_DETECT_PASSPORT: {
		key: '/csv',
		method: 'POST',
		exact: true,
	},
	GUEST_AUTO_REGISTRATION: {
		key: '/registration',
		method: 'POST',
		exact: true,
	},
	GUEST_AUTO_REGISTRATION_CAPCHA: {
		key: '/registration/capcha',
		method: 'POST',
		exact: true,
	},
	GUEST_AUTO_REGISTRATION_OTP: {
		key: '/registration/otp',
		method: 'POST',
		exact: true,
	},
	GUEST_MERGER: {
		key: '/merger/mergev2',
		exact: true,
	},
	GUEST_MERGER_ROLLBACK: {
		key: '/merger/mergev2/history/{id}/rollback',
		exact: true,
	},
	GUEST_V2_UPDATE: {
		key: '/merger/mergev2/history/{id}',
		method: 'PUT',
		exact: true,
	},
};

module.exports = { router, activity };
