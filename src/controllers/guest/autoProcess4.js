/* eslint-disable no-loop-func */
/* eslint-disable no-shadow */
const _ = require('lodash');
const moment = require('moment');
const qs = require('qs');

const { createBrowser, randDelay, setByPassCapchaAgent, delay } = require('./sharedAutoProcess');
const { ACTION } = require('./const');
const { logger } = require('../../utils/logger');

let browser;
let page;
let token;
let accoms;
let running;
let [, , username, password, requestId, defaultData] = process.argv;
let config = defaultData && JSON.parse(defaultData);
let accommodationId = config && config.accommodationId;
let accommodationIndex = config && parseInt(config.accommodationIndex);
let requestedOTP = false;
let state = {
	headers: {},
};

const locationTemp = {};

const IDENTIFY_TYPES = {
	CMND: 3,
	HC: 9,
	CCCD: 11,
	GTK: 17,
};
const NATIONAL_ID = 196;
// const HOST = 'https://luutru.dancuquocgia.gov.vn';
const HOST = 'https://dulich.asmbca.vn';

function getGender(gender) {
	return gender === 'male' ? '5' : gender === 'female' ? '6' : gender === 'other' ? '7' : '4';
}

function getIndentifyType(type) {
	if (type && type.includes('cmd')) return IDENTIFY_TYPES.CMND;
	if (type && (type.includes('tcc') || type.includes('chip_id_card'))) return IDENTIFY_TYPES.CCCD;
	if (type && type.includes('passport')) return IDENTIFY_TYPES.HC;
	return IDENTIFY_TYPES.GTK;
}

function checkOTP() {
	if (!state.otp || state.otp.mode !== 'expiredDate' || !state.otp.expiredDate) return false;

	return moment(state.otp.expiredDate, 'DD/MM/YYYY HH:mm:ss').isAfter(new Date());
}

async function onResponse(response) {
	const url = response.url();
	const method = response.request().method();
	const ok = response.status() === 200;

	try {
		if (url.startsWith('http')) {
			logger.warn('ASM onResponse', url, method, response.status());
		}

		if (url.includes('csrt=')) {
			state.csrt = qs.parse(url.split('?')[1]).csrt;
		}

		if (method === 'POST' && url.includes('/idp/sso/login-actions/change-mode')) {
			const rs = await response.json().catch(() => null);

			logger.warn('onResponse DVC AMS change-mode', rs);

			if (rs && rs.otp) {
				state.otp = rs;
				process.send({ type: ACTION.GET_OTP_DONE });
				// {
				// 	otp: true,
				// 	expiredDate: '01/10/2024 16:57:33',
				// 	mode: 'SMS',
				// 	phoneNumber: '085****754',
				// 	isDevice: true
				// }
			}
		}

		if (method === 'POST' && url.includes('/idp/sso/login-actions/authenticate')) {
			const rs = await response.json().catch(() => null);

			logger.warn('onResponse DVC AMS', rs);

			// {"otp":true,"expiredDate":"11/08/2023 10:37:45","phoneNumber":"090****289"}
			if (rs && rs.otp) {
				state.otp = rs;
				process.send({ type: ACTION.GET_OTP_DONE });
			}

			// {"error":"invalid_grant_vneid","error_description":"Mã OTP đã hết hiệu lực."}
			if (rs && rs.error === 'invalid_grant_vneid') {
				if (requestedOTP) {
					process.send({
						type: ACTION.SEND_OTP_DONE,
						payload: {
							errorCode: 1,
							errorMsg: rs.error_description,
							requireOTP: true,
						},
					});
				} else {
					process.send({
						type: ACTION.ERROR,
						payload: rs.error_description,
					});
				}
			}
		}
		if (method === 'POST' && url.includes('/authen/get-token')) {
			const rs = ok ? await response.json() : null;

			if (rs && rs.code === 200 && rs.data && rs.data.accessToken) {
				// LOGIN DONE
				token = rs.data.accessToken;
				logger.warn('ASM accessToken', rs.data);
			}
		}
		if (method === 'GET' && url.includes('/authen/routing-after-login')) {
			const rs = ok ? await response.json() : null;
			if (rs && rs.accoms) {
				accoms = rs.accoms;
				if (!running) {
					running = true;
					await runAuto();
				}
			}
		}
	} catch (e) {
		logger.error('ASM: onResponse error', url, e);
	}
}

