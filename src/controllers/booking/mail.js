const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const Mails = require('./mails');

const DEFAULT_MAIL_ID = 'default_booking_confirmation_id';

async function getBookingConfirmationHtml({ bookingId, otaName, otaBookingId, mailId, status }) {
	let html = '';
	let title = '';
	let createdAt = new Date();

	if (!_.keys(Mails).includes(otaName)) throw new ThrowReturn(`${otaName} does not support`);
	if (mailId === DEFAULT_MAIL_ID) {
		const mailData = await Mails[otaName].getVirtualData(bookingId);
		html = Mails[otaName].getTemplate(mailData);
		title = `${status.toUpperCase()}} - ${_.upperFirst(otaName)} BookingId ${otaBookingId}`;
	} else {
		const bookingConfirmation = await models.BookingConfirmation.findOne({ otaBookingId }).lean();
		if (!bookingConfirmation) {
			throw new ThrowReturn().status(404);
		}
		const item = _.find(bookingConfirmation.mails, mail => {
			return mail._id.toString() === mailId && mail.deleted === false;
		});
		if (!item) {
			throw new ThrowReturn().status(404);
		}
		title = item.title;
		html = Mails[otaName].getTemplate(item.data);
		createdAt = item.createdAt;
	}

	return { html, title, createdAt };
}

async function getConfirmationBookings({ otaBookingId, otaName, status }) {
	if (!_.keys(Mails).includes(otaName)) throw new ThrowReturn(`${otaName} does not support`);

	const bookingConfirmation = await models.BookingConfirmation.findOne({ otaBookingId }).select('-mails.data').lean();
	const DEFAULT_MAILS = [
		{
			_id: DEFAULT_MAIL_ID,
			title: `${status.toUpperCase()} - ${_.upperFirst(otaName)} BookingId ${otaBookingId}`,
			createdAt: new Date(),
		},
	];

	if (!bookingConfirmation) return DEFAULT_MAILS;

	const mails = _.filter(bookingConfirmation.mails, { deleted: false }).reverse();

	if (mails.length === 0) return DEFAULT_MAILS;
	return mails;
}

async function deleteBookingConfirmation({ otaBookingId, mailId }) {
	try {
		await models.BookingConfirmation.updateOne(
			{ otaBookingId },
			{ $set: { 'mails.$[elem].deleted': true } },
			{ arrayFilters: [{ 'elem._id': mailId }] }
		);
	} catch (err) {
		throw new ThrowReturn().status(404);
	}
}

module.exports = { getConfirmationBookings, getBookingConfirmationHtml, deleteBookingConfirmation };
