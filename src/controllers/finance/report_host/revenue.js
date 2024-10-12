const _ = require('lodash');
const moment = require('moment');

const {
	BookingStatus,
	PayoutType,
	PayoutStates,
	EXTRA_FEE,
	REPORT_TYPE,
	Services,
	PayoutSources,
	RateType,
} = require('@utils/const');
const models = require('@models');
const { getPayType, isReduxCommission, isHostCollect } = require('./utils');
const textContent = require('./reportHost.json');

const NEWRP_DAY = '2023-07-12';
const VALID_BOOKING_STATUS = [BookingStatus.CONFIRMED, BookingStatus.NOSHOW, BookingStatus.CHARGED];

function getBookings({ blockId, revenueKeys, roomIds, config, from, to, ...filter }) {
	_.assign(filter, {
		status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW] },
		ignoreFinance: false,
		blockId,
		from: { $lte: to },
	});

	if (config.startRunning && config.startRunning > from.toDateMysqlFormat()) {
		filter.to = { $gt: new Date(config.startRunning).zeroHours() };
	} else {
		filter.to = { $gt: from };
	}

	if (roomIds) {
		filter.reservateRooms = { $in: roomIds };
	}

	const priceSelectors = {
		otaFee: 1,
		price: 1,
		roomPrice: 1,
		...revenueKeys.reduce((acc, cur) => ({ ...acc, [cur]: 1 }), {}),
	};

	return models.Booking.find(filter)
		.select({
			from: 1,
			to: 1,
			otaName: 1,
			guestId: 1,
			otaBookingId: 1,
			status: 1,
			rateType: 1,
			currency: 1,
			currencyExchange: 1,
			serviceType: 1,
			relativeBookings: 1,
			isPaid: 1,
			blockId: 1,
			...priceSelectors,
		})
		.populate({ path: 'guestId', select: 'fullName name displayName', options: { lean: true } })
		.populate({ path: 'reservateRooms', select: 'isGroundRent info.roomNo', options: { lean: true } })
		.populate({
			path: 'relativeBookings',
			select: { status: 1, blockId: 1, ...priceSelectors },
			options: { lean: true },
		})
		.lean();
}

async function getPayouts(filter) {
	const payouts = await models.Payout.find(filter)
		.select(
			'blockIds fromOTA payoutType currencyAmount transactionFee feePaidBy source collectorCustomName bookingId otaId otaName isOwnerCollect isAvoidTransactionFee state isCalcDeposit description isFinalIncome'
		)
		.lean();

	payouts.forEach(payout => {
		payout.transactionFee = payout.isAvoidTransactionFee || !payout.transactionFee ? 0 : payout.transactionFee;
		if (payout.payoutType === PayoutType.REFUND) {
			payout.currencyAmount.exchangedAmount = -Math.abs(payout.currencyAmount.exchangedAmount);
		}
	});

	return payouts;
}

function getHostRevenues({ blockId, roomIds, from, to }) {
	const filter = {
		payoutType: PayoutType.OTHER,
		state: { $ne: PayoutStates.DELETED },
		blockIds: blockId,
		paidAt: {
			$gte: moment(from).startOf('date').toDate(),
			$lte: moment(to).endOf('date').toDate(),
		},
		bookingId: null,
	};
	if (roomIds) filter.roomIds = { $in: roomIds };

	return getPayouts(filter);
}

