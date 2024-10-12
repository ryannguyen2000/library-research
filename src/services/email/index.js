const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');
const path = require('path');

const { logger } = require('@utils/logger');
const {
	BookingStatus,
	RuleDay,
	EMAIL_TYPE,
	EMAIL_SUB_TYPE,
	OTAs,
	MessageAutoType,
	AutoTemplates,
	BookingGuideStatus,
	BookingGuideDoneStatus,
	MailAccountStatus,
	PolicyTypes,
} = require('@utils/const');
const { Settings } = require('@utils/setting');
const { isEmail } = require('@utils/validate');
const { newCSEventEmitter, NEWCS_EVENTS } = require('@utils/events');
const { GMAIL_CONFIG } = require('@config/setting');
const { createEmailClient } = require('@services/emailApi');
const { generateRawMessage } = require('@services/emailApi/gmail/helper');
const { DEFAULT_USER_ID } = require('@services/emailApi/gmail/const');

const EMAILS = [];

(async function init() {
	try {
		const emailConfigs = await mongoose
			.model('EmailConfig')
			.find({
				type: EMAIL_TYPE.GMAIL,
				subTypes: { $in: [EMAIL_SUB_TYPE.CONFIRMATION, EMAIL_SUB_TYPE.CONFIRMATION_OTA] },
				'info.status': MailAccountStatus.LOG_IN,
			})
			.lean();

		if (!emailConfigs.length) {
			logger.error('System gmail does not config!');
			return;
		}
		emailConfigs.forEach(emailConfig => {
			const config = { emailId: emailConfig._id, ...emailConfig.info, credential: GMAIL_CONFIG.AUTH };
			EMAILS.push({
				subTypes: emailConfig.subTypes,
				config: { ...emailConfig, configs: _.keyBy(emailConfig.configs, 'type') },
				client: createEmailClient(config, EMAIL_TYPE.GMAIL),
			});
		});
	} catch (err) {
		logger.error('Connect outlook', err);
	}
})();

function getEmail(subType, emails = []) {
	return _.find(emails, email => email.subTypes.includes(subType)) || {};
}

function putDataToHtml(html, data) {
	_.entries(data).forEach(([key, value]) => {
		html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
	});
	return html;
}

