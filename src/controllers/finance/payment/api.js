const _ = require('lodash');
const moment = require('moment');
const AsyncLock = require('async-lock');

const ThrowReturn = require('@core/throwreturn');
const {
	BookingStatus,
	PAYMENT_CHARGE_STATUS,
	OTAs,
	ThirdPartyPayment,
	ThirdPartyPaymentStatus,
	PayoutSources,
	PAYMENT_CARD_STATUS,
	PAYMENT_CHARGE_TYPE,
	PayoutType,
} = require('@utils/const');
const { getArray } = require('@utils/query');
const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS, SERVICES_EVENTS, SERVICES_EVENT_TYPES, serviceEventEmitter } = require('@utils/events');

const Kovena = require('@services/payment/kovena');
const models = require('@models');
const Card = require('./card');

const queueLock = new AsyncLock();

async function getParams(query, user) {
	let {
		blockId,
		roomIds,
		from,
		to,
		start,
		limit,
		status,
		sort,
		desc,
		otaBookingId,
		excludeBlockId,
		cardStatus,
		chargedStatus,
	} = query;

	otaBookingId = _.trim(otaBookingId);
	sort = sort || 'createdAt';
	desc = desc || '1';
	from = from && new Date(from).minTimes();
	to = to && new Date(to).maxTimes();

	const { filters: roleFilters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
		roomKey: 'reservateRooms',
	});

	const filter = {
		$and: [
			roleFilters,
			{
				otaName: OTAs.Booking,
				'rateDetail.isNonRefundable': true,
				error: 0,
			},
		],
	};

	if (otaBookingId) {
		filter.$and.push({
			otaBookingId: _.toUpper(otaBookingId),
		});
	}
	if (cardStatus) {
		const statusArr = _.isArray(cardStatus) ? cardStatus : [cardStatus];
		if (_.includes(statusArr, PAYMENT_CARD_STATUS.NO_INFO)) {
			statusArr.push(null);
		}

		filter.$and.push({ 'paymentCardState.status': { $in: statusArr } });
	}
	if (chargedStatus) {
		const statusArr = _.isArray(chargedStatus) ? chargedStatus : [chargedStatus];
		if (_.includes(statusArr, PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE)) {
			statusArr.push(null);
		}

		filter.$and.push({ 'paymentCardState.chargedStatus': { $in: statusArr } });
	} else {
		filter.$and.push({
			'paymentCardState.chargedStatus': {
				$in: [null, PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE, PAYMENT_CHARGE_STATUS.ERROR],
			},
			paid: 0,
		});
	}

	if (roomIds) {
		filter.$and.push({
			reservateRooms: { $in: getArray(roomIds).toMongoObjectIds() },
		});
	}

	const andCondition = [];
	const dateQuery = [];
	const statusQuery = [];

	if (status) {
		if (status.includes(BookingStatus.REQUEST)) {
			statusQuery.push({ status: BookingStatus.REQUEST });
		}
		if (status.includes(BookingStatus.CANCELED)) {
			statusQuery.push({ status: BookingStatus.CANCELED });
		}
		if (status.includes(BookingStatus.REQUEST)) {
			statusQuery.push({ status: BookingStatus.REQUEST });
		}
		if (status.includes(BookingStatus.CHARGED)) {
			statusQuery.push({ status: BookingStatus.CHARGED });
		}
		if (status.includes(BookingStatus.CONFIRMED)) {
			statusQuery.push({ status: BookingStatus.CONFIRMED });
		}
		if (status.includes(BookingStatus.NOSHOW)) {
			statusQuery.push({ status: BookingStatus.NOSHOW });
		}
	}

	const timeFilter = _.pickBy({ $gte: from, $lte: to });

	if (from || to) {
		dateQuery.push({ createdAt: timeFilter }, { from: timeFilter }, { to: timeFilter });
	}

	if (statusQuery.length) andCondition.push({ $or: statusQuery });
	if (dateQuery.length) andCondition.push({ $or: dateQuery });
	if (andCondition.length) filter.$and = [...filter.$and, ...andCondition];

	const params = {
		start,
		limit,
		filter,
	};

	params.sorter = {
		[sort]: desc === '1' ? -1 : 1,
	};

	return params;
}

