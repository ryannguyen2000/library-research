const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
const {
	Currency,
	MessageAutoType,
	AutoEvents,
	Services,
	OTTs,
	MessageVariable,
	FEE_TITLE,
	EXTRA_FEE,
	WATER_FEE_CALC_TYPE,
	PayoutCollectStatus,
} = require('@utils/const');

const models = require('@models');
const { getPromotionPrice } = require('@controllers/promotion/promotion.config');
const messageOTT = require('@controllers/message/ott');
const { bookingLogsMaping } = require('@controllers/booking/const');

async function sendAutoMessages(booking, prices, phone) {
	try {
		const EXTRA_FEE_ARR = _.values(EXTRA_FEE);

		const template = await models.ChatAutomatic.findOne({
			event: AutoEvents.Updated,
			groupIds: booking.groupIds[0],
			autoType: MessageAutoType.GUEST,
			template: 'priceUpdating',
		});

		if (!template) throw new ThrowReturn().status(404);

		const types = new Set();
		const messages = template.contents.map(content => {
			let rs = content.content;

			if (rs.includes(MessageVariable.DATE.text)) {
				const createdAt = moment().format('DD/MM/YYYY');
				rs = rs.replaceAll(MessageVariable.DATE.text, createdAt);
			}
			if (rs.includes(MessageVariable.UPDATING_PRICE_LIST_VI.text)) {
				let updatingContentEN = '';
				let updatingContentVI = '';
				_.forIn(prices, (room, roomNo) => {
					updatingContentVI += ` - Phòng ${roomNo}:\n`;
					updatingContentEN += ` - Room ${roomNo}:\n`;
					_.forIn(room, ({ newPrice, prevPrice, ...arg }, key) => {
						if (!_.includes(EXTRA_FEE_ARR, key)) return;

						types.add(key);
						const prevPriceTitle = `${(Number(prevPrice) || 0).toLocaleString()} ${Currency.VND} `;
						const newPriceTitle = `${(Number(newPrice) || 0).toLocaleString()} ${Currency.VND}`;

						if (_.includes(['electricFee', 'waterFee'], key)) {
							let unit = key === 'electricFee' ? 'kWh' : 'm3';
							updatingContentVI += `  + ${
								_.get(FEE_TITLE, `${key}.vi`) || ''
							}: ${prevPriceTitle} -> ${newPriceTitle}, Số lượng: ${arg.prevQuantity} ${unit} -> ${
								arg.newQuantity
							} ${unit}\n`;
							updatingContentEN += `  + ${
								_.get(FEE_TITLE, `${key}.en`) || ''
							}: ${prevPriceTitle} -> ${newPriceTitle}, Quantity: ${arg.prevQuantity} ${unit} -> ${
								arg.newQuantity
							} ${unit}\n`;
						} else {
							updatingContentVI += `  + ${
								_.get(FEE_TITLE, `${key}.vi`) || ''
							}: ${prevPriceTitle} -> ${newPriceTitle}\n`;
							updatingContentEN += `  + ${
								_.get(FEE_TITLE, `${key}.en`) || ''
							}: ${prevPriceTitle} -> ${newPriceTitle}\n`;
						}
					});
				});

				rs = rs.replaceAll(MessageVariable.UPDATING_PRICE_LIST_VI.text, updatingContentVI);
				rs = rs.replaceAll(MessageVariable.UPDATING_PRICE_LIST_EN.text, updatingContentEN);
			}
			return rs;
		});

		const ottMessages = [];
		await messages.asyncForEach(async msg => {
			const { message } = await messageOTT.sendOTTMessage({
				ottName: OTTs.Zalo,
				phone,
				text: msg,
				messageId: booking.messages,
				groupId: booking.groupIds,
				blockId: booking.blockId,
			});
			const _ottMsg = {
				ottName: OTTs.Zalo,
				ottPhone: phone,
				bookingId: booking._id,
				messageId: message.messageId,
				type: [...types],
			};
			ottMessages.push(_ottMsg);
		});

		await models.FeeAutoMessage.insertMany(ottMessages);
	} catch (err) {
		logger.error('updating message error', err);
	}
}

