// const { UPLOAD_CONFIG } = require('@config/setting');
// const { saveImages } = require('@utils/file');
// const { MjpegProxy } = require('@utils/mjpeg');

const { logger } = require('@utils/logger');
const router = require('@core/router').HookRouter();
// const ThrowReturn = require('@core/throwreturn');
// const CameraRecognition = require('@models/camera_recognition.model');
// const CameraModal = require('@models/camera.model');

// async function handleDataCamera(req, res) {
// 	const { image64, ...data } = req.body;
// 	if (image64) {
// 		data.image = await saveImages(image64, UPLOAD_CONFIG.FOLDER.CAMERA_RECOGNITION);
// 	}

// 	await CameraRecognition.create(data);

// 	res.sendData();
// }

// function getUrlAuth({ url, username, password }) {
// 	const aIndex = url.indexOf('//');

// 	return `${url.slice(0, aIndex)}//${username}:${password || ''}@${url.substr(aIndex + 2)}/Streams/1/4/ReceiveData`;
// }

// const MProxy = {};

// async function viewCamera(req, res) {
// 	const { id } = req.params;

// 	const data = await CameraModal.findById(id);
// 	if (!data) throw new ThrowReturn('Camera not found!');

// 	const url = getUrlAuth(data);

// 	if (!MProxy[url]) MProxy[url] = new MjpegProxy(url).proxyRequest;
// 	MProxy[url](req, res);
// }

async function onReceivedMotionDetection(req, res) {
	//
	logger.info('received camera hook', req.body);

	res.sendStatus(200);
}

// router.getS('/:id', viewCamera);
// router.postS('/', handleDataCamera);
router.postS('/detection/motion', onReceivedMotionDetection);

module.exports = { router };
