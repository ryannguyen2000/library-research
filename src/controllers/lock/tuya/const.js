const DEVICE_lOG_TYPE = {
	ONLINE: 1,
	OFFLINE: 2,
	DEVICE_ACTIVATION: 3,
	DEVICE_RESET: 4,
	INSTRUCTIONS_ISSUE: 5,
	FIRMWARE_UPGRADE: 6,
	DATA_POINT_REPORT: 7,
	DEVICE_SEMAPHORE: 8,
	DEVICE_RESTART: 9,
	TIMING_INFORMATION: 10,
};

const TUYA_SMART_LOCK_PHASE = {
	// Password creation details
	CREATE_ONGOING: 11, // "CREATE", "ONGOING", "Adding - In progress"
	CREATE_SUCCESS: 12, // "CREATE", "SUCCESS", "Adding - Success (Device received and feedback successful)
	CREATE_FAILED: 13, // "CREATE", "FAILED", "Adding - Failed (Could be timeout, could be device feedback failure),

	// Password modification details
	MODIFY_ONGOING: 14, // "MODIFY", "ONGOING", "Modification - In progress"),
	MODIFY_SUCCESS: 15, // "MODIFY", "SUCCESS", "Modification - Success (Device received and feedback successful)"),
	MODIFY_FAILED: 16, // "MODIFY", "FAILED", "Modification - Failed (Could be timeout, could be device feedback failure)"),

	// Password deletion details
	DELETE_ONGOING: 17, // "DELETE", "ONGOING", "Deletion - In progress"),
	DELETE_SUCCESS: 18, // "DELETE", "SUCCESS", "Deletion - Success (Device received and feedback successful)"),
	DELETE_FAILED: 19, // "DELETE", "FAILED", "Deletion - Failed (Could be timeout, could be device feedback failure)");

	ZIGBEE_TO_BE_CREATED: 1,
	ZIGBEE_NORMAL: 2,
	ZIGBEE_FROZEN: 3,
	ZIGBEE_DELETED: 4,
	ZIGBEE_FAILED_TO_BE_CREATED: 5,

	WIFI_DELETED: 0,
	WIFI_TO_BE_SENT: 1,
	WIFI_SENT: 2,
	WIFI_TO_BE_DELETED: 3,

	BLUETOOTH_DELETED: 0,
	BLUETOOTH_TO_BE_ISSUED: 1,
	BLUETOOTH_ISSUED: 2,
	BLUETOOTH_TO_BE_DELETED: 3,
	BLUETOOTH_FAILED_TO_BE_SENT: 7,
};

const VALID_PASSWORD_PHASES = [
	TUYA_SMART_LOCK_PHASE.CREATE_SUCCESS,
	TUYA_SMART_LOCK_PHASE.MODIFY_SUCCESS,
	TUYA_SMART_LOCK_PHASE.WIFI_SENT,
	TUYA_SMART_LOCK_PHASE.WIFI_TO_BE_SENT,
];

module.exports = { DEVICE_lOG_TYPE, TUYA_SMART_LOCK_PHASE, VALID_PASSWORD_PHASES };