async function getChargeBookings(query, user) {
	const { filter, sorter, start, limit } = await getParams(query, user);

	const populate = [
		{
			path: 'guestId',
			select: 'name fullName displayName avatar tags',
		},
		{
			path: 'blockId',
			select: 'info.name info.shortName OTAProperties',
		},
		{
			path: 'reservateRooms',
			select: 'info.name info.roomNo',
		},
		{
			path: 'listingId',
			select: 'blockId',
			populate: {
				path: 'blockId',
				select: 'OTAProperties',
			},
		},
		{
			path: 'paymentCardState.markedBy',
			select: 'name',
		},
	];

	const [bookings, total] = await Promise.all([
		models.Booking.find(filter)
			.sort(sorter)
			.skip(start)
			.limit(limit)
			.populate(populate)
			.select(
				'blockId listingId guestId reservateRooms otaBookingId otaName price roomPrice paid status from to paymentCardState createdAt'
			)
			.lean(),
		models.Booking.countDocuments(filter),
	]);

	bookings.forEach(booking => {
		const otas = _.get(booking.listingId, 'blockId.OTAProperties') || _.get(booking.blockId, 'OTAProperties');
		const ota = _.find(otas, o => o.otaName === booking.otaName);

		if (!_.has(booking, 'paymentCardState.status')) {
			_.set(booking, 'paymentCardState.status', PAYMENT_CARD_STATUS.NO_INFO);
		}

		if (!_.has(booking, 'paymentCardState.chargedStatus')) {
			_.set(booking, 'paymentCardState.chargedStatus', PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE);
		}

		if (ota && ota.propertyId) {
			booking.extranetUrl = `https://secure-admin.booking.com/booking_cc_details.html?bn=${booking.otaBookingId}&has_bvc=0&extranet_lang=xu&lang=xu&hotel_id=${ota.propertyId}`;
		}
	});

	return {
		bookings,
		total,
	};
}

async function getBookingCard(booking) {
	const card = await models.GuestCard.findOne({
		otaBookingId: booking.otaBookingId,
		otaName: booking.otaName,
		deleted: false,
	});

	if (!card) {
		throw new ThrowReturn('Không tìm thấy thông tin thẻ!');
	}

	return {
		cardInfo: card.getPublicCardInfo(),
	};
}

async function createBookingCard(booking, body, user) {
	let card = await models.GuestCard.findOne({
		otaBookingId: booking.otaBookingId,
		otaName: booking.otaName,
		deleted: false,
	});

	if (card && card.status === PAYMENT_CARD_STATUS.VALID) {
		throw new ThrowReturn('Thông tin thẻ đã tồn tại!');
	}

	let { cardInfo } = body;

	const newCardInfo = models.GuestCard.encryptCardInfo(cardInfo);

	if (card && card.cardInfo) {
		if (card.cardInfo !== newCardInfo) {
			card.deleted = true;
			card.deletedBy = _.get(user, '_id');
			await card.save();
		}

		const prevCardInfo = models.GuestCard.decryptCardInfo(card.cardInfo);

		cardInfo = {
			...prevCardInfo,
			...cardInfo,
		};
	}

	const isErrorCard = !cardInfo.cardNumber || !cardInfo.cardName || !cardInfo.expirationDate || !cardInfo.cvc;
	const cardStatus = isErrorCard ? PAYMENT_CARD_STATUS.INVALID : PAYMENT_CARD_STATUS.UNKNOWN;

	if (card && !card.deleted) {
		card.cardInfo = newCardInfo;
		card.cardStatus = cardStatus;

		await card.save();
	} else {
		card = await models.GuestCard.create({
			otaBookingId: booking.otaBookingId,
			otaName: booking.otaName,
			createdBy: user ? user._id : null,
			cardInfo: newCardInfo,
			cardStatus,
		});
	}

	return {
		card,
	};
}

async function retrieveBookingCard(booking, user) {
	const card = await Card.getCardInfo(booking, user);

	return {
		cardInfo: card.getPublicCardInfo(),
	};
}

async function markInvalidCard(booking, user) {
	if (_.get(booking.paymentCardState, 'markedInvalid')) {
		throw new ThrowReturn('Đã báo lỗi trước đó!');
	}

	const data = await Card.markBookingCardInvalid({ booking, user });

	return data;
}

