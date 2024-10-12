const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');
const AsyncLock = require('async-lock');

const fetch = require('@utils/fetch');
const { OTAs } = require('@utils/const');
const { getCtripHeader, getTravelokaHeader } = require('@controllers/ota_api/header_helper');
const { changeHotelSession } = require('@controllers/ota_api/headers/traveloka');
const { CTRIP_APPENDIX, CTRIP_REQUEST_TYPE } = require('./const');

const asyncLock = new AsyncLock();

function getnerateEchotoken() {
	return moment().format('YYYYMMDDHHmm');
}

function requestToCtrip({ otaConfig, hotelId, url, options = {} }) {
	return asyncLock.acquire(`${OTAs.Ctrip}_${otaConfig.username}`, async () => {
		const otaInfo = await mongoose.model('OTAManager').findById(otaConfig._id);

		const headers = await getCtripHeader(otaInfo, {
			hotelId,
		});

		return await fetch(url, {
			...options,
			headers: _.assign(options.headers, headers),
		});
	});
}

function requestToTera({ otaConfig, hotelId, url, body, options = {} }) {
	return asyncLock.acquire(`${OTAs.Traveloka}_${otaConfig.username}`, async () => {
		const otaInfo = await mongoose.model('OTAManager').findById(otaConfig._id);

		const context = await changeHotelSession(otaInfo, hotelId);

		const fetchOpts = {
			...options,
			headers: _.assign(getTravelokaHeader(otaInfo), options.headers),
		};

		if (body && options.method && options.method !== 'GET') {
			const newBody = {
				...body,
				context,
				auth: otaInfo.other.auth,
			};
			fetchOpts.body = JSON.stringify(newBody);
		}

		return await fetch(url, fetchOpts);
	});
}

function generateXMLRequest(requestData) {
	let { elementName, id, messagePassword, mainElement, time, codeContext, echoToken } = requestData;
	echoToken = echoToken || getnerateEchotoken();
	const commonPrefix = `<${elementName} TimeStamp="${time}" Version="4.0" EchoToken="${echoToken}" xmlns="http://www.opentravel.org/OTA/2003/05" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`;
	const commonSuffix = `</${elementName}>`;

	const POSelement = `<POS>
				<Source>
					<RequestorID ID="${id}" Type="1" MessagePassword="${messagePassword}">
						<CompanyName Code="C" CodeContext="${codeContext}" />
					</RequestorID>
				</Source>
			</POS>`;

	return `${commonPrefix}
				${POSelement}
				${mainElement}
			${commonSuffix}`;
}

function generateXMLResponse(responseData) {
	let { elementName, success, warnings, errors, hotelReservation, mainElement, echoToken } = responseData;
	echoToken = echoToken || getnerateEchotoken();
	const commonPrefix = `<${elementName} Version="4.0" EchoToken="${echoToken}"
	xmlns="http://www.opentravel.org/OTA/2003/05"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`;
	const commonSuffix = `</${elementName}>`;

	let successTag = success ? '<Success/>' : '';
	let warningsTag = '';
	let errorsTag = '';
	mainElement = mainElement || '';
	if (warnings && warnings.length > 0) {
		warningsTag = '<Warnings>';
		warnings.forEach(warning => {
			warningsTag += `<Warning Type="${warning.type}" Code="${warning.code}" ShortText="${warning.shortText}" />`;
		});
		warningsTag += '</Warnings>';
	}

	if (errors && errors.length > 0) {
		errorsTag = '<Errors>';
		errors.forEach(error => {
			errorsTag += `<Error Type="${error.type}" Code="${error.code}" ShortText="${error.shortText}" />`;
		});
		errorsTag += '</Errors>';
	}

	if (hotelReservation) {
		const { resStatus, uniqueID, resGlobalInfo } = hotelReservation;
		const { hotelReservationIDs } = resGlobalInfo;

		mainElement = `<HotelReservations>
			<HotelReservation ResStatus="${resStatus}">
				${uniqueID ? `<UniqueID Type="${CTRIP_APPENDIX.RESERVATION.UNIQUE_ID.TYPE.RESERVATION}" ID="${uniqueID.id}" />` : ''}
				<ResGlobalInfo>
					<HotelReservationIDs>
						<HotelReservationID ResID_Value="${hotelReservationIDs.resID_Value}" ResID_Type="${hotelReservationIDs.resID_Type}"/>
					</HotelReservationIDs>
				</ResGlobalInfo>
			</HotelReservation>
		</HotelReservations>`;
	}

	return `${commonPrefix}
				${successTag}
				${warningsTag}
				${errorsTag}
				${mainElement}
			${commonSuffix}`;
}

