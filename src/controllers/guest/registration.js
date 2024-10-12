const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { countries } = require('country-data');

const { BookingStatus, GuestRegisterType } = require('@utils/const');
const { Settings } = require('@utils/setting');
const mongoUtils = require('@utils/mongo');
const models = require('@models');

async function queryResidence(queries, lookupReservationMatch) {
	const bookingQuery = [
		{ $match: queries },
		...mongoUtils.genLookupAndSelect({
			name: 'reservation',
			local: '_id',
			foreign: 'bookingId',
			match: lookupReservationMatch,
			extPipeline: [
				...mongoUtils.genLookupAndSelect({
					name: 'room',
					local: 'roomId',
					foreign: '_id',
					as: 'room',
					unwind: true,
					select: 'info.name info.roomNo',
				}),
			],
			as: 'rooms',
			select: `_id:$room._id info:$room.info guests`,
		}),
		{ $match: { 'rooms.0': { $exists: true } } },
		...mongoUtils.genLookupAndSelect({
			name: 'guest',
			local: 'guestId',
			foreign: '_id',
			as: 'guestId',
			unwind: true,
			select: '-histories -tags -passport -__v -otaId -ota',
		}),
		...mongoUtils.genLookup('guest', 'guestIds', '_id', 'guestIds'),
		...mongoUtils.genSelect(
			'-guide -histories -images -description -guestIds.histories -guestIds.tags -guestIds.passport -guestIds.__v -guestIds.otaId -guestIds.ota'
		),
	];

	const bookings = await models.Booking.aggregate(bookingQuery);

	const guests = _.chain(bookings)
		.map(booking => {
			// const rooms = booking.rooms.map(room => ({ ...room, guests: undefined }));

			const gs = _.compact([booking.guestId, ...booking.guestIds]).map(guest => {
				guest.from = booking.from;
				guest.to = booking.to;
				guest.bookingId = booking._id;

				guest.rooms = booking.rooms.filter(room =>
					_.find(room.guests, g => {
						if (g.guestId.equals(guest._id)) {
							guest.checkin = g.checkin;
							return true;
						}

						return false;
					})
				);

				return guest.rooms.length && guest;
			});

			return gs.filter(g => g);
		})
		.flattenDeep()
		.uniqBy(item => item._id.toString())
		.value();

	return guests;
}

async function getRegistrationByCheckin(blockId, date, user) {
	const first = moment(date).add(-1, 'days').hour(20).minute(30).second(0).toDate();
	const last = moment(date).hour(20).minute(30).second(0).toDate();
	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		roomKey: 'roomId',
	});

	const filter = {
		...filters,
		'dates.0': { $exists: true },
		guests: { $elemMatch: { checkin: { $gte: first, $lte: last } } },
	};

	const resQueries = [{ $match: filter }, { $group: { _id: '$bookingId' } }];
	const reservations = await models.Reservation.aggregate(resQueries);

	const queries = { _id: { $in: reservations.map(res => res._id) } };
	const lookupReservationMatch = {
		$expr: { $eq: ['$bookingId', '$$id'] },
		...filter,
	};
	const data = await queryResidence(queries, lookupReservationMatch);
	return data.filter(item => item.checkin >= first && item.checkin <= last);
}

async function getRegistrationByFrom(blockId, date, user) {
	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		roomKey: 'reservateRooms',
	});
	const filter = {
		...filters,
		status: BookingStatus.CONFIRMED,
		from: new Date(date),
	};

	const lookupReservationMatch = {
		$expr: { $eq: ['$bookingId', '$$id'] },
		'dates.0': { $exists: true },
	};

	return queryResidence(filter, lookupReservationMatch);
}

async function getData(query, user, showRegistered) {
	const { blockId, date, type = 'checkin', country, guestIds, nationality, registered } = query;

	let guests =
		type === 'from'
			? await getRegistrationByFrom(blockId, date, user)
			: await getRegistrationByCheckin(blockId, date, user);

	if (country) {
		guests = _.filter(guests, g => g.country === country);
	}
	if (nationality) {
		const nationalCode = Settings.NationalCode.value;

		const filter =
			nationality === GuestRegisterType.National
				? g => !g.country || g.country === nationalCode
				: g => g.country && g.country !== nationalCode;
		guests = _.filter(guests, filter);
	}
	if (guestIds && guestIds.length) {
		guests = guests.filter(guest => guestIds.includes(guest._id.toString()));
	}
	if (showRegistered || registered) {
		const history = await models.GuestRegistrationAuto.aggregate()
			.match(
				_.pickBy({
					date,
					blockId: blockId && mongoose.Types.ObjectId(blockId),
					guests: { $in: _.map(guests, '_id') },
				})
			)
			.unwind('$guests')
			.group({
				_id: null,
				guestIds: { $addToSet: '$guests' },
			});
		const registeredGuestIds = _.map(_.get(history, [0, 'guestIds']), g => g.toString());

		guests.forEach(guest => {
			guest.registered = registeredGuestIds.includes(guest._id.toString());
		});

		if (registered) {
			guests = guests.filter(g => (registered === 'true' ? g.registered : !g.registered));
		}
	}

	return guests;
}

