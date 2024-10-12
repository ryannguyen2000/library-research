const mongoose = require('mongoose');

const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const { getCtripHeader } = require('@controllers/ota_api/header_helper');

async function approve(otaInfo, message) {
	const { threadId, otaBookingId } = message;

	const booking = await mongoose
		.model('Booking')
		.findOne({ otaName: OTAs.Ctrip, otaBookingId })
		.select('blockId other')
		.populate('blockId', 'OTAProperties');

	if (!booking) {
		throw new ThrowReturn(`Not found Ctrip booking ID: ${otaBookingId}`);
	}

	const property = booking.blockId.OTAProperties.find(o => o.otaName === OTAs.Ctrip && o.account === otaInfo.account);
	const uri = `https://ebooking.trip.com/ebkorderv2/api/order/ConfirmOrder`;
	const data = JSON.stringify({
		formId: Number(threadId),
		bookingNo: '',
		confirmName: '',
		dateArray: [],
		rightsinfo: [],
		closeRoom: false,
		token: booking.other.token,
	});

	const response = await fetch(uri, {
		method: 'POST',
		headers: await getCtripHeader(otaInfo, {
			hotelId: property.propertyId,
			'content-type': 'application/json; charset=UTF-8',
		}),
		body: data,
	});

	if (!response.ok) {
		logger.error('Ctrip approve error', data, await response.text());
		throw new ThrowReturn('Ctrip approve error!');
	}
}

module.exports = {
	approve,
};