async function getDepositRevenues({ blockId, roomIds, from, to, language, taxRate, config }) {
	const isNewCalc = from.toDateMysqlFormat() >= NEWRP_DAY;

	const bookingFilters = {
		blockId,
		status: BookingStatus.CANCELED,
		serviceType: Services.Month,
		ignoreFinance: false,
	};
	if (isNewCalc) {
		bookingFilters.createdAt = { $gte: moment(NEWRP_DAY).startOf('day').toDate() };
		bookingFilters.to = {
			$gt: from,
			$lte: moment(to).add(1, 'day').toDate(),
		};
	} else {
		bookingFilters.createdAt = {
			$gte: moment(from).startOf('day').toDate(),
			$lte: moment(to).endOf('day').toDate(),
		};
	}
	if (roomIds) {
		bookingFilters.reservateRooms = { $in: roomIds };
	}

	const bookings = await models.Booking.find(bookingFilters)
		.select('from to otaName guestId otaBookingId serviceType reservateRooms')
		.lean();

	const rs = [];

	const payouts = await getPayouts({
		state: { $ne: PayoutStates.DELETED },
		payoutType: PayoutType.DEPOSIT,
		isCalcDeposit: true,
		bookingId: { $in: _.map(bookings, '_id') },
	});
	if (!payouts.length) return rs;

	const bookingsPayouts = _.groupBy(payouts, 'bookingId');
	const filteredBookings = bookings.filter(booking => bookingsPayouts[booking._id]);

	if (!filteredBookings.length) return rs;

	await models.Booking.populate(filteredBookings, [
		{ path: 'guestId', select: 'fullName name displayName', options: { lean: true } },
		{ path: 'reservateRooms', select: 'info.roomNo', options: { lean: true } },
	]);

	filteredBookings.forEach(booking => {
		const info = _.pick(booking, ['from', 'to', 'otaName', 'guestId', 'otaBookingId', 'serviceType']);

		info.nights = 0;
		info.rooms = _.map(booking.reservateRooms, 'info.roomNo').join(', ');
		info.bookingId = booking._id.toString();
		info.guestId._id = info.guestId._id.toString();

		const currentPayouts = bookingsPayouts[booking._id];

		const othInRes = currentPayouts.map(p => {
			const transactionFee = p.transactionFee || 0;
			const vnd = p.currencyAmount.exchangedAmount;
			const payType = getPayType(null, p, config);

			return {
				vnd,
				payType,
				transactionFee,
				feePaidBy: p.feePaidBy,
				description: _.get(textContent, `UTILS.deposit.${language}`),
			};
		});

		rs.push(...mapInfoToRev(othInRes, info, config, taxRate));
	});

	return rs;
}

function calcTransactionFee(currentFee, dtAmount, totalAmount) {
	const rrate = Math.min(1, dtAmount / totalAmount);
	return _.round(currentFee * rrate);
}

function groupPayouts({
	payouts,
	distribute,
	rate,
	roomPrice,
	OTAFee,
	language,
	isCalcDeposit,
	hasCharged,
	hasCanceled,
	isReduxOTAFee,
	config,
	booking,
}) {
	const revenues = [];
	let sumf = 0;

	const reconcs = [];

	_.forEach(
		_.groupBy(payouts, p => getPayType(booking, p, config)),
		(gPayouts, payType) => {
			const totalP = _.sumBy(gPayouts, 'currencyAmount.exchangedAmount');
			const total = totalP * rate;

			if (total && (!roomPrice || sumf < roomPrice)) {
				const vnd = distribute ? distribute(total) : total;
				const totalTransFee = _.sumBy(gPayouts, 'transactionFee') || 0;
				const transactionFee = calcTransactionFee(totalTransFee, vnd, totalP);

				sumf += vnd;

				revenues.push({
					vnd,
					transactionFee,
					payType,
					feePaidBy: gPayouts[0].feePaidBy,
				});

				if (roomPrice && isHostCollect(payType) && booking.relativeBookings.length) {
					const blIds = _.map(
						[booking, ..._.filter(booking.relativeBookings, b => VALID_BOOKING_STATUS.includes(b.status))],
						b => _.toString(b.blockId)
					);

					if (_.uniq(blIds).length > 1) {
						const strBlockId = _.toString(booking.blockId);
						const sameBlockIds = _.filter(blIds, blockId => blockId === strBlockId);

						if (sameBlockIds[0] === strBlockId) {
							const otherBlockIds = _.filter(
								booking.relativeBookings,
								b => _.toString(b.blockId) !== strBlockId
							);
							const otherOTAFee = _.sumBy(otherBlockIds, 'otaFee');
							const otherRoomPrice = _.sumBy(otherBlockIds, 'roomPrice');

							reconcs.push({
								vnd: -(distribute ? distribute(otherRoomPrice) : otherRoomPrice),
								transactionFee: -(totalTransFee - transactionFee),
								payType: payType.replace('CNT - ', ''),
								OTAFee: -(distribute ? distribute(otherOTAFee) : otherOTAFee),
								isReduxOTAFee,
							});
						}
					}
				}
			}
		}
	);

	if (roomPrice && revenues.length) {
		revenues
			.sort((a, b) => b.vnd - a.vnd)
			.forEach((rev, i) => {
				if (i === 0) {
					const sum = _.sumBy(revenues.slice(1), 'vnd') || 0;
					const newVnd = roomPrice - sum - (_.sumBy(reconcs, 'vnd') || 0);

					if (
						rev.transactionFee && //
						!(roomPrice < sumf && !hasCharged && !hasCanceled && payouts.some(p => p.fromOTA))
					) {
						rev.transactionFee =
							calcTransactionFee(rev.transactionFee, roomPrice, rev.vnd) -
							(_.sumBy(reconcs, 'transactionFee') || 0);
					}

					rev.vnd = newVnd;
				}
			});
	}

	revenues.forEach((rev, rI) => {
		rev.OTAFee = !OTAFee ? 0 : rI === 0 ? OTAFee - (_.sumBy(reconcs, 'OTAFee') || 0) : 0;
		if (isCalcDeposit) rev.description = _.get(textContent, `UTILS.deposit.${language}`);
		rev.isReduxOTAFee = isReduxOTAFee;
	});

	return [...revenues, ...reconcs];
}