async function findOrCreatePaymentRef(booking, amount, user) {
	const filter = {
		method: ThirdPartyPayment.KOVENA,
		otaName: booking.otaName,
		otaBookingId: booking.otaBookingId,
		amount,
		status: ThirdPartyPaymentStatus.WAITING,
		createdBy: user ? user._id : null,
	};

	const prevRef = await models.PaymentRef.findOne(filter);

	if (prevRef) {
		return prevRef;
	}

	const orderInfo = `Payment for Booking ID ${booking.otaBookingId}`;

	return models.PaymentRef.createRef({
		...filter,
		description: orderInfo,
		groupIds: booking.groupIds,
		blockId: booking.blockId,
	});
}

async function chargeBookingCard(booking, body, user) {
	const guestCard = await models.GuestCard.findOne({
		otaName: booking.otaName,
		otaBookingId: booking.otaBookingId,
		deleted: false,
	});

	if (!guestCard || (!guestCard.cardToken && !guestCard.cardInfo)) {
		throw new ThrowReturn('Không tìm thấy thông tin thẻ của đặt phòng!');
	}
	if (guestCard.cardStatus === PAYMENT_CARD_STATUS.INVALID) {
		throw new ThrowReturn('Thông tin thẻ của đặt phòng không hợp lệ!');
	}

	const chargeType = body.chargeType || PAYMENT_CHARGE_TYPE.FIRST_NIGHT;

	const dataPayment = await models.Booking.getPayment({
		otaName: booking.otaName,
		otaBookingId: booking.otaBookingId,
		firstNight: chargeType === PAYMENT_CHARGE_TYPE.FIRST_NIGHT,
	});
	if (!dataPayment.amount) {
		throw new ThrowReturn('Không tìm thấy thông tin cần thanh toán!');
	}

	if (body.amount && (body.amount < 0 || body.amount > dataPayment.amount)) {
		throw new ThrowReturn('Số tiền thanh toán không hợp lệ!');
	}

	if (!booking.populated('guestId')) {
		await booking.populate('guestId').execPopulate();
	}

	if (!_.get(booking.guestId, 'email')) {
		throw new ThrowReturn('Không tìm thấy email khách hàng!');
	}

	const amount = body.amount || dataPayment.amount;

	const paymentRef = await findOrCreatePaymentRef(booking, amount, user);

	if (guestCard.cardToken) {
		return chargeWithVaultToken({
			paymentRef,
			booking,
			guestCard,
		});
	}

	const cardInfo = models.GuestCard.decryptCardInfo(guestCard.cardInfo);

	const data = await Kovena.createPaymentUrl({
		booking,
		otaBookingId: booking.otaBookingId,
		amount: paymentRef.amount,
		currency: paymentRef.currency,
		paymentRef,
	});

	return Card.chargeReservation({
		...data,
		cardInfo,
		email: _.get(booking.guestId, 'email'),
	});
}

async function refundBookingCard(booking, body, user) {
	const ref = await models.PaymentRef.findOne({ ref: body.ref });

	const paymentRef = await models.PaymentRef.createRef({
		method: ref.method,
		amount: -body.amount,
		otaBookingId: booking.otaBookingId,
		otaName: booking.otaName,
		description: `COZRUM HOAN TIEN CHO MA DAT PHONG ${booking.otaBookingId}`,
		groupIds: booking.groupIds,
		blockId: booking.blockId,
		isRefund: true,
		refOrderId: ref.ref,
	});

	try {
		const config = await models.PaymentMethod.findOne({ name: ref.method });

		const res = await Kovena.refundPayment(config, {
			amount: body.amount,
			transactionNo: ref.transactionNo,
			originRef: ref,
			booking,
		});

		paymentRef.status = res.status;
		paymentRef.transactionNo = res.transactionNo;
		paymentRef.data = _.assign(paymentRef.data, res.data);

		await paymentRef.save();
	} catch (e) {
		paymentRef.data = { errorMsg: e };
		paymentRef.status = ThirdPartyPaymentStatus.FAIL;

		await paymentRef.save();

		throw new ThrowReturn(e);
	}

	const currencyAmount = {
		amount: paymentRef.amount,
		currency: ref.currency,
	};

	const category = await models.PayoutCategory.findOne({ payoutType: PayoutType.REFUND });

	const payout = await models.Payout.createOTAPayout({
		otaName: booking.otaName,
		otaId: paymentRef.ref,
		currencyAmount,
		collectorCustomName: paymentRef.method,
		source: PayoutSources.THIRD_PARTY,
		description: `Hoàn tiền qua ${paymentRef.method.toUpperCase()}, transaction no: ${
			paymentRef.transactionNo
		}, orderId: ${paymentRef.ref}`,
		createdAt: new Date(),
		blockIds: [booking.blockId],
		productId: paymentRef.transactionNo,
		bookingId: booking._id,
		createdBy: user._id,
		multipleReport: true,
		categoryId: category && category._id,
	});

	return {
		payout,
	};
}

