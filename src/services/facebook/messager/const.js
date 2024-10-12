const FRIEND_STATUS = {
	UNKNOWN: -3,
	DECLINE: -2,
	NOT_A_FRIEND: -1,
	FRIEND_REQ_SENT: 0,
	FRIEND: 1,
};

const CMD_TYPE = {
	FB_SENT: 'FB_SENT',
	SEND_MESSAGE: 'SEND_MESSAGE',
	GET_MESSAGES: 'GET_MESSAGES',
	LOGIN: 'LOGIN',
	CHECK_EXISTS: 'CHECK_EXISTS',
};

const COLLECTION = {
	USER: 'facebook_users',
	MESSAGE: 'facebook_messages',
};

const GRAPH_URI = 'https://graph.facebook.com/v19.0';

module.exports = {
	FRIEND_STATUS,
	CMD_TYPE,
	COLLECTION,
	GRAPH_URI,
};
