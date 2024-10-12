const { BookingLogs } = require('@utils/const');

const bookingLogsMaping = {
	otaFee: BookingLogs.FEE_OTA_UPDATE,
	roomPrice: BookingLogs.PRICE_UPDATE,
	electricFee: BookingLogs.FEE_ELECTRIC_UPDATE,
	waterFee: BookingLogs.FEE_WATER_UPDATE,
	extraFee: BookingLogs.FEE_SERVICE_UPDATE,
	lateCheckout: BookingLogs.FEE_LATE_CHECKOUT,
	earlyCheckin: BookingLogs.FEE_EARLY_CHECKIN,
	roomUpgrade: BookingLogs.FEE_ROOM_UPGRADE,
	extraPeople: BookingLogs.FEE_EXTRA_PEOPLE,
	compensation: BookingLogs.FEE_COMPENSATION,
	managementFee: BookingLogs.FEE_MANAGEMENT,
	bookingFee: BookingLogs.FEE_BOOKING,
	changeDateFee: BookingLogs.FEE_CHANGE_DATE,
	cleaningFee: BookingLogs.FEE_CLEANING,
	vatFee: BookingLogs.FEE_VAT,
	serviceFee: BookingLogs.FEE_SERVICE,
	internetFee: BookingLogs.FEE_INTERNET,
	minibar: BookingLogs.MINIBAR,
	previousElectricQuantity: BookingLogs.PREVIOUS_ELECTRIC_QUANTITY,
	currentElectricQuantity: BookingLogs.CURRENT_ELECTRIC_QUANTITY,
	electricPricePerKwh: BookingLogs.ELECTRIC_PRICE_PER_KWH,
	previousWaterQuantity: BookingLogs.PREVIOUS_WATER_QUANTITY,
	currentWaterQuantity: BookingLogs.CURRENT_WATER_QUANTITY,
	defaultWaterPrice: BookingLogs.DEFAULT_WATER_PRICE,
	waterPricePerM3: BookingLogs.WATER_PRICE_PER_M3,
	waterFeeCalcType: BookingLogs.WATER_FEE_CALC_TYPE,
	fromHour: BookingLogs.BOOKING_UPDATE_FROM_HOUR,
	toHour: BookingLogs.BOOKING_UPDATE_TO_HOUR,
	otaName: BookingLogs.BOOKING_UPDATE_OTA,
};

module.exports = {
	bookingLogsMaping,
};
