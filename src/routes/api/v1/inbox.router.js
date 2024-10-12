const _ = require('lodash');

const router = require('@core/router').Router();
// const { TaskStatus } = require('@utils/const');
const models = require('@models');
const Inbox = require('@controllers/inbox');

async function getInbox(req, res) {
	let { showData, read, request, isGroup, isUser, status, reply, ...query } = req.query;

	if (status === 'inquiry') {
		query.inquiry = true;
		status = null;
	}
	if (status === 'unread') {
		query.read = false;
		status = null;
	}
	if (read) {
		query.read = read === 'true';
	}
	if (request) {
		query.inquiry = request === 'true';
	}
	if (reply) {
		query.reply = reply === 'true';
	}
	if (isGroup) {
		query.isGroup = isGroup === 'true';
		delete query.userType;
	}
	if (isUser) {
		query.isUser = isUser === 'true';
		delete query.userType;
	}
	const results = await Inbox.getInbox(req.decoded.user, {
		showData: showData ? showData === 'true' : true,
		status,
		...query,
	});

	res.sendData({ inbox: results });
}

async function getUnread(req, res) {
	const unread = await Inbox.unread(req.decoded.user, req.query);

	res.sendData({ unread });
}

async function readInbox(req, res) {
	const { inbox } = req.data;
	const { user } = req.decoded;

	const data = await Inbox.changeInboxStatus(inbox, user, true);

	res.sendData(data);
}

async function unReadInbox(req, res) {
	const { inbox } = req.data;
	const { user } = req.decoded;

	const data = await Inbox.changeInboxStatus(inbox, user, false);

	res.sendData(data);
}

router.getS('/', getInbox, true);
router.getS('/unread', getUnread, true);
router.postS('/read/:messageId', readInbox, true);
router.postS('/unread/:messageId', unReadInbox, true);

const activity = {
	INBOX_READ: {
		key: '/read/{id}',
		raw: async req => {
			const { message, inbox } = req.data;

			const guest = await models.Guest.findById(inbox.guestId || message.guestId);
			const phone = guest && (inbox.ottSource ? _.get(guest.ottIds, inbox.ottSource) : guest.phone);
			const otaName = inbox.ottSource || message.otaName;
			const otaDoc = await models.BookingSource.findOne({ name: otaName });

			return {
				rawText: _.compact([
					`Đọc tin nhắn ${otaDoc ? otaDoc.label : otaName}.`,
					phone && `Số ${phone}.`,
					message && message.otaBookingId && `Mã đặt phòng ${message.otaBookingId}.`,
				]).join(' '),
			};
		},
	},
	INBOX_UNREAD: {
		key: '/unread/{id}',
	},
};

module.exports = { router, activity };