function getReservationRevenues({
	payouts,
	distribute,
	exchangeCurrency,
	rate,
	booking,
	taxRate,
	language,
	bto,
	revenueKeys,
	hasCharged,
	hasCanceled,
	config,
}) {
	const exRoomPrice = exchangeCurrency ? exchangeCurrency(booking.roomPrice) : booking.roomPrice;
	const roomPrice = distribute ? distribute(exRoomPrice) : exRoomPrice;
	const dtOTAFee = distribute ? distribute(booking.otaFee) : booking.otaFee;

	const revenues = [];
	const others = [];

	const depositPayouts = _.filter(
		payouts,
		payout => payout.payoutType === PayoutType.DEPOSIT && payout.isCalcDeposit
	);

	if (depositPayouts.length) {
		const isNewRp = booking.from.toDateMysqlFormat() >= NEWRP_DAY;

		if (!isNewRp || booking.to <= bto) {
			others.push(
				...groupPayouts({
					payouts: depositPayouts,
					distribute: !isNewRp && distribute,
					rate,
					taxRate,
					language,
					isCalcDeposit: true,
					booking,
					config,
				})
			);
		}
	}

	const types = { [PayoutType.RESERVATION]: 1, [PayoutType.REFUND]: 1 };

	let reservationPayouts = payouts;

	if (booking.roomPrice === booking.price) {
		if (payouts.length > 1) {
			reservationPayouts = payouts.filter(p => types[p.payoutType]);
		}
	} else {
		reservationPayouts = _.filter(
			payouts,
			payout =>
				types[payout.payoutType] && revenueKeys.every(k => payout.currencyAmount.exchangedAmount !== booking[k])
		);
	}

	const isReduxOTAFee = isReduxCommission(booking.otaName, booking.rateType, bto);

	if (roomPrice && reservationPayouts.length) {
		revenues.push(
			...groupPayouts({
				payouts: reservationPayouts,
				distribute,
				rate,
				roomPrice: depositPayouts.length ? null : roomPrice,
				OTAFee: dtOTAFee,
				taxRate,
				language,
				booking,
				hasCharged,
				hasCanceled,
				isReduxOTAFee,
				config,
			})
		);
	}

	if (!revenues.length && !depositPayouts.length) {
		const payType = getPayType(booking, null, config);

		revenues.push({
			payType,
			OTAFee: dtOTAFee,
			vnd: roomPrice,
			transactionFee: 0,
			isReduxOTAFee,
		});
	}

	return { revenues, others };
}

