const _ = require('lodash');

const reservation = require('@controllers/client/reservation');
const router = require('@core/router').Publish();
const { USER_SYS_NAME } = require('@utils/const');
const Guide = require('@controllers/booking/guide');

const { convertToStatic } = require('./utils');

async function inquiry(req, res) {
	const body = {
		...req.body,
		name: req.body.name || req.body.lastName,
		fullName: req.body.fullName || `${req.body.firstName} ${req.body.lastName}`,
		listingId: req.body.listingId || req.body.slug,
	};

	const { booking, ...data } = await reservation.inquiry(body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(booking, 'blockId'));

	res.sendData(data);
}

async function inquiryDetail(req, res) {
	const data = await reservation.inquiryDetail(req.params.id, req.language);

	const rs = {
		...data,
		businessService: data.serviceType,
		propertyId: {
			_id: data.blockId._id,
			address: {
				vi: data.blockId.info.address,
				en: data.blockId.info.address_en,
			},
			name: data.blockId.info.name,
		},
		roomTypeId: {
			id: _.get(data, 'listingId._id'),
			name: _.get(data, 'listingId.name'),
			images: _.map(_.get(data, 'listingId.info.images'), img => ({
				source: convertToStatic(img),
			})),
		},
		onlinePayment: true,
		listingId: undefined,
		blockId: undefined,
	};

	res.sendData(rs);
}

async function checkPassport(req, res) {
	const { guest, ...data } = await reservation.checkPassport(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(guest, ['blockIds', 0]));

	res.sendData(data);
}

async function giveCheckinData(req, res) {
	const data = await reservation.sendCheckinData(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(data, ['blockIds', 0]));

	res.sendData(data);
}

async function getGuide(req, res) {
	const data = await Guide.getPublicGuide(req.params.id, req.query.roomId);

	const { guest, roomType, room, blockInfo, blockId, accommodates, ...result } = data;

	const guide = {
		...result,
		guest: {
			...guest.toJSON(),
			passport: _.map(guest.passport, p => convertToStatic(p)),
		},
		property: {
			_id: blockId,
			address: {
				vi: blockInfo.address,
				en: blockInfo.address_en,
			},
			name: blockInfo.name,
			mapStatic: blockInfo.mapStatic,
			location: blockInfo.location,
			slug: blockInfo.url,
			blog: blockInfo.blog,
			rule: {
				from: _.get(blockInfo.rules, 'day.checkin') || '14:00',
				to: _.get(data.rules, 'day.checkout') || '12:00',
			},
		},
		roomType: {
			name: _.get(room, 'name'),
			type: {
				id: 1,
				name: {
					vi: roomType,
				},
			},
			occupancy: {
				standardGuest: accommodates,
			},
		},
		room: {
			roomNo: _.get(room, 'roomNo'),
			wifi: _.get(room, 'wifi'),
			wifiPassword: _.get(room, 'wifiPassword'),
		},
	};

	res.sendData(guide);
}

router.postS('/inquiry', inquiry);
router.getS('/inquiry/:id', inquiryDetail);
router.getS('/guide/:id', getGuide);

router.postS('/passport/validation', checkPassport);
router.postS('/checkinData', giveCheckinData);

const activity = {
	CLIENT_GUEST_INQUIRY: {
		key: '/inquiry',
	},
	CLIENT_GUEST_CHECK_PP: {
		key: '/passport/validation',
	},
	CLIENT_GUEST_SEND_CHECKIN_INFO: {
		key: '/checkinData',
	},
};

module.exports = { router, activity };
