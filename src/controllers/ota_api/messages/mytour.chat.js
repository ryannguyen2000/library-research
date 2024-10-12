const fetchRetry = require('@utils/fetchRetry');
const ThrowReturn = require('@core/throwreturn');
const { getMytourHeader } = require('@controllers/ota_api/header_helper');

async function approve(otaInfo, message, propertyId) {
	const headers = getMytourHeader(otaInfo, {
		referer: `https://hms.mytour.vn/hotel/${propertyId}/booking`,
	});

	return fetchRetry(
		'https://hms.mytour.vn/v2/booking/confirm-booking',
		{
			method: 'POST',
			headers,
			body: JSON.stringify({ hotel: propertyId, id: message.threadId, code: message.inquiryPostId }),
			redirect: 'manual',
		},
		otaInfo
	)
		.then(res => res.json())
		.then(res => {
			if (res.status !== 200) throw new ThrowReturn('Mytour approve error', res);
		});
}

async function decline(otaInfo, threadId, inquiryPostId) {
	throw new ThrowReturn('Not support!');
}

module.exports = {
	approve,
	decline,
};