async function sendEmailConfirmation(bookingId) {
	if (global.isDev) return;

	const { client, config } = getEmail(EMAIL_SUB_TYPE.CONFIRMATION, EMAILS);
	if (!client) throw new Error('System gmail does not config!');
	if (!config) throw new Error(`${bookingId} sendEmailConfirmation config not found!`);

	const Booking = mongoose.model('Booking');

	const booking = await Booking.findOne({ _id: bookingId, status: BookingStatus.CONFIRMED })
		.populate('blockId', 'info manageFee.hasVAT')
		.populate('guestId');

	if (!booking || !booking.blockId || !booking.guestId) {
		throw new Error('Booking not found!');
	}

	const emailTo = booking.guestId.email;
	if (!isEmail(emailTo)) {
		throw new Error('Email invalid!');
	}

	const payment = await Booking.getPayment(booking);
	const reservation = await mongoose.model('Reservation').find({ bookingId }).populate('roomId', 'info.name');
	const rooms = _.groupBy(reservation, 'roomId.info.name');
	const room_type = _.entries(rooms)
		.map(([rt, obj]) => `${obj.length} ${rt}`)
		.join(', ');

	const guest_name = booking.guestId.fullName || booking.guestId.name;
	const home_name = booking.blockId.info.name;
	const home_address = booking.blockId.info.address;

	const [ciFrom, ciTo] = RuleDay.from.split(':');
	const [coFrom, coTo] = RuleDay.to.split(':');

	const checkin = moment(booking.from).hour(+ciFrom).minute(+ciTo).second(0);

	const checkout = moment(booking.to).hour(+coFrom).minute(+coTo).second(0);

	let VAT = '';

	if (_.get(booking.blockId, 'manageFee.hasVAT')) {
		const VATPercent = await mongoose.model('Setting').getVATPercent();
		VAT = `(đã bao gồm VAT ${VATPercent * 100}%)`;
	}

	const cancellationPolicy = _.find(_.get(booking.ratePlan, 'policies'), p => p.type === PolicyTypes.Cancellation);

	const data = {
		home_name,
		guest_name,
		home_address,
		booking_id: booking.otaBookingId,
		guest_phone: booking.guestId.phone,
		checkin: checkin.format('DD/MM/Y'),
		checkout: checkout.format('DD/MM/Y'),
		night: moment(booking.to).diff(booking.from, 'day'),
		room_type,
		total_price: `${Number(booking.price).toLocaleString()} ${booking.currency}`,
		payment_status: payment.amount ? 'Chưa thanh toán' : 'Đã thanh toán',
		VAT,
		cancellation_policy:
			_.get(cancellationPolicy, 'displayName') ||
			`- Khách hàng được miễn phí hủy đặt phòng 01 ngày trước ngày nhận phòng thực tế. Trường hợp
			khách hàng không đến nhận phòng, phí phạt sẽ là tiền phòng đêm đầu tiên. Khách hủy đặt phòng
			phù hợp với chính sách, phí phòng đã thanh toán sẽ được hoàn trả trong vòng 02 - 05 ngày làm
			việc.`,
		script: JSON.stringify({
			'@context': 'http://schema.org',
			'@type': 'LodgingReservation',
			reservationNumber: booking.otaBookingId,
			reservationStatus: 'http://schema.org/Confirmed',
			underName: {
				'@type': 'Person',
				name: guest_name,
			},
			reservationFor: {
				'@type': 'LodgingBusiness',
				name: home_name,
				address: {
					'@type': 'PostalAddress',
					streetAddress: home_address,
					addressLocality: booking.blockId.info.city,
					addressRegion: booking.blockId.info.city,
					postalCode: '700000',
					addressCountry: Settings.NationalCode.value,
				},
				telephone: Settings.Hotline.value,
			},
			checkinDate: checkin.toISOString(),
			checkoutDate: checkout.toISOString(),
		}),
	};

	const html = putDataToHtml(
		await fs.promises.readFile(path.resolve(`${__dirname}/template_vi.html`), 'utf-8'),
		data
	);

	const mailOptions = {
		from: config.email,
		to: emailTo,
		subject: `Thông báo đặt phòng thành công. Mã đặt phòng ${data.booking_id}`,
		html,
		attachments: [
			{
				filename: 'logo.png',
				path: 'https://tb.com/static/images/tb/tb10.png',
				cid: 'logo', // same cid value as in the html img src
			},
		],
	};

	const options = _.get(config, ['configs', EMAIL_SUB_TYPE.CONFIRMATION, 'options'], {});

	if (options && options.bcc) {
		mailOptions.bcc = options.bcc;
	}

	// Send Gmail
	const rawMessage = await generateRawMessage(mailOptions);
	const body = {
		userId: DEFAULT_USER_ID,
		resource: { raw: rawMessage },
	};

	client
		.call('gmail.users.messages', 'send', body)
		.then(() => {
			Booking.updateOne({ _id: booking._id }, { $push: { sendEmailConfirmation: new Date() } }).catch(e =>
				logger.error(e)
			);
		})
		.catch(err => logger.error(err));

	return mailOptions;
}

