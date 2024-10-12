const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { groupDates } = require('@utils/date');
const headerHelper = require('@controllers/ota_api/header_helper');

async function request({ uri, hotelId, method = 'POST', data, otaConfig }) {
	const headers = await headerHelper.getCtripHeader(otaConfig, {
		hotelId,
	});

	const options = {
		method,
		headers,
	};

	if (data) {
		options.body = JSON.stringify(data);
	}

	const res = await fetchRetry(uri, options, otaConfig);
	const json = await res.json();

	if (json.code !== 0) {
		return Promise.reject(`ctrip request fail with error code ${res.code} ${JSON.stringify(json)}`);
	}

	return json.data;
}

// function getAccelerators(otaConfig, hotelId) {
// 	const uri = `https://ebooking.trip.com/toolcenter/api/ladder/queryBiddingEffectRuleInfoV2?hostType=HE&v=${Math.random()}`;

// 	return request({ uri, hotelId, otaConfig });

// 	// [{
// 	//     "id": 3246859,
// 	//     "ruleId": 2505867,
// 	//     "hotelId": 120731117,
// 	//     "masterHotelId": 120587497,
// 	//     "status": 0,
// 	//     "createTime": "2024/09/10 12:24",
// 	//     "startDate": "2024/09/12",
// 	//     "endDate": "2024/09/13",
// 	//     "rate": 0.03,
// 	//     "bidPayType": 0
// 	// }]
// }

async function set(otaConfig, hotelId, range, comm) {
	const uri = `https://ebooking.trip.com/toolcenter/api/ladder/submitBidding?hostType=HE&v=${Math.random()}`;

	const data = {
		...range,
		fgValue: comm,
		ppValue: comm,
		ppUnit: 0,
		fgUnit: 0,
		roomType: 0,
		paymentMethod: 0,
	};

	await request({ uri, hotelId, data, otaConfig });
}

async function syncAccelerator({ otaConfig, property, relComm, currentComm, commByDates }) {
	const objs = {};

	_.forEach(commByDates, (comVal, date) => {
		objs[comVal] = objs[comVal] || [];
		objs[comVal].push(new Date(date));
	});

	await _.entries(objs).asyncForEach(([val, dates]) => {
		val = Number(val);
		const comm = Math.max(relComm - currentComm + val, 0);

		const ranges = groupDates(dates).map(([from, to]) => ({
			startDate: from.toDateMysqlFormat(),
			endDate: to.toDateMysqlFormat(),
		}));

		return ranges.asyncForEach(range => set(otaConfig, property.propertyId, range, comm));
	});
}

module.exports = {
	syncAccelerator,
};
