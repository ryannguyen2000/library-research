const ENVIRONMENT = {
	NAME: 'develop',
	REQUIRE_TOKEN: true,
};

const ONE_SIGNAL = {
	APP_ID: '',
	API_KEY: '',
};

const HOOK_CONFIG = {
	SECRET_KEY: '',
};

const JWT_CONFIG = {
	SECRET_KEY: '', // use for jwt, and hash keys
	EXPIRE: '150d',
};

const SERVER_CONFIG = {
	PORT: 8070,
	WS_PORT: 8079,
	STATIC: {
		URI: '/static',
		PATH: `${__dirname}/../publish`,
		OPTIONS: {
			maxAge: '365d',
		},
	},
};

const OTT_CONFIG = {
	STATIC_PATH: '/static/doc/ott',
	STATIC_RPATH: `publish/doc/ott`,
	DATE_NEW_DIR: new Date('2024-01-24T05:00:00.809Z'),
};

const INVOICE_CONFIG = {
	STATIC_PATH: '/static/invoices',
};

const DB_CONFIG = {
	MAIN: 'mongodb://127.0.0.1:27017/nhacity',
	OTT: 'mongodb://127.0.0.1:27017/ott_chat',
	OPTIONS: {
		useNewUrlParser: true,
		useFindAndModify: false,
		useUnifiedTopology: true,
		useCreateIndex: true,
	},
};

const URL_CONFIG = {
	SERVER: `http://127.0.0.1:${SERVER_CONFIG.PORT}`,
	SERVER_DOC: `http://127.0.0.1:${SERVER_CONFIG.PORT}`,
	HOME: '',
	LETTER: '',
	FAMIROOM: 'http://127.0.0.1:8080',
	BLOG: '',
	CMS: 'http://127.0.0.1:3000',
};

const UPLOAD_CONFIG = {
	PATH: `${__dirname}/../publish/upload`,
	URI: '/static/upload',
	FULL_URI: `${URL_CONFIG.SERVER}/static/upload`,
	FULL_URI_DOC: `${URL_CONFIG.SERVER}/static/upload`,
	OPTIONS: {
		useTempFiles: true,
		abortOnLimit: true,
		createParentPath: true,
		tempFileDir: 'tmp',
		limits: { fileSize: 200 * 1024 * 1024 },
		debug: true,
	},
	FOLDER: {
		GUEST: 'guests',
		ROOM: 'rooms',
		CAMERA_RECOGNITION: 'camera_recognitions',
	},
};

const CSV_CONFIG = {
	API_KEY: '',
	API_SECRET: '',
	API_URL: '',
};

const FB_CONFIG = {
	WEBHOOK: {
		VALIDATION_TOKEN: '',
		APP_SECRET: '',
		RESOURCES_FOLDER: 'facebook_attachments',
		RESOURCES_PATH: `${__dirname}/../publish`,
	},
};

const CRYPT_CONFIG = {
	KEY: '',
	VECTOR: '',
	ENCODING: 'base64',
	ALGORITHM: 'aes-256-cbc',
};

const CAMERA_CONFIG = {
	LOG_URL: '/static/camera/hikvision/log/index.html',
	LIVE_URL: '/static/camera/hikvision/preview/index.html',
};

const MSAL_CONFIG = {
	AUTH: {
		clientId: '',
		authority: 'https://login.microsoftonline.com/common/',
		clientSecret: '',
	},
	CONFIG: {
		OAUTH_SCOPES: 'user.read,mail.read,mail.readWrite,mail.send',
		REDIRECT_URI: `${URL_CONFIG.SERVER}/api/v1/ott/email/signInCallBack`,
	},
};

const GMAIL_CONFIG = {
	AUTH: {
		clientId: '',
		clientSecret: '',
		redirectURL: `${URL_CONFIG.SERVER}/api/v1/ott/email/gmailSignInCallBack`,
	},
	CONFIG: {
		OAUTH_SCOPES: [
			'https://mail.google.com/',
			'https://www.googleapis.com/auth/contacts.readonly',
			'https://www.googleapis.com/auth/contacts.other.readonly',
		],
		REDIRECT_URI: `${URL_CONFIG.SERVER}/api/v1/ott/email/gmailSignInCallBack`,
	},
};

const VIETQR_CONFIG = {
	clientId: '',
	apiKey: '',
};

const TICKET_OTA_CONFIG = {
	username: '',
	password: '',
};

const TUYA_BASE_URL = '';

const FACEBOOK_URL = 'https://graph.facebook.com/v20.0';

module.exports = {
	ENVIRONMENT,
	ONE_SIGNAL,
	HOOK_CONFIG,
	JWT_CONFIG,
	SERVER_CONFIG,
	OTT_CONFIG,
	DB_CONFIG,
	URL_CONFIG,
	UPLOAD_CONFIG,
	CSV_CONFIG,
	FB_CONFIG,
	INVOICE_CONFIG,
	CRYPT_CONFIG,
	CAMERA_CONFIG,
	MSAL_CONFIG,
	VIETQR_CONFIG,
	TICKET_OTA_CONFIG,
	GMAIL_CONFIG,
	TUYA_BASE_URL,
	FACEBOOK_URL,
};