async function updateBookingAutoCancelStatus(booking, body, user) {
	await models.GuestCard.updateCardStatus(
		{
			otaName: booking.otaName,
			otaBookingId: booking.otaBookingId,
		},
		{
			'paymentCardState.autoCancel': !!body.autoCancel,
		}
	);

	return {
		autoCancel: !!body.autoCancel,
	};
}

async function updateBookingChargeStatus(booking, body, user) {
	const currentStatus = _.get(booking.paymentCardState, 'chargedStatus');
	const newStatus = body.status;

	const acceptStatus = [PAYMENT_CHARGE_STATUS.IGNORED, PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE];

	if (!newStatus || currentStatus === PAYMENT_CHARGE_STATUS.CHARGED || !acceptStatus.includes(newStatus)) {
		throw new ThrowReturn('Trạng thái không hợp lệ!');
	}

	await models.GuestCard.updateCardStatus(
		{
			otaName: booking.otaName,
			otaBookingId: booking.otaBookingId,
		},
		{
			'paymentCardState.chargedStatus': newStatus,
		}
	);

	return {
		status: newStatus,
	};
}

async function getPaymentUrl(booking, query, user) {
	const { otaName, otaBookingId } = booking;

	const chargeType = query.chargeType || PAYMENT_CHARGE_TYPE.FIRST_NIGHT;
	const amount = parseInt(query.amount) || null;

	const dataPayment = await models.Booking.getPayment({
		otaBookingId,
		otaName,
		firstNight: chargeType === PAYMENT_CHARGE_TYPE.FIRST_NIGHT,
	});

	if (!dataPayment.amount) {
		if (booking.isRatePaid()) {
			dataPayment.amount = _.sumBy(dataPayment.bookings, b => b.exchange(b.roomPrice - (b.otaFee || 0)));
		} else {
			throw new ThrowReturn('Không tìm thấy thông tin cần thanh toán!');
		}
	}

	if (amount && (amount < 0 || amount > dataPayment.amount)) {
		throw new ThrowReturn('Số tiền thanh toán không hợp lệ!');
	}

	const config = await models.PaymentMethod.findOne({ name: ThirdPartyPayment.KOVENA });
	if (!config) {
		throw new ThrowReturn('Chưa hỗ trợ!');
	}

	const paymentRef = await findOrCreatePaymentRef(booking, amount || dataPayment.amount, user);

	const data = await Kovena.createPaymentUrl({
		booking,
		otaBookingId: booking.otaBookingId,
		amount: paymentRef.amount,
		currency: paymentRef.currency,
		paymentRef,
	});

	return { ...data, ref: paymentRef.ref };
}