(async function run() {
	try {
		browser = await createBrowser(requestId);

		page = await browser.newPage();

		page.on('response', onResponse);

		// await page.setRequestInterception(true);

		// page.on('request', request => {
		// 	console.log(request.url());
		// 	console.log(request.method());
		// 	console.log(request.headers());
		// 	console.log(request.postData());

		// 	if (request.url().includes('login-actions/authenticate') && request.method() === 'POST') {
		// 		state.headers = request.headers();
		// 	}

		// 	request.continue();
		// 	// request.continue({ method: 'POST', postData: JSON.stringify(POST_JSON), headers: request.headers });
		// });

		await setByPassCapchaAgent(page);

		await page.goto(`${HOST}/login`, {
			waitUntil: 'networkidle2',
		});

		// logged in
		if (page.url().includes('/quan-ly-co-so-luu-tru')) return;

		await page.waitForSelector('#username');

		await page.focus('#username');
		await page.keyboard.type(username);

		await randDelay(50, 300);

		await page.focus('#password');
		await page.keyboard.type(password);

		await page.click('.ant-form-item button');
		await page.waitForSelector('#otp-input');

		await delay(500);

		await requestOTP().catch(e => {
			logger.error('run requestOTP', e);
		});

		process.send({
			type: ACTION.READY,
			payload: {
				otp: true,
				noRefresh: true,
			},
		});
	} catch (e) {
		logger.error('ASM:', e);
		// process.send({ type: ACTION.ERROR, payload: _.toString(e) });
	}
})();

async function sendOTP(otp) {
	await page.waitForSelector('#otp-input');

	for (let i = 0; i < 6; i++) {
		await page.focus(`#otp-input:nth-child(${i + 1})`);
		await page.keyboard.type(otp[i] || '');
		await randDelay(100, 300);
	}

	requestedOTP = true;

	// await page.click('.custom-modal-otp .custom-btn-resolve');
	await page.click(`.ant-modal-body button.custom-btn-resolve`);
}

async function requestOTP() {
	if (checkOTP()) {
		process.send({ type: ACTION.GET_OTP_DONE });
		return;
	}

	await page.click(`.mt-6.flex.justify-between > div:nth-child(2)`);

	await delay(500);

	await page.evaluate(() => {
		// eslint-disable-next-line no-undef
		const nodes = document.querySelectorAll('.ant-modal-body button.custom-btn-resolve');
		nodes[nodes.length - 1].click();
	});

	// await page.click(`.ant-modal-body button.custom-btn-resolve`);

	// await request(`https://vneid.gov.vn/api/idp/sso/login-actions/change-mode?csrt=${state.csrt}`, {
	// 	method: 'POST',
	// 	headers: {
	// 		'Content-Type': 'application/x-www-form-urlencoded',
	// 		...state.headers,
	// 	},
	// 	body: `resendOtp=true&mode=sms`,
	// });
}

async function runAuto() {
	try {
		const propertyIds = _.keys(accoms);

		let propertyIndex = -1;

		if (accommodationId) {
			propertyIndex = propertyIds.findIndex(a => a === accommodationId);
		} else if (accommodationIndex) {
			propertyIndex = accommodationIndex - 1;
			accommodationId = propertyIds[propertyIndex];
		}

		if (propertyIndex === -1) {
			throw new Error('Cấu hình tài khoản không đúng, vui lòng kiểm tra lại!');
		}

		await page.waitForSelector('.custom-body-danh-sach-cslt-component .ant-card-hoverable');

		await page.evaluate(i => {
			// eslint-disable-next-line no-undef
			document.querySelectorAll('.custom-body-danh-sach-cslt-component .ant-card-hoverable')[i].click();
		}, propertyIndex);

		await page.waitForSelector('#page-header-user-dropdown');

		const rooms = await listRooms();
		const roomsHaveGuest = await listRoomsHaveGuests();

		const needUpdateRooms = {};
		const registeredGuest = {};

		for (const room of roomsHaveGuest) {
			if (moment().isSameOrAfter(room.checkOut, 'day')) {
				await checkoutRoom(room);
				needUpdateRooms[room.room.roomId] = true;
			} else {
				room.customers.forEach(customer => {
					registeredGuest[customer.identifyNo] = customer;
				});
			}
		}

		rooms.forEach(room => {
			if (room.usingStatus === 'GET_DIRTY' || room.usingStatus === 'REPAIRING') {
				needUpdateRooms[room.id] = true;
			}
		});

		for (const roomId in needUpdateRooms) {
			await updateRoom(Number(roomId), rooms);
			await randDelay(50, 400);
		}

		const newGuests = await getGuestData();
		for (const guest of newGuests) {
			const guestRoom = _.get(guest.rooms, [0]);
			if (!guestRoom || registeredGuest[guest.passportNumber]) {
				continue;
			}

			const roomTxt = _.trim(guestRoom.info.roomNo).toLowerCase();
			const room =
				rooms.find(r => _.trim(r.roomNo).toLowerCase() === roomTxt) ||
				rooms.find(r => roomTxt.includes(_.trim(r.roomNo).toLowerCase()));

			if (!room) {
				logger.error('ASM: room not found', guestRoom);
				continue;
			}

			await createGuest(guest, room)
				.catch(() => randDelay(200, 500))
				.then(() => createGuest(guest, room));

			await randDelay(100, 500);
		}

		await browser.close();

		process.send({
			type: ACTION.SUCCESS,
		});
	} catch (err) {
		logger.error('ASM: runAuto', err);

		await browser.close().catch(e => {
			logger.error('ASM: browser close', e);
		});

		process.send({
			type: ACTION.ERROR,
			payload: _.toString(err),
		});
	}
}