async function getContentForUnpaid(booking) {
	const block = await mongoose
		.model('Block')
		.findById(booking.blockId)
		.select('groupIds isSelfCheckin info.name info.address info.address_en');

	const ott = await mongoose
		.model('Ott')
		.findOne({ hotline: true, groupIds: { $in: block.groupIds }, blockId: { $in: [block._id, null] } })
		.sort({ blockId: -1 });

	const hotline = ott.display || ott.phone;
	const timeEnd = `11.30`;

	const arrText = block.isSelfCheckin
		? [
			`tb will be sent 1 day prior to the check-in date. Please check your message (Zalo, Whatsapp or Imess) to get the check-in instruction. Kindly reach our Hotline at ${hotline} for check-in instruction at tb Homes before ${timeEnd}PM on check in date. Thank you\n`,
			`Do căn hộ áp dụng quy trình tự nhận phòng nên Quý Khách vui lòng liên hệ Hotline: ${hotline} để được hướng dẫn chi tiết trước ${timeEnd} tối của ngày nhận phòng. Xin cảm ơn!`,
		]
		: [
			`Kindly contact 24/7 Receptionist of ${block.info.name} via hotline number: ${hotline} for supporting.`,
			`Add: ${block.info.address_en || block.info.address}.`,
			`Để được hỗ trợ, Quý Khách vui lòng liên hệ lễ tân 24/7 của ${block.info.name} qua hotline: ${hotline}.`,
		];

	return arrText.join('\n');
}

async function getContentForPaid(booking) {
	const ChatAutomatic = mongoose.model('ChatAutomatic');
	const templates = await ChatAutomatic.find({
		active: true,
		autoType: MessageAutoType.GUEST,
		template: AutoTemplates.Guide,
		groupIds: booking.groupIds[0],
	});

	const guest = await mongoose.model('Guest').findById(booking.guestId);

	const [activeTemplate] = ChatAutomatic.validateSync({
		templates,
		blockId: booking.blockId,
		booking,
		otaName: booking.otaName,
		guest,
	});
	if (!activeTemplate) return;

	const texts = await activeTemplate.contents.asyncMap(async content => {
		if (content.action === 'message') {
			const contents = [content];

			const [msgs] = await ChatAutomatic.replaceContent({ contents, booking, guest });

			return msgs[1] || msgs[0];
		}
	});

	return _.compact(texts).join('\n\n');
}

async function sendEmailConfirmationOTA(booking) {
	if (booking.sendEmailConfirmationOTA || booking.otaName !== OTAs.Traveloka) return;
	const { client, config } = getEmail(EMAIL_SUB_TYPE.CONFIRMATION_OTA, EMAILS);
	if (!client) throw new Error('System gmail does not config!');
	if (!config) throw new Error(`${booking.otaBookingId} sendEmailConfirmationOTA config not found!`);

	const isPaid = booking.isRatePaid();
	const textEmail = isPaid ? await getContentForPaid(booking) : await getContentForUnpaid(booking);
	if (!textEmail) {
		throw new Error(`${booking.otaBookingId} sendEmailConfirmationOTA text not found!`);
	}

	const options = _.get(config, ['configs', EMAIL_SUB_TYPE.CONFIRMATION_OTA, 'options'], {});

	const mailOptions = {
		from: config.email,
		to: options.to,
		subject: `tb Checkin Guide for Reservation ID ${booking.otaBookingId}`,
		text: textEmail,
	};

	if (options && options.bcc) {
		mailOptions.bcc = options.bcc;
	}

	const rawMessage = await generateRawMessage(mailOptions);
	const body = {
		userId: DEFAULT_USER_ID,
		resource: { raw: rawMessage },
	};

	client
		.call('gmail.users.messages', 'send', body)
		.then(() => {
			const update = {
				$set: { sendEmailConfirmationOTA: new Date() },
			};

			if (isPaid) {
				newCSEventEmitter.emit(NEWCS_EVENTS.UPDATE_STATUS, booking, {
					guideStatus: BookingGuideStatus.Done,
					guideDoneStatus: BookingGuideDoneStatus.Sent,
					display: true,
				});
				update.$push = {
					histories: {
						description: 'Đã gửi email/đã liên hệ kênh đặt phòng',
						createdAt: new Date(),
						system: false,
					},
				};
			}

			mongoose
				.model('Booking')
				.updateOne({ _id: booking._id }, update)
				.catch(e => logger.error(e));
		})
		.catch(err => logger.error('sendEmailConfirmationOTA', err));
}

module.exports = {
	sendEmailConfirmation,
	sendEmailConfirmationOTA,
};