async function chargeWithVaultToken({ paymentRef, booking, guestCard }) {
	const lockKey = `chargeWithVaultToken_${booking.otaBookingId}`;

	if (queueLock.isBusy(lockKey)) {
		throw new ThrowReturn('Other Payment is processing!');
	}

	return await queueLock.acquire(lockKey, async () => {
		let update = {};
		let errorMsg = '';

		const data = await Kovena.createPayment({
			vault_token: guestCard.cardToken,
			amount: paymentRef.amount,
			currency: paymentRef.currency,
			reference: paymentRef.ref,
			description: paymentRef.description,
			is_sending_email: false,
			booking_info: {
				booking_date: moment(booking.createdAt).format('YYYY-MM-DD'),
				booking_ref: booking.otaBookingId,
				check_in_date: moment(booking.from).format('YYYY-MM-DD'),
				check_out_date: moment(booking.to).format('YYYY-MM-DD'),
				customer_name: booking.guestId.fullName,
				customer_email: booking.guestId.email,
				customer_phone: booking.guestId.phone,
				// customer_country,
				surcharge_amount: 0,
				original_transaction_amount: paymentRef.amount,
				original_transaction_currency: paymentRef.currency,
			},
		})
			.then(async paymentData => {
				paymentRef.status = ThirdPartyPaymentStatus.SUCCESS;
				paymentRef.transactionNo = paymentData.transaction_id;
				paymentRef.data = paymentData;
				await paymentRef.save();

				guestCard.cardStatus = PAYMENT_CARD_STATUS.VALID;
				update['paymentCardState.chargedStatus'] = PAYMENT_CHARGE_STATUS.CHARGED;
				update['paymentCardState.status'] = guestCard.cardStatus;

				const currencyAmount = {
					amount: paymentRef.amount,
					currency: paymentRef.currency,
					exchangedAmount: paymentRef.amount,
				};

				await models.Payout.createOTAPayout({
					otaName: booking.otaName,
					otaId: paymentRef.ref,
					currencyAmount,
					collectorCustomName: paymentRef.method,
					source: PayoutSources.THIRD_PARTY,
					description: `Paid by ${paymentRef.method.toUpperCase()}\nTransaction ID: ${
						paymentRef.transactionNo
					}\nOrder ID: ${paymentRef.ref}`,
					createdAt: new Date(),
					blockIds: [booking.blockId],
					productId: paymentRef.transactionNo,
					bookingId: booking._id,
					createdBy: paymentRef.createdBy,
				});

				return paymentRef;
			})
			.catch(async e => {
				logger.error('Kovena.createPayment', e);

				errorMsg = _.toString(e);

				paymentRef.status = ThirdPartyPaymentStatus.FAIL;
				paymentRef.set('data.errorMsg', errorMsg);
				await paymentRef.save();

				if (guestCard.cardStatus !== PAYMENT_CARD_STATUS.VALID) {
					guestCard.cardStatus = PAYMENT_CARD_STATUS.INVALID;
				}

				if (_.get(booking.paymentCardState, 'chargedStatus') !== PAYMENT_CHARGE_STATUS.CHARGED) {
					update['paymentCardState.chargedStatus'] = PAYMENT_CHARGE_STATUS.ERROR;
					update['paymentCardState.status'] = guestCard.cardStatus;
				}
			});

		await guestCard.save().catch(e => {
			logger.error(e);
		});

		const updateOpts = {
			$set: update,
		};

		if (!paymentRef.createdBy) {
			updateOpts.$inc = {
				'paymentCardState.chargedCount': 1,
			};
		}

		await models.GuestCard.updateCardStatus(
			{
				otaName: booking.otaName,
				otaBookingId: booking.otaBookingId,
			},
			updateOpts
		);

		if (update['paymentCardState.chargedStatus'] === PAYMENT_CHARGE_STATUS.CHARGED) {
			eventEmitter.emit(EVENTS.BOOKING_CHARGED, booking);
		}

		if (errorMsg) {
			throw new ThrowReturn(errorMsg);
		}

		return data;
	});
}

async function onReceivedTokenize({ data, reference }) {
	const paymentRef = await models.PaymentRef.findOne({
		method: ThirdPartyPayment.KOVENA,
		ref: reference,
	});

	if (!paymentRef) {
		throw new ThrowReturn('Thanh toán không tồn tại!');
	}

	if (paymentRef.status === ThirdPartyPaymentStatus.SUCCESS) {
		throw new ThrowReturn('Thanh toán đã được xử lí!');
	}

	const vaultToken = _.get(data, 'message.data.vault_token');
	if (!vaultToken) {
		logger.error('onReceivedTokenize', JSON.stringify(data));
		throw new ThrowReturn('Token thẻ không tồn tại!');
	}

	const vault = await Kovena.retrieveVaultToken(vaultToken);

	const guestCard = await models.GuestCard.findOneAndUpdate(
		{
			otaName: paymentRef.otaName,
			otaBookingId: paymentRef.otaBookingId,
			deleted: false,
		},
		{
			cardToken: vaultToken,
			vaultInfo: vault.vault_info,
		},
		{
			upsert: true,
			new: true,
		}
	);

	const booking = await models.Booking.findOne({
		otaName: paymentRef.otaName,
		otaBookingId: paymentRef.otaBookingId,
	}).populate('guestId');

	return chargeWithVaultToken({
		paymentRef,
		booking,
		guestCard,
	});
}

async function getPayments(query) {
	const config = await models.PaymentMethod.findOne({ name: ThirdPartyPayment.KOVENA });

	return Kovena.getPayments(config, query);
}

async function getPayouts(req, res) {
	const config = await models.PaymentMethod.findOne({ name: ThirdPartyPayment.KOVENA });

	await Kovena.getPayouts(config, req, res);
}

async function getPayment(paymentId) {
	const config = await models.PaymentMethod.findOne({ name: ThirdPartyPayment.KOVENA });

	return Kovena.getPayment(config, paymentId);
}

