const _ = require('lodash');
const fetch = require('@utils/fetch');
const Uri = require('@utils/uri');

const { getHeaders } = require('./helper');

function getUsers(config, query) {
	return fetch(Uri(`https://api.stringee.com/v1/users`, query), {
		headers: getHeaders(config),
	}).then(res => res.json());
}

function findAgent(config, stringee_user_id) {
	return fetch(Uri(`${config.url}/agent`, { stringee_user_id }), {
		headers: getHeaders(config),
	})
		.then(res => res.json())
		.then(data => _.get(data, 'data.agents[0]'));
}

function createAgent(config, data) {
	return fetch(`${config.url}/agent`, {
		method: 'POST',
		headers: getHeaders(config),
		body: JSON.stringify(data),
	})
		.then(res => res.json())
		.then(rs => _.get(rs, 'agentID'));
}

function assignGroup(config, agent) {
	if (_.some(agent.groups, g => g.group_id === config.stringeeGroupId)) {
		return;
	}

	return fetch(`${config.url}/manage-agents-in-group`, {
		method: 'POST',
		headers: getHeaders(config),
		body: JSON.stringify({
			agent_id: agent.id,
			group_id: config.stringeeGroupId,
		}),
	});
}

function getPhoneList(config) {
	return fetch(`${config.url}/number`, {
		headers: getHeaders(config),
	})
		.then(res => res.json())
		.then(rs => _.get(rs, 'data.numbers'));
}

module.exports = {
	getUsers,
	findAgent,
	createAgent,
	assignGroup,
	getPhoneList,
};