async function updateBookingPrice({ user, booking, prices, isSendMsg }) {
	if (!prices || !prices.length) {
		throw new ThrowReturn(`No data for update!`);
	}

	const ingoreKeys = ['otaFee', 'otaName', 'fromHour', 'toHour'];

	const priceKeys = _.keys(bookingLogsMaping).filter(k => !ingoreKeys.includes(k));
	const bookingId = booking._id;
	const userId = user._id;
	const priceUpdatingMessages = {};

	const reservates = await models.Reservation.find({ bookingId }).populate('roomId', 'info.roomNo');

	let updated = false;
	let updatedKeys = new Set();
	let manual;
	let logs = [];

	await prices.asyncForEach(async ({ roomId, reasonId, reasonOther, ...item }) => {
		const reservate = reservates.find(r => r.roomId._id.equals(roomId));
		if (!reservate && !booking.reservateRooms.includesObjectId(roomId)) {
			throw new ThrowReturn(`Not found Room ${roomId} for Booking ${bookingId}`);
		}

		const resData = reservate || booking;

		if (isSendMsg && reservate) {
			const oldPrevElectricQuantity = resData.previousElectricQuantity || 0;
			const oldCurrentElectricQuantity = resData.currentElectricQuantity || 0;
			const oldPrevWaterQuantity = resData.previousWaterQuantity || 0;
			const oldCurrentWaterQuantity = resData.currentWaterQuantity || 0;

			_.set(priceUpdatingMessages, `${reservate.roomId.info.roomNo}.electricFee`, {
				prevPrice: reservate.calcElectricFee(),
				prevQuantity: oldCurrentElectricQuantity - oldPrevElectricQuantity,
			});
			_.set(priceUpdatingMessages, `${reservate.roomId.info.roomNo}.waterFee`, {
				prevPrice: reservate.waterFee,
				prevQuantity: oldCurrentWaterQuantity - oldPrevWaterQuantity,
			});
		}

		let updatedRoom = false;

		_.entries(item).forEach(([priceKey, newPrice]) => {
			const action = bookingLogsMaping[priceKey];
			const prevPrice = (reservate ? reservate[priceKey] : booking[priceKey]) || 0;
			newPrice = newPrice || 0;

			if (action && prevPrice !== newPrice) {
				updated = true;
				updatedRoom = true;
				updatedKeys.add(priceKey);

				if (priceKey === 'roomPrice') {
					manual = true;
				}

				if (isSendMsg && reservate) {
					_.set(priceUpdatingMessages, `${reservate.roomId.info.roomNo}.${priceKey}`, {
						newPrice,
						prevPrice,
					});
				}

				const prevData = `${reservate ? `${reservate.roomId.info.roomNo}: ` : ''}${prevPrice}`;
				if (reservate) {
					reservate[priceKey] = newPrice;
				} else {
					booking[priceKey] = newPrice;
				}

				logs.push({
					by: userId,
					action,
					prevData,
					data: newPrice,
					roomId,
					reasonId,
					reasonOther,
					priceKey,
				});
			}
		});

		if (updatedRoom && reservate) {
			await reservate.save();
		}
	});

	if (updated) {
		if (reservates.length) {
			priceKeys.forEach(key => {
				if (!['waterFeeCalcType', 'waterPricePerM3', 'electricPricePerKwh'].includes(key)) {
					booking[key] = _.sumBy(reservates, key);
				}
				if (key === 'waterFeeCalcType') {
					const waterFeeCalcType = _.get(prices, '0.waterFeeCalcType');
					if (waterFeeCalcType && booking.serviceType === Services.Month) booking[key] = waterFeeCalcType;
				}

				if (isSendMsg) {
					if (key === 'electricFee') {
						reservates.forEach(reservation => {
							const _key = _.get(reservation, 'roomId.info.roomNo') || '';
							const prevPrice = _.get(priceUpdatingMessages, `${_key}.electricFee.prevPrice`) || 0;
							const newPrice = reservation[key];

							if (prevPrice !== newPrice) {
								const newPrevQuantity = reservation.previousElectricQuantity || 0;
								const newCurrentQuantity = reservation.currentElectricQuantity || 0;

								_.set(priceUpdatingMessages, `${_key}.electricFee.newPrice`, newPrice);
								_.set(
									priceUpdatingMessages,
									`${_key}.electricFee.newQuantity`,
									newCurrentQuantity - newPrevQuantity
								);
							} else {
								_.unset(priceUpdatingMessages, `${_key}.electricFee`);
							}
						});
					}

					if (key === 'waterFee') {
						reservates.forEach(reservation => {
							const _key = _.get(reservation, 'roomId.info.roomNo');
							const newCurrentQuantity = _.get(reservation, 'currentWaterQuantity') || 0;
							const newPrevQuantity = _.get(reservation, 'previousWaterQuantity') || 0;
							const prevPrice = _.get(priceUpdatingMessages, `${_key}.waterFee.prevPrice`) || 0;
							const newPrice = reservation[key];

							if (prevPrice !== newPrice) {
								_.set(priceUpdatingMessages, `${_key}.waterFee.newPrice`, newPrice);
								_.set(
									priceUpdatingMessages,
									`${_key}.waterFee.newQuantity`,
									newCurrentQuantity - newPrevQuantity
								);
							} else {
								_.unset(priceUpdatingMessages, `${_key}.waterFee`);
							}
						});
					}
				}
			});
		}

		if (booking.serviceType === Services.Month) {
			if (booking.waterFeeCalcType === WATER_FEE_CALC_TYPE.QUANTITY) {
				booking.waterPricePerM3 =
					booking.waterFee / (booking.currentWaterQuantity - booking.previousWaterQuantity) || 0;
			}
			booking.electricPricePerKwh =
				booking.electricFee / (booking.currentElectricQuantity - booking.previousElectricQuantity) || 0;
		}

		if (manual) {
			booking.manual = true;
		}

		await logs.asyncForEach(async ({ roomId, reasonId, reasonOther, priceKey, ...log }) => {
			if (reasonId) {
				const requestDoc = await models.BookingUserRequest.create({
					bookingId: booking._id,
					roomId,
					reasonId,
					reasonOther,
					requestData: [
						{
							key: priceKey,
							value: log.data,
						},
					],
					status: PayoutCollectStatus.Confirmed,
					createdBy: userId,
					approvedBy: userId,
					approvedAt: new Date(),
				}).catch(e => {
					logger.error(e);
				});
				if (requestDoc) log.requestId = requestDoc._id;
			}
			booking.addLog(log);
		});

		await booking.save();
	}

	if (isSendMsg && updated) {
		const guest = await models.Guest.findById(booking.guestId).select('phone ottIds').lean();
		const phone = _.get(guest, 'phone') || _.get(guest, `ottIds.${OTTs.Zalo}`);

		try {
			await sendAutoMessages(booking, priceUpdatingMessages, phone);
		} catch (err) {
			logger.error(err);
		}
	}

	return { booking: _.pick(booking, [...updatedKeys]) };
}

