const _ = require('lodash');
const { v4: uuid } = require('uuid');

const { STATIC_CONTENT_TYPE } = require('@utils/const');
const models = require('@models');

const MIN_ZOOM_FOR_SHOW_PRICE = 18;

const CACHE_TAGS = {};

const DATA_TYPE = {
	ROOM: 'room',
	PROPERTY: 'property',
};

const CARD_TYPE = {
	LARGE: 'card_large',
};

const SERVICES_SLUG = {
	// MONTH: 'cho-thue-dai-han',
	DAY: 'cho-thue-ngan-han',
	HOUR: 'cho-thue-theo-gio',
	NIGHT: 'cho-thue-qua-dem',
};

const SERVICES = {
	DAY: 3,
	HOUR: 1,
	NIGHT: 2,
	// MONTH: 4,
};

const PROPERTY_TYPES = [
	{
		id: 6,
		name: {
			vi: 'Homestay',
			en: 'Homestay',
		},
		slug: 'homestay',
	},
	{
		id: 1,
		name: {
			vi: 'Căn hộ dịch vụ',
			en: 'Service Apartment',
			ja: 'サービスアパートメント',
			ko: '서비스 집',
			zh: '服务套房',
		},
		slug: 'can-ho-dich-vu',
	},
	{
		id: 3.0,
		name: {
			vi: 'Khách sạn',
			en: 'Hotel',
		},
		slug: 'khach-san',
	},
	{
		id: 4.0,
		name: {
			vi: 'Nhà nghỉ',
			en: 'Motel',
		},
		slug: 'nha-nghi',
	},
	// {
	// 	id: 5.0,
	// 	name: {
	// 		vi: 'Ký túc xá',
	// 		en: 'Dormitory',
	// 	},
	// 	slug: 'ky-tuc-xa',
	// },
];

const SUBDIVITION = {
	STREET: 'street',
	WARD: 'ward',
	DISTRICT: 'district',
	PROVINCE: 'province',
	COUNTRY: 'country',
};

const ROOM_STATUS = {
	AVAILABLE: 'available',
	FULL: 'full',
};

function convertToStatic(url) {
	if (!url) return null;
	return {
		path: 'url',
		screen: ['small', 'medium', 'large', 'x_large'],
		url: {
			x_large: url,
			large: url,
			medium: url,
			origin: url,
			small: url,
		},
		_id: uuid(),
	};
}

function getPrecisionByZoom(zoom) {
	if (zoom >= 17) return 9;
	if (zoom > 15) return 8;
	if (zoom > 13) return 7;
	if (zoom > 11) return 6;
	if (zoom > 9) return 5;
	if (zoom > 6) return 4;
	return 3;
}

function mapLocationText(locations, language) {
	if (!locations) return;

	const isVi = language === 'vi';

	_.forEach(_.isArray(locations) ? locations : [locations], data => {
		if (!data) return;

		if (!isVi && data.alias) {
			data.name = data.alias;
			delete data.alias;
		}
		if (isVi && data.prefix) {
			data.name = `${data.prefix} ${data.name}`;
			delete data.prefix;
		}
	});

	return locations;
}

async function findSTag(tagSlug) {
	if (CACHE_TAGS[tagSlug]) {
		return {
			slug: tagSlug,
			label: CACHE_TAGS[tagSlug],
		};
	}

	const roomContent = await models.BlockStaticContent.findOne({
		contentType: STATIC_CONTENT_TYPE.ROOM,
		'content.stags.slug': tagSlug,
	})
		.select({
			'content.stags': 1,
		})
		.lean();

	const roomTag = _.find(_.get(roomContent, 'content.stags'), tg => tg.slug === tagSlug);

	if (roomTag) {
		CACHE_TAGS[tagSlug] = roomTag.label;
	}

	return roomTag;
}

module.exports = {
	convertToStatic,
	getPrecisionByZoom,
	mapLocationText,
	findSTag,
	MIN_ZOOM_FOR_SHOW_PRICE,
	DATA_TYPE,
	CARD_TYPE,
	SERVICES_SLUG,
	SERVICES,
	PROPERTY_TYPES,
	SUBDIVITION,
	ROOM_STATUS,
};
