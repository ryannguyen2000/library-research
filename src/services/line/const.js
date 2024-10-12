const CMD_TYPE = {
	SEND_MESSAGE: 'SEND_MESSAGE',
	GET_MESSAGES: 'GET_MESSAGES',
	CHECK_EXISTS: 'CHECK_EXISTS',
	LINE_SENT: 'LINE_SENT',
};

const COLLECTION = {
	USER: 'line_users',
	MESSAGE: 'line_messages',
};

module.exports = {
	CMD_TYPE,
	COLLECTION,
};