function getPaymentCardInfo(info) {
	if (!info) return;
	return {
		cardHolderName: info.cardholdername,
		cardNumber: info.cardnumber.plaintext,
		cardCode: info.$.CardCode,
		cardType: info.cardtype.$.Code,
		expireDate: info.$.ExpireDate,
	};
}

function getHotelReservationId(hotelReservationId) {
	let resIdValue = '';
	let resIdType = '';
	let resIdMd5Value = '';

	if (_.isArray(hotelReservationId)) {
		const reservationId = _.find(hotelReservationId, resId => {
			const type = resId.$.ResID_Type || resId.$.Type;
			return (
				type === CTRIP_APPENDIX.RESERVATION.UNIQUE_ID.TYPE.COMPANY ||
				type === CTRIP_APPENDIX.RESERVATION.UNIQUE_ID.TYPE.RESERVATION ||
				type !== CTRIP_APPENDIX.RESERVATION.UNIQUE_ID.TYPE.MD5
			);
		});
		const md5Id = _.find(
			hotelReservationId,
			resId => resId.$.ResID_Type === CTRIP_APPENDIX.RESERVATION.UNIQUE_ID.TYPE.MD5
		);
		resIdValue = _.get(reservationId, ['$', 'ResID_Value']) || _.get(reservationId, ['$', 'ID']);
		resIdType = _.get(reservationId, ['$', 'ResID_Type']) || _.get(reservationId, ['$', 'Type']);
		resIdMd5Value = _.get(md5Id, ['$', 'ResID_Value']);
	} else {
		resIdValue = _.get(hotelReservationId, ['$', 'ResID_Value']) || _.get(hotelReservationId, ['$', 'ID']);
		resIdType = _.get(hotelReservationId, ['$', 'ResID_Type']) || _.get(hotelReservationId, ['$', 'Type']);
	}

	return { resIdValue, resIdType, resIdMd5Value };
}

function getXMLResponeError(data, errors = []) {
	const responseData = {
		elementName: '',
		errors,
	};
	const hotelreservation = _.get(data, [
		CTRIP_REQUEST_TYPE.OTA_HOTELRESRQ.key,
		'hotelreservations',
		'hotelreservation',
	]);
	const resglobalInfo = _.get(hotelreservation, ['resglobalinfo']);
	const hotelReservationid =
		_.get(resglobalInfo, ['hotelreservationids', 'hotelreservationid']) ||
		_.get(data, [CTRIP_REQUEST_TYPE.OTA_CANCELRQ.key, 'uniqueid']);

	const { resIdValue, resIdType } = getHotelReservationId(hotelReservationid);
	if (_.get(data, [CTRIP_REQUEST_TYPE.OTA_HOTELRESRQ.key])) {
		responseData.elementName = CTRIP_REQUEST_TYPE.OTA_HOTELRESRQ.responseElement;
		responseData.hotelReservation = {
			resStatus: CTRIP_APPENDIX.RESERVATION.STATUS.REJECTED.code,
			resGlobalInfo: {
				hotelReservationIDs: { resID_Value: resIdValue, resID_Type: resIdType },
			},
		};
		return generateXMLResponse(responseData);
	}
	if (_.get(data, [CTRIP_REQUEST_TYPE.OTA_CANCELRQ.key])) {
		responseData.elementName = CTRIP_REQUEST_TYPE.OTA_CANCELRQ.responseElement;
		responseData.mainElement = `<UniqueID ID="${resIdValue}" Type="${resIdType}" ID_Context="Trip.com" />`;

		return generateXMLResponse(responseData);
	}
	return generateXMLResponse(responseData);
}

module.exports = {
	requestToCtrip,
	requestToTera,
	generateXMLResponse,
	generateXMLRequest,
	getXMLResponeError,
	getPaymentCardInfo,
	getHotelReservationId,
};
