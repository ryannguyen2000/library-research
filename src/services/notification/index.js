// const mongoose = require('mongoose');

// const { APP_ID, API_KEY } = require('@config/setting').ONE_SIGNAL;
// const { logger } = require('@utils/logger');
// const fetch = require('@utils/fetch');

// function push(content, data, include_player_ids, android_channel_id, ios_sound_name) {
// 	const ids = include_player_ids.filter(id => !id.includes('{"_id":'));
// 	const body = {
// 		app_id: APP_ID,
// 		contents: { en: content },
// 		data,
// 		include_player_ids: ids,
// 		android_channel_id,
// 		ios_sound: `${ios_sound_name}.wav`,
// 	};
// 	fetch('https://onesignal.com/api/v1/notifications', {
// 		method: 'POST',
// 		headers: {
// 			Authorization: `Basic ${API_KEY}`,
// 			'Content-Type': 'application/json; charset=utf-8',
// 		},
// 		body: JSON.stringify(body),
// 	}).catch(e => {
// 		logger.warn(e);
// 	});
// }

const Sound = {
	Update: {
		android: 'd6abee78-bca3-483e-8db7-d73d07f31c66',
		ios: 'update_reservation',
	},
	Reservation: {
		android: '9d5ef471-4d7c-4862-bd10-681035561b42',
		ios: 'reservation',
	},
	Messages: {
		android: '6b6b78c5-6115-4f52-8ea4-8b726c1ec35a',
		ios: 'message',
	},
	Cancelled: {
		android: '19f51d9a-1b4f-43f2-9e48-9389428733c1',
		ios: 'canceled',
	},
};

async function pushToHostsOfBlock({ blockId, ottPhone, permissions, ...data }) {
	// try {
	// 	const users = await mongoose.model('User').findByPermission({ permissions, blockId, ottPhone });
	// 	await pushToUsers({ users, ...data });
	// } catch (e) {
	// 	logger.error(e);
	// }
}

async function pushToUsers({ users, title, data, sound }) {
	// if (global.isDev) return;
	// try {
	// 	const pushKeys = await mongoose.model('UserDevice').getNotiKeys(users);
	// 	if (pushKeys && pushKeys.length > 0) {
	// 		if (!sound) sound = Sound.Reservation;
	// 		push(title, data, pushKeys, sound.android, sound.ios);
	// 	}
	// } catch (e) {
	// 	logger.error(e);
	// }
}

module.exports = {
	Sound,
	pushToHostsOfBlock,
	pushToUsers,
};