function getOtherRevenues({ booking, payouts, distribute, exchangeCurrency, language, revenueKeys, isSonataReport }) {
	const otherRevenues = [];
	const other = [];

	const isCalcDeposit = _.some(payouts, { isCalcDeposit: true });
	if (isCalcDeposit) {
		const igTypes = [PayoutType.DEPOSIT, PayoutType.RESERVATION, PayoutType.REFUND];
		const spayouts = _.filter(payouts, payout => !igTypes.includes(payout.payoutType));

		spayouts.forEach(p => {
			const vnd = p.currencyAmount.exchangedAmount;
			const payType = getPayType(null, p);
			const distributedVnd = distribute ? distribute(vnd) : vnd;
			const transactionFee = calcTransactionFee(p.transactionFee, distributedVnd, vnd);

			otherRevenues.push({
				payType,
				description: _.get(textContent.EXTRA_FEE_TXT.serviceFee, language),
				vnd: distributedVnd,
				transactionFee,
				feePaidBy: p.feePaidBy,
			});
		});

		return {
			otherRevenues,
			other,
		};
	}

	const inOtherKeys = isSonataReport ? [EXTRA_FEE.VAT_FEE, EXTRA_FEE.CAR_FEE, EXTRA_FEE.MOTOBIKE_FEE] : [];
	const resPayoutTypes = [PayoutType.RESERVATION, PayoutType.REFUND];
	const reservationPayouts = _.filter(
		payouts,
		payout => !payout.fromOTA && resPayoutTypes.includes(payout.payoutType)
	);

	const otherServices = revenueKeys.filter(key => booking[key]);

	if (otherServices.length) {
		const servicePayouts = _.filter(payouts, payout => payout.payoutType === PayoutType.SERVICE);

		otherServices.forEach(type => {
			const exFee = exchangeCurrency(booking[type]);

			let matchPayout;

			if (type === EXTRA_FEE.VAT_FEE) {
				matchPayout = payouts.find(p => p.payoutType === PayoutType.VAT);
			} else {
				matchPayout =
					servicePayouts.find(s => s.currencyAmount.exchangedAmount === exFee) ||
					payouts.find(s => s.currencyAmount.exchangedAmount === exFee) ||
					reservationPayouts.find(s => s.currencyAmount.exchangedAmount === exFee);
			}

			if (!matchPayout) {
				const payoutGroups = _.values(
					_.groupBy(
						_.filter(payouts, payout => payout.payoutType !== PayoutType.RESERVATION),
						'payoutType'
					)
				).find(pays => _.sumBy(pays, 'currencyAmount.exchangedAmount') === exFee);

				if (payoutGroups) {
					payoutGroups.forEach(payout => {
						const amount = payout.currencyAmount.exchangedAmount;
						const vnd = distribute ? distribute(amount) : amount;

						const payType = getPayType(null, payout);
						const transactionFee = calcTransactionFee(payout.transactionFee, vnd, amount);

						(inOtherKeys.includes(type) ? other : otherRevenues).push({
							type,
							payType,
							vnd,
							transactionFee,
							feePaidBy: payout.feePaidBy,
							description: payout.description || _.get(textContent.EXTRA_FEE_TXT[type], language),
						});
					});
					return;
				}
			}

			const vnd = distribute ? distribute(exFee) : exFee;
			const exPay =
				matchPayout || _.maxBy(servicePayouts, 'currencyAmount.exchangedAmount') || reservationPayouts[0];

			const payType = getPayType(null, exPay);

			const transactionFee =
				(exPay && calcTransactionFee(exPay.transactionFee, vnd, exPay.currencyAmount.exchangedAmount)) || 0;

			(inOtherKeys.includes(type) ? other : otherRevenues).push({
				type,
				payType,
				vnd,
				transactionFee,
				feePaidBy: _.get(exPay, 'feePaidBy'),
				description: _.get(matchPayout, 'description') || _.get(textContent.EXTRA_FEE_TXT[type], language),
			});
		});
	}

	return {
		otherRevenues,
		other,
	};
}

function mapInfoToRev(revenues, info, config, taxRate) {
	const cShortTerm = _.get(config, 'shortTerm') || 0;
	const cLongTerm = _.get(config, 'longTerm') || 0;
	const ht = _.get(config, 'hasTax');
	const isVer2 = _.get(config, 'version') === 2;
	// const noReduxManageFee = _.get(config, 'noReduxManageFee');

	const finalRev = _.map(revenues, r => {
		r.OTAFee = r.OTAFee || 0;

		const OTAFeeNoRedux = r.isReduxOTAFee ? 0 : r.OTAFee;
		const OTAFeeRedux = r.isReduxOTAFee ? r.OTAFee : 0;
		const commAndTransFee = (isVer2 ? OTAFeeNoRedux : r.OTAFee) + (r.transactionFee || 0);
		const revenueForTax = r.vnd - OTAFeeRedux;

		const mfr = r.serviceType === Services.Month ? cLongTerm : cShortTerm;

		const manageFee = _.round(mfr * revenueForTax);
		const mfRedux = _.round(mfr * ((ht ? taxRate * commAndTransFee : 0) + commAndTransFee));
		const manageFeeRedux = manageFee - mfRedux;
		const tax = _.round(taxRate * (revenueForTax - manageFeeRedux));

		return {
			...info,
			...r,
			OTAFeeRedux,
			OTAFeeNoRedux,
			commAndTransFee,
			revenueForTax,
			manageFee,
			manageFeeRedux,
			tax,
		};
	});

	return finalRev;
}

