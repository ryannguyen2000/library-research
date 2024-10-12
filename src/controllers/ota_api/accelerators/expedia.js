/* eslint-disable no-lonely-if */
const _ = require('lodash');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
// const { OTAs } = require('@utils/const');

async function request({ uri, method = 'POST', data, otaConfig }) {
	// console.log('expedia', data);
	const options = {
		method,
	};
	if (data) {
		options.body = JSON.stringify(data);
	}

	const res = await fetchRetry(uri, options, otaConfig);

	if (res.status !== 200) {
		return Promise.reject(`request fail with error code ${res.status}`);
	}

	const json = await res.json();
	if (!json.successful) {
		return Promise.reject(json.errorDetails && json.errorDetails.errorMessage);
	}

	return json.response;
}

function getAccelerators(otaConfig, hotelId) {
	const uri = `https://apps.expediapartnercentral.com/lodging/sponsoredcontent/accelerators?htid=${hotelId}&status=ACTIVE`;

	return request({ uri, method: 'GET', otaConfig });
	// [
	// 	{
	// 		acceleratorId: 441409659,
	// 		acceleratorPercentage: 4,
	// 		createDate: '2023-09-15 00:54:09',
	// 		endDate: '2023-10-25',
	// 		hasLoyaltyOffer: false,
	// 		startDate: '2023-10-22',
	// 		status: 'ACTIVE',
	// 	},
	// ];
}

async function create(otaConfig, hotelId, newData) {
	const uri = `https://apps.expediapartnercentral.com/lodging/sponsoredcontent/accelerators?htid=${hotelId}&source=mps`;
	const data = [
		{
			status: 'NEW',
			hasLoyaltyOffer: false,
			...newData,
		},
	];

	const res = await request({ uri, data, otaConfig });

	return res && res.successfulAccelerators;
}

async function update(otaConfig, hotelId, acceleratorId, newData) {
	const uri = `https://apps.expediapartnercentral.com/lodging/sponsoredcontent/accelerators/${acceleratorId}?htid=${hotelId}`;
	const data = {
		acceleratorId,
		...newData,
	};

	const res = await request({ uri, data, otaConfig, method: 'PUT' });

	return res && res.successfulAccelerators;
}

async function del(otaConfig, hotelId, campaignId) {
	const uri = `https://apps.expediapartnercentral.com/lodging/sponsoredcontent/accelerators/${campaignId}?htid=${hotelId}`;

	await request({ uri, otaConfig, method: 'DELETE' });
}

async function syncAccelerator({ otaConfig, property, relComm, currentComm, commByDates, from, to }) {
	const oriRemoteAccs = await getAccelerators(otaConfig, property.propertyId);
	const remoteAccs = _.cloneDeep(oriRemoteAccs);

	const createData = [];

	_.keys(commByDates)
		.sort()
		.forEach(date => {
			const remoteAcc = _.find(remoteAccs, rma => rma.startDate <= date && rma.endDate >= date);
			const comm = relComm - currentComm + commByDates[date];
			const prevDate = moment(date).subtract(1, 'day').format('Y-MM-DD');

			if (remoteAcc) {
				const { acceleratorPercentage } = remoteAcc;

				if (comm === acceleratorPercentage) {
					remoteAcc.endDate = _.max([remoteAcc.endDate, date]);
				} else {
					if (remoteAcc.endDate > to) {
						createData.push({
							startDate: moment(to).add(1, 'day').format('Y-MM-DD'),
							endDate: remoteAcc.endDate,
							acceleratorPercentage,
						});
					}
					if (remoteAcc.startDate < from) {
						createData.push({
							startDate: remoteAcc.startDate,
							endDate: moment(from).subtract(1, 'day').format('Y-MM-DD'),
							acceleratorPercentage,
						});
						remoteAcc.startDate = from;
					}
					remoteAcc.endDate = prevDate;

					if (comm) {
						const newest = _.last(createData);
						if (newest && newest.acceleratorPercentage === comm && newest.endDate === prevDate) {
							newest.endDate = date;
						} else {
							createData.push({
								startDate: date,
								endDate: date,
								acceleratorPercentage: comm,
							});
						}
					}
				}
			} else if (comm) {
				const newest = _.last(createData);

				if (newest && newest.acceleratorPercentage === comm && newest.endDate === prevDate) {
					newest.endDate = date;
				} else {
					createData.push({
						startDate: date,
						endDate: date,
						acceleratorPercentage: comm,
					});
				}
			}
		});

	await _.filter(remoteAccs, acc => {
		const oriRemote = _.find(oriRemoteAccs, o => o.acceleratorId === acc.acceleratorId);
		return oriRemote.startDate !== acc.startDate || oriRemote.endDate !== acc.endDate;
	}).asyncForEach(acc => {
		if (acc.endDate < acc.startDate) {
			return del(otaConfig, property.propertyId, acc.acceleratorId);
		}
		return update(otaConfig, property.propertyId, acc.acceleratorId, {
			startDate: acc.startDate,
			endDate: acc.endDate,
			acceleratorPercentage: acc.acceleratorPercentage,
		});
	});

	await createData.asyncForEach(newData => create(otaConfig, property.propertyId, newData));
}

module.exports = {
	syncAccelerator,
};
