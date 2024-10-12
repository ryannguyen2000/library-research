function isEmail(email) {
	return !!email && new RegExp('^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$').test(email);
}

module.exports = {
	isEmail,
};