async function calcFormula({ formula, roomId, booking, newBlockId, newRoomId, newFrom, newTo }) {
	try {
		roomId = roomId || booking.reservateRooms[0];

		const varsList = [
			{
				varName: '%CURRENT_PRICE_CHECKIN_DAY%',
				checkIn: booking.from,
			},
			{
				varName: '%CURRENT_PRICE_CHECKOUT_DAY%',
				checkIn: booking.to,
			},
			{
				varName: '%NEW_ROOM_PRICE%',
				roomIds: [newRoomId || roomId],
				blockId: newBlockId,
				checkIn: new Date(newFrom || booking.from).zeroHours(),
				checkOut: new Date(newTo || booking.to).zeroHours(),
			},
		];

		await varsList.asyncMap(async svar => {
			let price = 0;

			const listings = await models.Listing.getLocalListings({ roomIds: svar.roomIds || [roomId] });
			if (listings && listings.length) {
				const { promoPrice, defaultPrice } = await getPromotionPrice({
					blockId: svar.blockId || booking.blockId,
					otaListingId: listings[0].ota.otaListingId,
					roomTypeId: listings[0].roomTypeId,
					roomIds: listings[0].roomIds,
					checkIn: svar.checkIn,
					checkOut: svar.checkOut,
					ratePlanId: _.get(booking.ratePlan, 'id'),
				});
				price = promoPrice || defaultPrice || 0;
			}

			formula = formula.replaceAll(svar.varName, price);
		});

		if (formula.includes('%ROOM_PRICE%')) {
			const res = await models.Reservation.findOne({ bookingId: booking._id, roomId }).select('roomPrice');
			formula = formula.replaceAll('%ROOM_PRICE%', res ? res.roomPrice : booking.roomPrice);
		}

		// eslint-disable-next-line no-eval
		const rs = eval(formula);

		return rs;
	} catch (e) {
		logger.error('calcFormula', formula, e);
	}
}

async function checkPrice({ booking, serviceType, ...params }) {
	let amount;

	if (serviceType === EXTRA_FEE.VAT_FEE) {
		const priceWithoutVAT = booking.price - (booking[serviceType] || 0);
		amount = _.round(priceWithoutVAT * (Settings.VATFee.value / 100));
	} else {
		const serviceConfig =
			(await models.ServiceFeeConfig.findOne({ serviceTypes: serviceType, blockIds: booking.blockId })) ||
			(await models.ServiceFeeConfig.findOne({ serviceTypes: serviceType, blockIds: { $in: [null, []] } }));

		if (serviceConfig) {
			amount = await calcFormula({
				formula: serviceConfig.formula,
				booking,
				...params,
			});
		}
	}

	return {
		serviceType,
		amount,
	};
}

module.exports = {
	updateBookingPrice,
	checkPrice,
};
