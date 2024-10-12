// const fetch = require('@utils/fetch');
// const { logger } = require('@utils/logger');
// const { generateToken } = require('./helper');
// const { number, uri, groupName, queueName, listAgentsUrl } = require('./const');

// const headers = {
// 	'X-STRINGEE-AUTH': generateToken().token,
// 	'Content-Type': 'application/json',
// };

// async function getGroup() {
// 	const result = await fetch(`${uri}/group`, {
// 		method: 'GET',
// 		headers,
// 	}).then(res => res.json());
// 	if (result.r === 0) {
// 		return result.data.groups.find(group => group.name === groupName);
// 	}
// 	return null;
// }

// async function createGroup() {
// 	const rs = await getGroup();
// 	if (rs) return rs;
// 	const result = await fetch(`${uri}/group`, {
// 		method: 'POST',
// 		headers,
// 		body: JSON.stringify({
// 			name: groupName,
// 		}),
// 	}).then(res => res.json());
// 	if (result.r === 0) {
// 		return {
// 			id: result.groupID,
// 			name: groupName,
// 		};
// 	}
// 	throw new Error(result.message);
// }

// async function getQueue() {
// 	const result = await fetch(`${uri}/queue`, {
// 		method: 'GET',
// 		headers,
// 	}).then(res => res.json());
// 	if (result.r === 0) {
// 		await updateQueue({ get_list_agents_url: listAgentsUrl });
// 		return result.data.queues.find(queue => queue.name === queueName);
// 	}
// 	return null;
// }

// async function createQueue() {
// 	const rs = await getQueue();
// 	if (rs) return rs;
// 	const result = await fetch(`${uri}/queue`, {
// 		method: 'POST',
// 		headers,
// 		body: JSON.stringify({
// 			name: queueName,
// 			get_list_agents_url: listAgentsUrl,
// 		}),
// 	}).then(res => res.json());
// 	if (result.r === 0) {
// 		return {
// 			id: result.queueID,
// 			name: queueName,
// 		};
// 	}
// 	throw new Error(result.message);
// }

// async function updateQueue(data) {
// 	await fetch(`${uri}/queue`, {
// 		method: 'PUT',
// 		headers,
// 		body: JSON.stringify(data),
// 	}).catch(e => {
// 		logger.error('stringee updateQueue error', e);
// 	});
// }

// async function groupRouting(group_id, queue_id) {
// 	await fetch(`${uri}/routing-call-to-groups`, {
// 		method: 'POST',
// 		headers,
// 		body: JSON.stringify({
// 			queue_id,
// 			group_id,
// 			primary_group: 1,
// 		}),
// 	});
// }

// async function createNumber(queue_id) {
// 	await fetch(`${uri}/number`, {
// 		method: 'POST',
// 		headers,
// 		body: JSON.stringify({
// 			number,
// 			nickname: number,
// 			allow_outbound_calls: true,
// 			enable_ivr: false,
// 			queue_id,
// 			record_outbound_calls: true,
// 		}),
// 	});
// }

// async function init() {
// 	try {
// 		const group = await createGroup();
// 		const queue = await createQueue();
// 		await groupRouting(group.id, queue.id);
// 		await createNumber(queue.id);
// 	} catch (e) {
// 		logger.error('init stringee error', e);
// 	}
// }

module.exports = {
	// getGroup,
};