async function getRegistrations(req, res) {
	const guests = await getData(req.query, req.decoded.user, true);
	res.sendData({ guests });
}

function getGenderNumber(gender) {
	if (gender === 'male') return '2';
	if (gender === 'female') return '3';
	if (gender === 'other') return '4';
	return '1';
}

function getGenderText(gender) {
	if (gender === 'male') return 'Giới tính nam';
	if (gender === 'female') return 'Giới tính nữ';
	if (gender === 'other') return 'Khác';
	return 'Chưa có thông tin';
}

function isPassport(input) {
	return !!input && (/\D/.test(input) || input.length < 9 || input.length > 12);
}

async function getGuestData(guests) {
	const dataDetected = await models.CSV.find({ 'data.data.id': { $in: _.map(guests, 'passportNumber') } })
		.lean()
		.then(rs => _.keyBy(rs, 'data.data.id'));
	guests = _.uniqBy(
		guests.filter(g => g.passportNumber),
		'passportNumber'
	);

	return guests.map(g => {
		const dataDetec = _.get(dataDetected, [g.passportNumber, 'data']);

		return {
			...g,
			addressProvince:
				g.addressProvince || _.get(dataDetec, 'data.diachi_tinh') || _.get(dataDetec, 'data.address_town_code'),
			addressDistrict:
				g.addressDistrict ||
				_.get(dataDetec, 'data.diachi_huyen') ||
				_.get(dataDetec, 'data.address_district_code'),
			addressWard:
				g.addressWard || _.get(dataDetec, 'data.diachi_phuong') || _.get(dataDetec, 'data.address_ward_code'),
			identifyType: _.get(dataDetected, 'type'),
		};
	});
}

async function createNationalFile(guests, options = {}) {
	const workBook = xlsx.utils.book_new();
	const dataDetected = await models.CSV.find({ 'data.data.id': { $in: _.map(guests, 'passportNumber') } })
		.lean()
		.then(rs => _.keyBy(rs, 'data.data.id'));
	guests = _.uniqBy(
		guests.filter(g => g.passportNumber),
		'passportNumber'
	);
	const { isExtCheckout } = options;

	const defaultProvince = '79'; // hcm;
	const defaultDistrict = '786'; // nha be;
	const defaultWard = '27646'; // xa phuoc kien;
	const defaultProvinceName = 'Thành phố Hồ Chí Minh';
	const defaultDistrictName = 'Huyện Nhà Bè';
	const defaultWardName = 'Xã Phước Kiển';

	const wsData = guests.map(guest => {
		const ispp = isPassport(guest.passportNumber);
		const dataDetec = _.get(dataDetected, [guest.passportNumber, 'data', 'data']);

		let province = _.get(dataDetec, 'diachi_tinh') || _.get(dataDetec, 'address_town_code');
		let district = _.get(dataDetec, 'diachi_huyen') || _.get(dataDetec, 'address_district_code');
		let ward = _.get(dataDetec, 'diachi_phuong') || _.get(dataDetec, 'address_ward_code');
		let street = _.split(guest.address, ',')[0];
		let provinceName = _.get(dataDetec, 'diachi_tinh_name') || _.get(dataDetec, 'address_town');
		let districtName = _.get(dataDetec, 'diachi_huyen_name') || _.get(dataDetec, 'address_district');
		let wardName = _.get(dataDetec, 'diachi_phuong_name') || _.get(dataDetec, 'address_ward');

		if (!provinceName || !districtName || !wardName) {
			province = defaultProvince;
			district = defaultDistrict;
			ward = defaultWard;
			provinceName = defaultProvinceName;
			districtName = defaultDistrictName;
			wardName = defaultWardName;
		}

		return [
			guest.fullName || guest.name, // A
			guest.dayOfBirth ? moment(guest.dayOfBirth).format('DD/MM/YYYY') : '', // B
			getGenderNumber(guest.gender), // C
			getGenderText(guest.gender), // D
			ispp ? 0 : guest.passportNumber, // E
			ispp ? guest.passportNumber : 0, // F
			0, // G
			0, // H
			'', // I
			0, // J
			0, // K
			'', // L
			0, // M
			'VN', // N
			'Cộng hòa xã hội chủ nghĩa Việt Nam', // O
			'VN', // P
			'Cộng hòa xã hội chủ nghĩa Việt Nam', // Q
			province, // R
			district, // S
			ward, // T
			street || '', // U
			_.compact([street, wardName, districtName, provinceName]).join(', '), // V
			2, // W,
			'Khác', // X
			moment(guest.from).format('DD/MM/YYYY'), // Y
			(isExtCheckout ? moment(guest.to).add(1, 'day') : moment(guest.to)).format('DD/MM/YYYY'), // Z
			'Du lịch', // AA
			0, // AB
		];
	});

	const ws = xlsx.utils.aoa_to_sheet(wsData);
	xlsx.utils.book_append_sheet(workBook, ws, 'extracted');

	const fileName = `${uuid()}.xlsm`;
	_.set(workBook, 'Props.Author', 'Phuong Phan');
	const TMP_FOLDER = 'tmp';
	const filePath = `${TMP_FOLDER}/${fileName}`;

	await fs.promises.mkdir(TMP_FOLDER, { recursive: true }).catch(() => {});
	await xlsx.writeFile(workBook, filePath);

	return filePath;
}

