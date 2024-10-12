const events = require('events');

events.setMaxListeners(20);

const eventEmitter = new events.EventEmitter();
const ottEventEmitter = new events.EventEmitter();
const sysEventEmitter = new events.EventEmitter();
const newCSEventEmitter = new events.EventEmitter();
const serviceEventEmitter = new events.EventEmitter();

const EVENTS = {
	BOOKING_BSTATUS_UPDATED: 'booking_bstatus_updated',

	RESERVATION: 'reservation',
	RESERVATION_UPDATE: 'reservation_update',
	RESERVATION_ERROR: 'reservation_error',
	RESERVATION_CANCEL: 'reservation_cancel',
	RESERVATION_UPDATE_PRICE: 'reservation_update_price',
	RESERVATION_NOSHOW: 'reservation_noshow',
	RESERVATION_CHARGED: 'reservation_charged',
	RESERVATION_CHECKIN: 'reservation_checkin',
	RESERVATION_CHECKIN_UNDO: 'reservation_checkin_undo',
	RESERVATION_CHECKOUT: 'reservation_checkout',
	RESERVATION_SPLIT: 'reservation_split',
	UPDATE_PAYMENT_STATUS: 'update_payment_status',
	UPDATE_CASH_FLOW: 'update_cash_flow',

	BOOKING_CHARGED: 'booking_charged',
	BOOKING_CHARGED_STATUS_UPDATE: 'booking_charged_status_update',
	BOOKING_AUTO_CANCEL: 'booking_auto_cancel',

	SEND_BOOKING_CONFIRMATION: 'send_booking_confirmation',

	CHECK_CHECKIN: 'check_checkin',
	INQUIRY: 'inquiry',
	UPDATE_AUTOMATION: 'update_automation',

	CREATE_PAYOUT: 'create_payout',
	UPDATE_PAYOUT: 'update_payout',
	RECEIVED_PAYOUT_CONFIRMATION: 'received_payout_confirmation',

	CAMERA_RECOGNITION: 'camera_recognition',

	TASK_CREATE: 'task_create',
	TASK_UPDATE_STATUS: 'task_update_status',
	TASK_UPDATE_DEPARTMENT: 'task_update_department',
	TASK_UPDATE_ASSIGNED: 'task_update_assigned',
	TASK_UPDATE_POINT: 'task_update_point',
	TASK_CREATE_AUTO: 'task_create_auto',

	BANKING_SMS: 'banking_sms',
	MESSAGE_SEND: 'message_send',
	MESSAGE_RECEIVE: 'message_receive',
	MESSAGE_THREAD_UPDATE: 'message_thread_update',
	MESSAGE_ADD: 'message_add',
	MESSAGE_TYPING: 'message_typing',

	SEND_LOCKER_COMMAND: 'send_locker_command',
	SEND_LOCKER_CALLBACK: 'send_locker_callback',

	ASSET_ISSUE_STATUS_UPDATED: 'asset_issue_status_updated',

	HOST_NOTIFICATION: 'host_notification',
};

const SYS_EVENTS = {
	WORKER_SENT_MESSAGE: 'WORKER_SENT_MESSAGE',
	LISTING_UPDATE: 'LISTING_UPDATE',
	REVENUE_STREAM_UPDATE: 'REVENUE_STREAM_UPDATE',
	INCOME_STATEMENT_UPDATE: 'INCOME_STATEMENT_UPDATE',
	HOST_REPORT_APPROVED: 'HOST_REPORT_APPROVED',
	HOST_REPORT_MODIFIED: 'HOST_REPORT_MODIFIED',
};

const OTT_EVENTS = {
	MESSAGE_RECEIVED_FB: 'MESSAGE_RECEIVED_FB',
	MESSAGE_RECEIVED_LINE: 'MESSAGE_RECEIVED_LINE',
	MESSAGE_RECEIVED_TELE: 'MESSAGE_RECEIVED_TELE',
	MESSAGE_RECEIVED_ZALO_OA: 'MESSAGE_RECEIVED_ZALO_OA',
	MESSAGE_RECEIVED_ZALO: 'MESSAGE_RECEIVED_ZALO',
	MESSAGE_REQUEST_ZALO: 'MESSAGE_REQUEST_ZALO',
};

const NEWCS_EVENTS = {
	UPDATE_STATUS: 'update_status',
	NEW_CALL: 'new_call',
	NEW_MSG: 'new_msg',
};

const SERVICES_EVENTS = {
	REQUEST: 'REQUEST',
	RESPONSE: 'RESPONSE',
};

const SERVICES_EVENT_TYPES = {
	BOOKING_GET_HEADERS: 'booking_get_headers',
	BOOKING_GET_CARD: 'booking_get_card',
	SEND_HTTP_REQUEST: 'send_http_request',
	REQUEST_OTP: 'request_otp',
	EXTENSION_GET_BOOKING_CARD: 'EXTENSION_GET_BOOKING_CARD',
};

module.exports = {
	EVENTS,
	eventEmitter,
	SYS_EVENTS,
	sysEventEmitter,
	OTT_EVENTS,
	ottEventEmitter,
	NEWCS_EVENTS,
	newCSEventEmitter,
	serviceEventEmitter,
	SERVICES_EVENTS,
	SERVICES_EVENT_TYPES,
};