function sumRevenues(revenues) {
	if (!revenues) return undefined;

	return {
		data: revenues,
		total: _.sumBy(revenues, 'vnd') || 0,
		totalOTAFee: _.sumBy(revenues, 'OTAFee') || 0,
		totalOTAFeeNoRedux: _.sumBy(revenues, 'OTAFeeNoRedux') || 0,
		totalOTAFeeRedux: _.sumBy(revenues, 'OTAFeeRedux') || 0,
		totalTransactionFee: _.sumBy(revenues, 'transactionFee') || 0,
		totalCommAndTransFee: _.sumBy(revenues, 'commAndTransFee') || 0,
		totalRevenueForTax: _.sumBy(revenues, 'revenueForTax') || 0,
		totalManageFee: _.sumBy(revenues, 'manageFee') || 0,
		totalManageFeeRedux: _.sumBy(revenues, 'manageFeeRedux') || 0,
		totalTax: _.sumBy(revenues, 'tax') || 0,
	};
}

function sortPayments(payments) {
	const sorterSource = {
		[PayoutSources.BANKING]: 1,
		[PayoutSources.SWIPE_CARD]: 1,
		[PayoutSources.ONLINE_WALLET]: 1,
		[PayoutSources.THIRD_PARTY]: 1,
	};
	const sorterType = {
		[PayoutType.REFUND]: 3,
		[PayoutType.SERVICE]: 2,
		[PayoutType.RESERVATION]: 1,
		[PayoutType.DEPOSIT]: -1,
	};

	return payments.sort((a, b) => {
		return (
			(sorterType[b.payoutType] || 0) - (sorterType[a.payoutType] || 0) ||
			a.currencyAmount.exchangedAmount - b.currencyAmount.exchangedAmount ||
			(sorterSource[b.source] || 0) - (sorterSource[a.source] || 0)
		);
	});
}

function sumServices(b, keys) {
	return _.sum(keys.map(k => b[k] || 0));
}

