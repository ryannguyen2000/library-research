const { OTAs } = require('@utils/const');

const DEFAULT_MAX_STAR = 5;
const OTA_MAX_STAR = {
	[OTAs.Agoda]: 10,
	[OTAs.Booking]: 10,
	[OTAs.Airbnb]: 5,
	[OTAs.Traveloka]: 10,
};

module.exports = {
	DEFAULT_MAX_STAR,
	OTA_MAX_STAR,
};