async function getTransactions(req, res) {
	const config = await models.PaymentMethod.findOne({ name: ThirdPartyPayment.KOVENA });

	await Kovena.getTransactions(config, req, res);
}

async function getTransaction(transactionId) {
	const config = await models.PaymentMethod.findOne({ name: ThirdPartyPayment.KOVENA });

	return Kovena.getTransaction(config, transactionId);
}

async function getCanChargeBookingAmount(booking, query, user) {
	// const chargeType = query.chargeType || PAYMENT_CHARGE_TYPE.FIRST_NIGHT;
	// const amount = parseInt(query.amount) || null;

	const dataPayment = await models.Booking.getPayment({
		otaBookingId: booking.otaBookingId,
		otaName: booking.otaName,
		// firstNight: chargeType === PAYMENT_CHARGE_TYPE.FIRST_NIGHT,
	});
	// if (!dataPayment.amount) {
	// 	throw new ThrowReturn('Không tìm thấy thông tin cần thanh toán!');
	// }

	return {
		...dataPayment,
		bookings: undefined,
	};
}

function parseCardUrl(url) {
	// https://secure-admin.booking.com/booking_cc_details.html?extranet_lang=xu;bn=4334790821;lang=xu;has_bvc=0;hotel_id=11796031;ses=0db6c0bd1181fce61cce474588710b7e

	const params = url.split('?')[1].split(';');

	const idParam = params.find(p => p.startsWith('bn='));
	if (idParam) {
		return idParam.split('=')[1];
	}
}

function parseCardInfo(data) {
	const cardInfo = {};

	data.forEach(row => {
		row = row.replace(/\t/g, '');

		const rowData = row.split(':');

		const key = _.lowerCase(rowData[0]);
		const value = _.trim(rowData[1]);

		if (key.includes('card type')) {
			cardInfo.cardType = value;
		}
		if (key.includes('card number')) {
			cardInfo.cardNumber = value;
		}
		if (key.includes(`card holder`)) {
			cardInfo.cardName = value;
		}
		if (key.includes(`expiration date`)) {
			cardInfo.expirationDate = value.replace(/\s/g, '');
		}
		if (key.includes(`cvc code`)) {
			cardInfo.cvc = _.trim(value);
		}
	});

	return cardInfo;
}

async function onReceivedExtCard(msg, user) {
	if (msg.event !== SERVICES_EVENT_TYPES.EXTENSION_GET_BOOKING_CARD) {
		return;
	}

	try {
		const { data } = msg;

		const otaBookingId = parseCardUrl(data.url);

		if (!otaBookingId) {
			return;
		}

		const booking = await models.Booking.findOne({
			otaName: OTAs.Booking,
			otaBookingId,
		});

		if (_.get(booking.paymentCardState, 'status') === PAYMENT_CARD_STATUS.VALID) {
			return;
		}

		if (typeof data.result === 'string') {
			const ignoreMsgs = [`your guest's credit card details aren't available`];

			await models.GuestCard.updateCardStatus(
				{
					otaName: booking.otaName,
					otaBookingId: booking.otaBookingId,
				},
				{
					'paymentCardState.description': data.result,
					'paymentCardState.status': PAYMENT_CARD_STATUS.INVALID,
				}
			);

			if (!ignoreMsgs.some(ignoreMsg => _.toLower(data.result).includes(ignoreMsg))) {
				await markInvalidCard(booking);
			}

			return;
		}

		const cardInfo = parseCardInfo(data.result);

		await createBookingCard(booking, { cardInfo }, user);

		// await chargeBookingCard(booking, { chargeType: PAYMENT_CHARGE_TYPE.FIRST_NIGHT });
	} catch (err) {
		logger.error('onReceivedExtCard', err, msg);
	}
}

serviceEventEmitter.on(SERVICES_EVENTS.RESPONSE, onReceivedExtCard);

module.exports = {
	getChargeBookings,
	getBookingCard,
	chargeBookingCard,
	refundBookingCard,
	updateBookingAutoCancelStatus,
	getPaymentUrl,
	retrieveBookingCard,
	onReceivedTokenize,
	getPayments,
	getPayment,
	getTransactions,
	getTransaction,
	getPayouts,
	markInvalidCard,
	createBookingCard,
	getCanChargeBookingAmount,
	updateBookingChargeStatus,
};
