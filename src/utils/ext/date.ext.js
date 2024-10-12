// //Date extension

// function twoDigits(d) {
//     if (0 <= d && d < 10) return "0" + d.toString();
//     if (-10 < d && d < 0) return "-0" + (-1 * d).toString();
//     return d.toString();
// }

// /**
//  * To Mysql format 'YYYY-mm-dd HH:ii:ss'
//  */
// Date.prototype.toMysqlFormat = function () {
//     return this.getFullYear()
//         + "-"
//         + twoDigits(1 + this.getMonth())
//         + "-"
//         + twoDigits(this.getDate())
//         + " "
//         + twoDigits(this.getHours())
//         + ":"
//         + twoDigits(this.getMinutes())
//         + ":"
//         + twoDigits(this.getSeconds());
// };

/**
 * To Mysql format 'YYYY-mm-dd'
 */
Date.prototype.toDateMysqlFormat = function () {
	const d = new Date(this);
	let month = (d.getMonth() + 1).toString();
	let day = d.getDate().toString();
	const year = d.getFullYear();

	if (month.length < 2) month = `0${month}`;
	if (day.length < 2) day = `0${day}`;

	return [year, month, day].join('-');
	// return this.toJSON().slice(0, 10);
};

// /**
//  * Override `toJSON` with mysql format 'YYYY-mm-dd HH:ii:ss'
//  */
// Date.prototype.toJSON = function () {
//     return this.toMysqlFormat();
// }

// /**
//  * get first date of week
//  */
// Date.firstDateOfWeek = function () {
//     let curr = new Date();
//     let first = curr.getDate() - curr.getDay();

// }

// /**
//  * Convert Date to String with format 'YYYYmmddHHiiss'
//  */
// Date.prototype.YYYYmmddHHiiss = function () {
//     let mm = this.getMonth() + 1;
//     mm = mm < 10 ? '0' + mm : mm;
//     let dd = this.getDate();
//     dd = dd < 10 ? '0' + dd : dd;
//     let HH = this.getHours();
//     HH = HH < 10 ? '0' + HH : HH;
//     let ii = this.getMinutes();
//     ii = ii < 10 ? '0' + ii : ii;
//     let ss = this.getSeconds();
//     ss = ss < 10 ? '0' + ss : ss;
//     return `${this.getFullYear()}${mm}${dd}${HH}${ii}${ss}`;
// }

/**
 * Calculate diff days
 */
Date.prototype.diffDays = function (date) {
	return Math.round(Math.abs(date - this) / (1000 * 60 * 60 * 24));
};

Date.prototype.zeroHours = function () {
	// this.setUTCHours(0, 0, 0, 0); // this.toJSON().slice(0, 10); // this.setHours(0, 0, 0, 0);
	this.setHours(7, 0, 0, 0);
	return this;
};

Date.prototype.maxTimes = function () {
	this.setHours(23, 59, 59, 0);
	return this;
};

Date.prototype.minTimes = function () {
	this.setHours(0, 0, 0, 0);
	return this;
};

// /**
//  * Calculate week of year
//  */
// Date.weekOfYear = function(d) {
// 	// Copy date so don't modify original
//     d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
//     // Set to nearest Thursday: current date + 4 - current day number
//     // Make Sunday's day number 7
//     d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
//     // Get first day of year
//     var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
//     // Calculate full weeks to nearest Thursday
//     return Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
// }
