const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { OTAs, AcceleratorDayType } = require('@utils/const');

const ALL_COUNTRIES =
	'TH,MY,SG,ID,VN,PH,KH,GU,LA,MM,JP,KR,TW,CN,HK,RU,MO,IN,BD,MV,NP,PK,LK,AU,NZ,IL,SA,AE,BH,KW,OM,QA,TR,FR,DE,NL,ES,GB,AT,BE,CY,CZ,DK,GR,HU,IE,IT,LT,NO,PL,PT,RO,SK,SE,CH,UA,MA,ZA,US,AR,BR,CA,CL,MX';

function getCountries(countries) {
	if (!countries.length) return null;

	return countries.filter(c => ALL_COUNTRIES.includes(c)).join(',') || null;
}

async function request(uri, body, otaConfig) {
	// console.log(OTAs.Agoda, body);
	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaConfig
	);

	const json = await res.json();

	if (!json.isSuccess) {
		throw new Error(json);
	}

	return json;
}

function getEligibleDays({ eligibleDay }) {
	if (!eligibleDay) return null;

	const eligibleDaysMappers = {
		[AcceleratorDayType.Allday]: null,
		[AcceleratorDayType.Weekday]: 79,
		[AcceleratorDayType.Weekend]: 48,
	};

	return eligibleDaysMappers[eligibleDay];
}

async function create(otaConfig, hotelId, accelerator, comm) {
	const uri = `https://ycs.agoda.com/en-us/${hotelId}/kipp/api/rankingApi/RankingExternalApiForwarder?`;

	const data = {
		requestType: 'insertCampaign',
		hotelId,
		languageId: -1,
		startDate: accelerator.from,
		endDate: accelerator.to,
		leadTime: null,
		marginAdjustment: comm,
		originList: getCountries(accelerator.countries), // 'VN,ID'
		paymentType: 0,
		stackability: accelerator.stackability || false,
		isFallbackNetrate: false,
		doubleupBinding: null,
		isSuperCampa8ign: false,
		isAutoRenew: false,
		eligibleDays: getEligibleDays(accelerator), // 79 weekday, 48 weekend
		voucherId: null,
		isFreeTrial: false,
	};

	const res = await request(uri, data, otaConfig);

	return {
		campaignId: res && res.campaignId,
	};
}

async function update(otaConfig, hotelId, campaignId, accelerator, comm) {
	const uri = `https://ycs.agoda.com/en-us/${hotelId}/kipp/api/rankingApi/RankingExternalApiForwarder?`;
	const data = {
		requestType: 'updateCampaign',
		hotelId,
		campaignId,
		startDate: accelerator.from,
		endDate: accelerator.to,
		marginAdjustment: comm,
	};

	await request(uri, data, otaConfig);

	return {
		campaignId,
	};
}

async function del(otaConfig, hotelId, campaignId) {
	const uri = `https://ycs.agoda.com/en-us/${hotelId}/kipp/api/rankingApi/RankingExternalApiForwarder?`;
	const data = {
		requestType: 'deleteCampaign',
		hotelId,
		campaignId,
	};

	await request(uri, data, otaConfig);
}

async function syncAccelerator({ otaConfig, property, accelerator, relComm, currentComm }) {
	const dataOTA = _.find(accelerator.dataOTAs, o => o.ota === OTAs.Agoda);
	const campaignId = _.get(dataOTA, 'meta.campaignId');
	const comm = relComm - currentComm + accelerator.commission;

	if (accelerator.deleted || comm <= 0) {
		if (!campaignId) {
			// return Promise.reject(`Not found meta data accelerator ${accelerator._id}`);
			return;
		}

		return del(otaConfig, property.propertyId, campaignId);
	}

	const today = new Date().toDateMysqlFormat();
	if (accelerator.to < today) return;

	accelerator.from = _.max([accelerator.from, today]);

	if (!campaignId) {
		return create(otaConfig, property.propertyId, accelerator, accelerator.commission);
	}

	return update(otaConfig, property.propertyId, campaignId, accelerator, accelerator.commission);
}

module.exports = {
	syncAccelerator,
};