function getGuestData() {
	return new Promise(rs => {
		process.send({
			type: ACTION.GET_FILE,
			payload: {
				raw: true,
			},
		});
		const listener = ({ type, payload }) => {
			if (type === ACTION.GET_FILE_DONE) {
				process.removeListener('message', listener);
				rs(payload);
			}
		};
		process.on('message', listener);
	});
}

async function request(url, options) {
	const [error, response] = await page.evaluate(
		(accessToken, uri, opts = {}) => {
			const headers = {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...(opts.headers || {}),
			};
			// eslint-disable-next-line no-undef
			return fetch(uri, {
				headers,
				credentials: 'include',
				...opts,
			})
				.then(res => res.text())
				.then(text => {
					try {
						const json = JSON.parse(text);
						return json;
					} catch (e) {
						return Promise.reject({ json: false, text });
					}
				})
				.then(json => [json.code !== 200, json.data || json])
				.catch(e => [true, e]);
		},
		token,
		url,
		options
	);

	if (error) {
		logger.error('ASM: request error', url, options, response);

		if (response.json === false) {
			return Promise.reject('Có lỗi xảy ra vui lòng thử lại sau ít phút!');
		}

		return null;
	}

	return response;
}

async function listRoomsHaveGuests() {
	const floors = await request(
		`${HOST}/api/room/get-manage-rooms/${accommodationId}?acmdId=${accommodationId}&typeSearch=ALL`
	);
	const rooms = [];

	_.forEach(floors, floor => {
		_.forEach(floor.rooms, room => {
			if (room.ruId) {
				rooms.push(room);
			}
		});
	});

	const data = [];

	for (const room of rooms) {
		const roomDetail = await request(`${HOST}/api/room/get-info-room-detail-using/${room.ruId}`);
		if (roomDetail) {
			data.push(roomDetail);
		}
		await randDelay(100, 400);
	}

	return _.compact(data);
}

async function createGuest(guest, room) {
	const provinces = await getAdministrative();

	const upAddress = _.toUpper(guest.address).trim();

	const province =
		provinces.find(
			guest.addressProvince
				? p => p.code === guest.addressProvince
				: p => _.toUpper(p.nameKD).includes(upAddress) || _.toUpper(p.name).includes(upAddress)
		) || provinces[0];
	if (!province) {
		logger.error('AMS: Not found province', guest);
		return;
	}

	const districts = await getAdministrative(province.id);
	const district = (guest.addressDistrict && districts.find(p => p.code === guest.addressDistrict)) || districts[0];
	if (!district) {
		logger.error('AMS: Not found district', guest);
		return;
	}

	let ward = null;
	if (guest.addressWard) {
		const wards = await getAdministrative(district.id);
		ward = wards.find(p => p.code === guest.addressWard);
	}

	const data = {
		fullName: guest.fullName || guest.name,
		gender: getGender(guest.gender),
		birthDate: guest.dayOfBirth ? new Date(guest.dayOfBirth).toISOString() : '',
		phoneNumber: guest.phone,
		identifyType: getIndentifyType(guest.identifyType),
		identifyNo: guest.passportNumber,
		identifyTitle: null,
		nationalId: NATIONAL_ID,
		ethnicId: null,
		countryId: null,
		registrationType: 1,
		registrationAddress: guest.address,
		provinceId: province.id,
		districtId: district.id,
		wardId: ward && ward.id,
		occupationId: null,
		workPlace: null,
		note: null,
		reasonStayId: 1,
		medicalDeclaration: null,
		injection: null,
		testedCovid19: null,
		curedF0: null,
		goCountry: null,
		numberInjection: null,
		lastTimeInjection: null,
		idMethodTest: null,
		unitTest: null,
		datePositiveDeclare: null,
		dateDischargeHospital: null,
		numberDischargeHospital: null,
		unitDischargeHospital: null,
		timeTestNegative: null,
		idMethodTestCuredF0: null,
		unitTestCuredF0: null,
		timeDeClare: null,
		checkIn: moment(guest.from).hour(14).minute(0).toISOString(),
		checkOut: moment(guest.to).hour(12).minute(0).toISOString(),
		roomId: room.id,
		typeCreate: 'HAND_ADD',
		customerType: 'KHACH_LE',
		groupId: null,
		accommodationId,
		lastTimeTest: null,
		// id
	};

	await request(`${HOST}/api/customer-accommodation-detail/create`, {
		method: 'POST',
		body: JSON.stringify(data),
	});
}