async function createInternationalFile(guests, options = {}) {
	const { isExtCheckout } = options;
	guests = _.uniqBy(
		guests.filter(g => g.passportNumber),
		'passportNumber'
	);

	const body = guests
		.map((guest, i) => {
			const checkout = (isExtCheckout ? moment(guest.to).add(1, 'day') : moment(guest.to)).format('DD/MM/YYYY');
			const fields = [
				`<so_thu_tu>${i + 1}</so_thu_tu>`,
				`<ho_ten>${guest.fullName || guest.name}</ho_ten>`,
				`<ngay_sinh>${guest.dayOfBirth ? moment(guest.dayOfBirth).format('DD/MM/YYYY') : ''}</ngay_sinh>`,
				`<ngay_sinh_dung_den>D</ngay_sinh_dung_den>`,
				`<gioi_tinh>${guest.gender === 'male' ? 'M' : 'F'}</gioi_tinh>`,
				`<ma_quoc_tich>${_.get(countries, [guest.country, 'alpha3']) || '0RQ'}</ma_quoc_tich>`,
				`<so_ho_chieu>${guest.passportNumber}</so_ho_chieu>`,
				`<so_phong>${_.get(guest, 'rooms.0.info.roomNo')}</so_phong>`,
				`<ngay_den>${moment(guest.from).format('DD/MM/YYYY')}</ngay_den>`,
				`<ngay_di_du_kien>${checkout}</ngay_di_du_kien>`,
				`<ngay_tra_phong>${checkout}</ngay_tra_phong>`,
			].join('\n\t\t');
			return `<THONG_TIN_KHACH>\n\t\t${fields}\n\t</THONG_TIN_KHACH>`;
		})
		.join('\n\t');

	const xsl = `<?xml version="1.0" encoding="UTF-8"?>\n<KHAI_BAO_TAM_TRU>\n\t${body}\n</KHAI_BAO_TAM_TRU>`;

	const TMP_FOLDER = 'tmp';
	const filePath = `${TMP_FOLDER}/${uuid()}.xml`;

	await fs.promises.mkdir(TMP_FOLDER, { recursive: true }).catch(() => {});
	await fs.promises.writeFile(filePath, xsl, { flag: 'w' });

	return filePath;
}

function addGuestsToRegistered(query, user, guests, isInternational) {
	if (!query.blockId || !guests.length) return;

	models.GuestRegistrationAuto.create({
		blockId: query.blockId,
		date: query.date,
		guests: _.map(guests, '_id'),
		createdBy: user._id,
		nationality: isInternational ? GuestRegisterType.International : GuestRegisterType.National,
		isManual: true,
	}).catch(() => {});
}

async function exportRegistrations(req, res) {
	const guests = await getData(req.query, req.decoded.user);

	const isInternational = req.query.fileType === GuestRegisterType.International;

	const fileName = isInternational ? `thongbaoluutru.xml` : `thongbaoluutru.xlsm`;
	const filePath = isInternational ? await createInternationalFile(guests) : await createNationalFile(guests);

	const readable = fs.createReadStream(filePath);
	readable.on('end', () => {
		fs.unlink(filePath, () => {});
		if (req.query.isRegistered === 'true') {
			addGuestsToRegistered(req.query, req.decoded.user, guests, isInternational);
		}
	});

	res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
	readable.pipe(res);
}

module.exports = {
	getRegistrations,
	exportRegistrations,
	getData,
	createNationalFile,
	createInternationalFile,
	getGuestData,
};
