const router = require('@core/router').OTAHeader();
const { getHeaderCommand, getPinCode, responseHeader } = require('@controllers/ota_header');

async function getOTP(req, res) {
	const { account, otaName, email } = req.query;
	const time = new Date(req.query.time || new Date());

	const data = await getPinCode({ account, otaName, email, time });

	res.sendData(data);
}

router.getS('/', getHeaderCommand);
router.getS('/pinCode', getOTP);
router.postS('/', responseHeader);

module.exports = { router };