async function checkoutRoom(booking) {
	for (let i = 0; i < booking.customers.length; i++) {
		const guest = booking.customers[i];

		if (i < booking.customers.length - 1) {
			await request(`${HOST}/api/customer/check-out`, {
				method: 'POST',
				body: JSON.stringify({ rudId: guest.rudId, checkOutTime: new Date().toISOString() }),
			});
		} else {
			const data = {
				ruId: booking.id,
				customerId: guest.customerId,
				typeCharge: 'DAY',
				note: null,
				roomExtras: booking.roomExtras,
				// roomExtras: [
				// 	{
				// 		id: 310906,
				// 		typeExtra: 'ROOM_PRICE',
				// 		unitPrice: 1,
				// 		numberHour: null,
				// 		numberCustomer: null,
				// 		numberDay: 1,
				// 		totalPrice: 1,
				// 		content: null,
				// 		symbol: '+',
				// 		typeDiscount: 'VNĐ',
				// 		valuePercent: null,
				// 	},
				// ],
				vat: _.get(booking, 'transaction.vat') || 0,
			};

			await request(`${HOST}/api/customer/payment`, {
				method: 'POST',
				body: JSON.stringify(data),
			});
		}

		await randDelay(50, 400);
	}
}

async function listRooms() {
	const rooms = await request(
		`${HOST}/api/room/get-all-with-customers/${accommodationId}?acmdId=${accommodationId}&usingStatuses=EMPTY,USING,GET_DIRTY,REPAIRING`
	);

	return rooms;
}

async function updateRoom(id, rooms) {
	const prevRooms = rooms.find(r => r.id === id);
	if (!prevRooms) return;

	const data = {
		...prevRooms,
		id,
		accommodationFacilityId: Number(accommodationId),
		usingStatus: 'EMPTY',
	};

	await request(`${HOST}/api/room/update/${id}`, {
		method: 'POST',
		body: JSON.stringify(data),
	});
}

async function getAdministrative(parentId) {
	if (locationTemp[parentId]) return locationTemp[parentId];

	const data = await request(`${HOST}/api/administrative-level${parentId ? `?parentId=${parentId}` : ''}`);
	if (!data) {
		return Promise.reject('Lấy đơn vị hành chinh thất bại, vui lòng thử lại sau!');
	}

	await randDelay(50, 400);

	locationTemp[parentId] = data;

	return data;
}

function getCapcha() {
	process.send({
		type: ACTION.GET_CAPCHA_DONE,
		payload: {
			errorCode: 0,
			requireOTP: true,
		},
	});
}

function sendCapcha() {
	process.send({
		type: ACTION.SEND_CAPCHA_DONE,
		payload: {
			errorCode: 0,
			requireOTP: true,
		},
	});
}

process.on('message', async ({ type, payload }) => {
	try {
		if (type === ACTION.GET_CAPCHA) {
			await getCapcha(payload);
		} else if (type === ACTION.SEND_CAPCHA) {
			await sendCapcha(payload);
		} else if (type === ACTION.GET_OTP) {
			await requestOTP(payload);
		} else if (type === ACTION.SEND_OTP) {
			await sendOTP(payload).catch(e => {
				logger.error('ASM sendOTP', e);
			});
		}
	} catch (err) {
		logger.error('AMS: process error', err);
		process.send({
			type: `${type}_DONE`,
			payload: {
				errorCode: 1,
				errorMsg: _.toString(err),
			},
		});
	}
});

process.on('exit', () => {
	if (browser) browser.close();
});
