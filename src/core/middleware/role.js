const mongoose = require('mongoose');
const { get } = require('lodash');
const ThrowReturn = require('@core/throwreturn');
const { UserRoles } = require('@utils/const');

function findRoleFromRequest(req) {
	return get(req, 'decoded.user.role') || UserRoles.ANONYMOUS;
}

const stripQueryStrings = url => url.split(/[?#]/)[0];

const getPrefix = resource => resource.slice(0, resource.length - 2);

const urlToArray = url => {
	if (typeof url !== 'string') {
		throw new ThrowReturn('Only string arguments are allowed');
	}
	return url.replace(/^\/+|\/+$/gm, '').split('/');
};

const createRegexFromResource = resource => {
	if (resource.startsWith(':') || resource === '*') {
		return '';
	}
	return `^${resource}$`;
};

const matchUrlToResource = (route, resource) => {
	if (resource === '*') return true;

	//  create an array form both route url and resource
	const routeArray = urlToArray(route);
	const resourceArray = urlToArray(resource);

	for (let key = 0; key < routeArray.length; key++) {
		if (key >= resourceArray.length) return false;

		if (resourceArray[key] === '*') return true;

		if (!routeArray[key].match(createRegexFromResource(resourceArray[key]))) return false;
	}

	if (resourceArray.length > routeArray.length) {
		return resourceArray[routeArray.length] === '*';
	}

	return true;
};

const isAllowed = (method, permission) => {
	const isGlobOrHasMethod =
		permission.methods === '*' || permission.methods.includes('*') || permission.methods.includes(method);
	switch (isGlobOrHasMethod) {
		case true:
			return permission.action === 'allow';
		default:
			return !permission.action === 'allow';
	}
};

function findPermissionForRoute(route, method, policy, prefix = 'api/v1', isSub = false) {
	// Strip query strings from route
	route = stripQueryStrings(route);

	let { resource } = policy;
	// check if route prefix has been specified
	if (prefix) {
		resource = `${prefix}/${resource}`.replace(/\/+/g, '/');
	}

	if (policy.subRoutes && policy.resource !== '*') {
		const currentPrefix = resource.endsWith('/*') ? getPrefix(resource) : resource;

		for (const subRoute of policy.subRoutes) {
			const currentPermission = findPermissionForRoute(route, method, subRoute, currentPrefix, true);
			if (currentPermission) {
				return currentPermission;
			}
		}
	}

	if (matchUrlToResource(route, resource)) {
		if (isSub || isAllowed(method, policy)) {
			return policy;
		}
	}
}

function getPolicies(role) {
	return mongoose.model('RoleGroup').getRole(role);
}

function deny() {
	throw new ThrowReturn().status(403);
}

async function authorize(req, res, next) {
	if (!get(req.decoded, 'user')) {
		return next();
	}
	// find role
	const role = findRoleFromRequest(req);
	// find policies
	const policies = await getPolicies(role);

	// find permission
	for (const policy of policies) {
		const permission = findPermissionForRoute(req.originalUrl, req.method, policy, policy.prefix);
		if (permission && isAllowed(req.method, permission)) {
			return next();
		}
	}

	return deny(res);
}

module.exports = {
	authorize,
	deny,
};
