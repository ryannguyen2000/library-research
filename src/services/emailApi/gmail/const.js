const HEADERS = {
	FROM: 'from',
	TO: 'to',
	CC: 'cc',
	BCC: 'bcc',
	SUBJECT: 'subject',
	MESSAGE_ID: 'message-id',
	CONTENT_TRANSFER_ENCODING: 'content-transfer-encoding',
	DATE: 'date',
	CONTENT_DISPOSITION: 'content-disposition',
	CONTENT_ID: 'content-id',
};

const LABELS = {
	DRAFT: 'DRAFT',
	UNREAD: 'UNREAD',
	TRASH: 'TRASH',
};

const DEFAULT_LABEL_NAME = {
	CHAT: {
		vi: 'Trò chuyện',
		en: 'Chat',
	},
	SENT: {
		vi: 'Đã gửi',
		en: 'Sent',
	},
	INBOX: {
		vi: 'Hộp thư đến',
		en: 'Inbox',
	},
	IMPORTANT: {
		vi: 'Quan trọng',
		en: 'Important',
	},
	TRASH: {
		vi: 'Thư rác',
		en: 'Trash',
	},
	DRAFT: {
		vi: 'Thư nháp',
		en: 'Draft',
	},
	SPAM: {
		vi: 'Thư rác',
		en: 'Spam',
	},
	CATEGORY_FORUMS: {
		vi: 'Diễn đàn',
		en: 'FORUMS',
	},
	CATEGORY_UPDATES: {
		vi: 'Nội dung cập nhật',
		en: 'Updates',
	},
	CATEGORY_PERSONAL: {
		vi: 'Cá nhân',
		en: 'Personal',
	},
	CATEGORY_PROMOTIONS: {
		vi: 'Quảng cáo',
		en: 'Promotions',
	},
	CATEGORY_SOCIAL: {
		vi: 'Mạng xã hội',
		en: 'Social',
	},
	STARRED: {
		vi: 'Đã gắn sao',
		en: 'Starred',
	},
	UNREAD: {
		vi: 'Chưa đọc',
		en: 'Unread',
	},
};

const DEFAULT_USER_ID = 'me';

const DRAFT_TYPE = {
	REPLY: 'REPLY',
	FORWARD: 'FORWARD',
};

module.exports = { HEADERS, LABELS, DEFAULT_USER_ID, DRAFT_TYPE, DEFAULT_LABEL_NAME };