async function getRevenues({ blockId, from, to, roomIds, hostRevenues, taxRate, language, config, revenueKeys }) {
	const bto = moment(to).add(1, 'day').toDate();

	const isSonataReport = _.get(config, 'reportType') === REPORT_TYPE.SONATA;

	const bookings = await getBookings({
		revenueKeys,
		config,
		blockId,
		roomIds,
		from,
		to,
	});

	const allPayouts = await getPayouts({
		bookingId: {
			$in: [..._.map(bookings, '_id'), ..._.map(_.flatten(_.map(bookings, 'relativeBookings')), '_id')],
		},
		state: { $ne: PayoutStates.DELETED },
	});
	const bookingsPayouts = _.groupBy(allPayouts, 'bookingId');

	const rs = {
		revenues: [],
		otherRevenues: [],
		other: [],
	};

	bookings.forEach(booking => {
		const info = _.pick(booking, ['from', 'to', 'otaName', 'guestId', 'otaBookingId', 'serviceType', 'rateType']);
		const cfrom = _.max([booking.from, from]);
		const cto = _.min([booking.to, bto]);
		info.nights = cto.diffDays(cfrom);
		info.rooms = _.map(booking.reservateRooms, 'info.roomNo').join(', ');
		info.bookingId = booking._id.toString();
		info.guestId._id = info.guestId._id.toString();

		let payouts = sortPayments(
			_.flatten(
				_.compact([
					bookingsPayouts[booking._id],
					..._.map(booking.relativeBookings, rbid => bookingsPayouts[rbid._id]),
				])
			)
		);
		if (booking.rateType !== RateType.PAY_NOW) {
			payouts = payouts.filter(p => !p.fromOTA || p.currencyAmount.exchangedAmount > 0);
		}

		const distribute = models.Booking.distribute(
			booking.from,
			booking.to,
			config.startRunning ? _.max([from, new Date(config.startRunning).zeroHours()]) : from,
			bto
		);
		const exchangeCurrency = models.Booking.exchangeCurrency(booking.currencyExchange, booking.currency);
		const isLongterm = booking.serviceType === Services.Month;
		const isDt = !isLongterm || booking.to <= bto;

		const bks = [booking, ..._.filter(booking.relativeBookings, b => VALID_BOOKING_STATUS.includes(b.status))];
		const totalRoomPrice = _.sumBy(bks, 'roomPrice');
		const totalSPrice = _.sumBy(bks, b => sumServices(b, revenueKeys));

		const rate = totalRoomPrice ? booking.roomPrice / totalRoomPrice : 1 / bks.length;
		const srate = totalSPrice ? sumServices(booking, revenueKeys) / totalSPrice : 1 / bks.length;
		const isGroundRent = _.get(booking, 'reservateRooms.0.isGroundRent') === true;
		const hasCharged = booking.relativeBookings.some(b => b.status === BookingStatus.CHARGED);
		const hasCanceled = booking.relativeBookings.some(b => b.status === BookingStatus.CANCELED);

		const { revenues, others: othInRes } = getReservationRevenues({
			payouts,
			distribute,
			exchangeCurrency,
			rate,
			booking,
			taxRate,
			language,
			bto,
			revenueKeys,
			hasCharged,
			hasCanceled,
			config,
		});
		if (isGroundRent) {
			rs.groundRentRevenues = rs.groundRentRevenues || [];
			rs.groundRentRevenues.push(...mapInfoToRev(revenues, info, config, taxRate));
		} else {
			rs.revenues.push(...mapInfoToRev(revenues, info, config, taxRate));
		}
		rs.other.push(...mapInfoToRev(othInRes, info, config, taxRate));

		if (isDt) {
			const { otherRevenues, other: othInOther } = getOtherRevenues({
				booking,
				payouts,
				distribute: isLongterm ? false : distribute,
				exchangeCurrency,
				language,
				rate: srate,
				taxRate,
				revenueKeys,
				isSonataReport,
			});

			rs.otherRevenues.push(...mapInfoToRev(otherRevenues, info, config, taxRate));
			rs.other.push(...mapInfoToRev(othInOther, info, config, taxRate));
		}
	});

	const depositRevenues = await getDepositRevenues({
		blockId,
		roomIds,
		from,
		to,
		language,
		taxRate,
		config,
	});
	rs.other.push(...depositRevenues);

	const revenues = sumRevenues(rs.revenues);
	const otherRevenues = sumRevenues(rs.otherRevenues);
	const groundRentRevenues = sumRevenues(rs.groundRentRevenues);

	rs.other.push(
		..._.map(hostRevenues, hr => ({
			guestId: {
				fullName: hr.description,
				name: hr.description,
				displayName: _.upperCase(hr.description),
			},
			type: 'other',
			vnd: _.get(hr, 'currencyAmount.exchangedAmount') || 0,
			payType: getPayType(null, hr),
			description: 'Khác',
			isFinalIncome: hr.isFinalIncome,
		}))
	);

	const other = sumRevenues(rs.other);
	const _revenues = _.compact([revenues, otherRevenues, groundRentRevenues, other]);

	return {
		revenues,
		otherRevenues,
		groundRentRevenues,
		other,
		payouts: allPayouts,

		total: _.sumBy(_revenues, 'total'),
		totalOTAFee: _.sumBy(_revenues, 'totalOTAFee'),
		totalOTAFeeRedux: _.sumBy(_revenues, 'totalOTAFeeRedux') || 0,
		totalOTAFeeNoRedux: _.sumBy(_revenues, 'totalOTAFeeNoRedux') || 0,
		totalTransactionFee: _.sumBy(_revenues, 'totalTransactionFee'),
		totalCommAndTransFee: _.sumBy(_revenues, 'totalCommAndTransFee') || 0,
		totalRevenueForTax: _.sumBy(_revenues, 'totalRevenueForTax'),
		totalManageFee: _.sumBy(_revenues, 'totalManageFee') || 0,
		totalManageFeeRedux: _.sumBy(_revenues, 'totalManageFeeRedux') || 0,
		totalTax: _.sumBy(_revenues, 'totalTax'),
	};
}

module.exports = {
	getRevenues,
	getHostRevenues,
};
