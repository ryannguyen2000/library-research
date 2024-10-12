const _ = require('lodash');
const moment = require('moment');
const dot = require('dot-object');

const { logger } = require('@utils/logger');
const { convert11To10 } = require('@utils/phone');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const models = require('@models');
const ZaloDB = require('@services/zalo/personal/database');
const {
	CONNECTION_TYPE,
	ZALO_SENT,
	ON_NEW_MESSAGE,
	CHECK_CONNECTION,
	CHECK_EXISTS,
} = require('@services/zalo/personal/const');

const ref = {};

async function onMessage(msg) {
	try {
		const { event, data, id, error } = JSON.parse(msg);
		if (event === CHECK_CONNECTION) {
			const phone = convert11To10(data.phone_number);
			const ott = await models.Ott.findOne({ phone, active: true });

			if (ott) {
				ott.set('zaloInfo.loginInfo', data);
				ott.set('zaloInfo.uid', data.uid);
				ott.set('zaloInfo.connectionType', CONNECTION_TYPE.EXTENSION);

				await ott.save();

				this.clientData = ott;

				const [message] = await ZaloDB.Message()
					.find({
						account: phone,
					})
					.sort({
						sendDttm: -1,
					})
					.limit(1)
					.toArray();

				this.send(
					JSON.stringify({
						event,
						data: {
							lastTime: message
								? Number(message.sendDttm)
								: moment().subtract(30, 'day').toDate().valueOf(),
						},
					})
				);
			}
			return;
		}

		if (event === ON_NEW_MESSAGE) {
			await onNewZaloMsgs(data);
			return;
		}

		if (event === CHECK_EXISTS) {
			await onCheckExists(this.clientData.phone, data);
		}

		if (id) {
			ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_ZALO, {
				type: event,
				data,
				id,
				sender: this.clientData.phone,
				error,
			});
		}
	} catch (e) {
		logger.error('zalo-ext onMessage', e, msg);
	}
}

async function onCheckExists(account, data) {
	if (data && data.exists) {
		const updateData = { ...data };
		if (updateData.phone && updateData.phone.length >= 14) {
			delete updateData.phone;
		}

		await ZaloDB.User().updateOne(
			{
				account,
				'info.userId': data.info.userId,
			},
			{
				$set: updateData,
			},
			{
				upsert: true,
			}
		);
	}
}

async function onNewZaloMsgs(data) {
	const ott = await models.Ott.findOne({ active: true, zalo: true, 'zaloInfo.uid': { $ne: null, $eq: data.sender } });
	if (!ott) {
		return logger.error('ON_NEW_MESSAGE not found ott', data);
	}

	const messages = _.filter(data.messages, m => m && m.msgId).map(m => ({
		account: ott.phone,
		dateString: new Date(Number(m.sendDttm || m.localDttm) || new Date()).toDateMysqlFormat(),
		...m,
	}));

	const users = _.filter(data.users, user => _.get(user, 'info.userId')).map(user => ({
		...user,
		account: ott.phone,
		info: {
			...user.info,
			bizInfo: null,
			bizPkg: null,
		},
	}));

	await ZaloDB.User()
		.bulkWrite(
			users.map(user => ({
				updateOne: {
					filter: {
						'info.userId': user.info.userId,
						account: user.account,
					},
					update: {
						$set: _.pickBy({
							...dot.dot(user),
						}),
					},
					upsert: true,
				},
			}))
		)
		.catch(e => {
			logger.error('onNewZaloMsgs insert user error', e, JSON.stringify(users));
		});

	const rs = await ZaloDB.Message().bulkWrite(
		messages.map(m => ({
			updateOne: {
				filter: {
					msgId: m.msgId,
					account: m.account,
				},
				update: {
					$set: {
						...m,
					},
				},
				upsert: true,
			},
		}))
	);

	const userObjs = _.keyBy(users, 'info.userId');

	logger.info('ON_NEW_MESSAGE', rs.result.upserted.length);

	rs.result.upserted.forEach(u => {
		const message = { ...messages[u.index], _id: u._id };
		ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_ZALO, {
			type: ZALO_SENT,
			sender: ott.phone,
			data: {
				message,
				user: userObjs[message.toUid],
			},
		});
	});
}

async function onWebsocketConnection(ws, wss) {
	try {
		if (!ref.wss) {
			ref.wss = wss;
		}

		ws.on('message', onMessage);
	} catch (e) {
		logger.error('zalo-ext onWebsocketConnection', e);
	}
}

function onNewRequest(data) {
	if (!ref.wss) return;

	const jsonStr = JSON.stringify({
		data: {
			sender: data.sender,
			...data.data,
		},
		id: data.id,
		event: data.type,
	});

	ref.wss.clients.forEach(ws => {
		if (ws.clientData && ws.clientData.phone === data.sender) {
			ws.send(jsonStr);
		}
	});
}

const RELOAD_TIME = 60 * 1000 * 15;

setInterval(function pingReload() {
	if (!ref.wss) return;

	const jsonStr = JSON.stringify({ event: 'RELOAD' });

	ref.wss.clients.forEach(ws => {
		ws.send(jsonStr);
	});
}, RELOAD_TIME);

ottEventEmitter.on(OTT_EVENTS.MESSAGE_REQUEST_ZALO, onNewRequest);

module.exports = {
	onWebsocketConnection,
	path: '/zalo-ext',
};
