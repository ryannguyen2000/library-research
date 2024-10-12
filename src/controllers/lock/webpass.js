const moment = require('moment');
const mongoose = require('mongoose');
const cheerio = require('cheerio');
const _ = require('lodash');
const models = require('@models');

const fetch = require('@utils/fetch');
const { DOOR_LOCK_TYPE } = require('@utils/const');
const { logger } = require('@utils/logger');

const MAX_RETRY = 3;

function generateUrl(endPoint, query) {
	return `${endPoint}/if.cgi?redirect=EmpRcd.htm&failure=fail.htm&type=user_data&creg=0&num=&EmployeeID=${
		query.EmployeeID
	}&MarkID=${query.MarkID}&CardID=${query.CardID}&username=${encodeURIComponent(
		query.username
	)}&Card_Valid=0&SY=2009&SM=5&SD=30&sy_h=20&sy_m=39&EY=2009&EM=5&ED=30&sy_h=20&sy_m=39&Activate=5&Usertype=0&group_list1=1&group_list2=1&group_list3=1&group_list4=1&Verify=1&Password=${
		query.Password
	}&Retype=${query.Retype}`;
}

function generateHeader(user, pass) {
	return {
		Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
	};
}

async function requestUpdate(endPoint, userLogin, passLogin, code, EmployeeID, MarkID, CardID, username = '') {
	const headers = generateHeader(userLogin, passLogin);
	const query = {
		Password: code,
		Retype: code,
		EmployeeID,
		MarkID,
		CardID,
		username,
	};
	const url = generateUrl(endPoint, query);
	try {
		const res = await fetch(url, {
			headers,
		});
		const rs = await res.text();
		if (rs && rs.includes('Modify OK')) {
			return true;
		}
		return false;
	} catch (e) {
		logger.error(e);
		return false;
	}
}

async function updateCode({ config, data, newCode, room, index = 0 }) {
	const { url, username, password } = config;
	const { no, userID, cardNo } = data;

	if (data.code === newCode) return;

	async function update(reTry = 0) {
		const ok = await requestUpdate(
			url,
			username,
			password,
			newCode,
			no,
			userID,
			cardNo,
			`${room.info.roomNo}_${index + 1}`
		);
		if (ok) {
			return;
		}
		if (reTry < MAX_RETRY) {
			await Promise.delay(2000);
			await update(reTry + 1);
		} else {
			throw new Error('Max retry!');
		}
	}

	await update();
}

function getDataFromHtml(html) {
	const $ = cheerio.load(html);
	const items = [];

	$('#table_1 > tbody tr').each(function (index, element) {
		const $$ = $(element);
		if (!$$.attr('bgcolor')) return;
		const item = {};
		$$.children('td').each(function (i, tdEl) {
			if (i === 1) [item.userId] = $(tdEl).text().match(/\d+/) || [];
			if (i === 3) item.date = $(tdEl).text();
			if (i === 4) item.time = $(tdEl).text();
			if (i === 7) item.type = $(tdEl).text().replace(/\(|\)/g, '');
		});
		item.time = moment(`${item.date} ${item.time}`, 'MM/DD/Y HH:mm:ss').toDate();
		delete item.date;
		items.push(item);
	});
	return items;
}

function getDateUri(date) {
	return `year=${date.format('YY')}&mon=${date.format('MM')}&day=${date.format('DD')}`;
}

async function fetchAccessLogs({ url, username, password, from, to, userId }) {
	if (!from) from = moment();
	if (!to) to = moment();

	const uri = `${url}/if.cgi?${[
		'redirect=UserLog.htm',
		'failure=fail.htm',
		'type=search_user_log&type=0',
		'sel=1',
		`u_id=${userId || ''}`,
		'even=0&even=0&even=0&even=0&even=0',
		getDateUri(from),
		getDateUri(to),
		'card=0&card=0&card=0&card=0&card=0&card=0&card=0&card=0',
		'fun_t=0&e_t=0',
	].join('&')}`;

	const html = await fetch(uri, {
		headers: generateHeader(username, password),
	}).then(res => res.text());

	return getDataFromHtml(html);
}

async function getAccessLogHistory({ from, to, ...query }, user) {
	if (from) _.set(query, 'time.$gte', new Date(from));
	if (to) _.set(query, 'time.$lte', new Date(to));

	delete query.start;
	delete query.limit;

	const users = await models.User.find(
		{ enable: true, groupIds: { $in: user.groupIds } },
		{ webPassIds: 1, name: 1, role: 1 }
	);
	const webpassIds = users
		.map(item => {
			return item.webPassIds;
		})
		.flat();

	const doorAccessLogs = await models.DoorAccessLog.aggregate([
		{ $match: { userId: { $in: webpassIds }, ...query } },
		{
			$group: {
				_id: {
					userId: '$userId',
					dates: { $dateToString: { format: '%d-%m-%Y', date: '$time', timezone: '+07:00' } },
				},
				start: { $min: '$time' },
				end: { $max: '$time' },
				logs: {
					$push: {
						blockId: '$blockId',
						time: '$time',
					},
				},
			},
		},
		{
			$lookup: {
				from: 'block',
				let: { blockId: '$logs.blockId' },
				pipeline: [
					{ $match: { $expr: { $in: ['$_id', '$$blockId'] } } },
					{ $project: { 'info.shortName': 1 } },
				],
				as: 'blocks',
			},
		},
	]);

	const logs = _.compact(
		_.map(users, userInfo => {
			if (!userInfo.webPassIds.length) return;
			const mappers = userInfo.webPassIds.map(webPass => {
				return doorAccessLogs.filter(log => log._id.userId === webPass);
			});
			// eslint-disable-next-line no-useless-concat
			const title = `${userInfo.name}` + ` ${userInfo.webPassIds.join(' ')}`;

			const dates = _.entries(_.groupBy(_.flatMap(mappers), '_id.dates')).map(([key, value]) => {
				const { minStart, maxEnd, startBlock, endBlock } = value.reduce(
					(acc, item) => {
						const start = new Date(item.start);
						const end = new Date(item.end);
						if (start < acc.minStart) {
							acc.minStart = start;
						}

						if (end > acc.maxEnd) {
							acc.maxEnd = end;
						}

						if (item.blocks.length > 1) {
							const [hourBlockStart, hourBlockEnd] = item.logs.filter(log => {
								const logTime = new Date(log.time);
								return logTime.getTime() === start.getTime() || logTime.getTime() === end.getTime();
							});
							acc.startBlock = item.blocks.find(info => {
								return info._id.toString() === hourBlockStart.blockId.toString();
							});
							acc.endBlock = item.blocks.find(info => {
								return info._id.toString() === hourBlockEnd.blockId.toString();
							});
						} else {
							acc.startBlock = _.head(item.blocks);
							acc.endBlock = _.head(item.blocks);
						}
						return acc;
					},
					{
						minStart: new Date(value[0].start),
						maxEnd: new Date(value[0].end),
					}
				);
				return { date: key, minStart, maxEnd, startBlock, endBlock };
			});
			return { title, userInfo, dates };
		})
	);
	return { logs };
}

module.exports = {
	updateCode,
	fetchAccessLogs,
	getAccessLogHistory,
};
