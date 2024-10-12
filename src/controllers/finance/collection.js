const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { PayoutType, PayoutStates, PayoutCollectStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const apis = require('@controllers/ota_api/payments');
const { fetchPayout } = require('@controllers/finance/sync');

const SUPPORT_OTAS = _.keys(apis).filter(ota => apis[ota].getAwaitingCollections);

let isTest = global.isDev;
// let isTest = false;

function getSupportOTAs() {
	return { otas: SUPPORT_OTAS };
}

async function getProperties(blockIds, otas) {
	const [data] = await models.Block.aggregate([
		{
			$match: {
				_id: { $in: blockIds },
				active: true,
				isProperty: true,
				isTest: false,
			},
		},
		{ $unwind: '$OTAProperties' },
		{
			$match: {
				'OTAProperties.otaName': { $in: otas },
			},
		},
		{
			$group: {
				_id: null,
				properties: {
					$push: {
						propertyId: '$OTAProperties.propertyId',
						account: '$OTAProperties.account',
						otaName: '$OTAProperties.otaName',
						bankAccountId: '$OTAProperties.bankAccountId',
						blockId: '$_id',
						propertyName: '$info.name',
					},
				},
			},
		},
	]);

	return data ? data.properties : [];
}

async function getPaymentCollections(user, query) {
	const { blockId, excludeBlockId, ota } = query;

	if (isTest) {
		await Promise.delay(1000);
		const { testCollections } = require('./collection.raw');

		return {
			collections: testCollections,
			total: testCollections.length,
		};
	}

	const otas = ota ? SUPPORT_OTAS.filter(o => o === ota) : SUPPORT_OTAS;
	if (!otas.length) {
		throw new ThrowReturn('Tạm thời chưa hỗ trợ!');
	}

	if (!blockId) {
		return {
			collections: [],
			total: 0,
		};
	}

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId, excludeBlockId });
	const properties = await getProperties(blockIds, otas);

	const items = [];

	await _.values(_.groupBy(properties, r => r.otaName + r.account)).asyncMap(async otaProperties => {
		const otaConfig = await models.OTAManager.findOne({
			active: true,
			name: otaProperties[0].otaName,
			account: otaProperties[0].account,
		});

		return otaProperties.asyncForEach(property => {
			return apis[property.otaName]
				.getAwaitingCollections({ otaConfig, property })
				.then(data => {
					items.push({
						...property,
						...data,
					});
				})
				.catch(e => {
					logger.error('getAwaitingCollections', property.otaName, property.account, e);
				});
		});
	});

	let collections = items.filter(i => i.totalAmount > 0);

	const newPayoutCollections = collections.filter(c => c.newPayout);

	if (newPayoutCollections.length) {
		const ignores = {};
		const keys = ['date', 'propertyId', 'otaName', 'account', 'totalAmount'];

		await newPayoutCollections.asyncMap(async collection => {
			const prevCollection = await models.PaymentCollection.findOne(_.pick(collection, keys)).select('_id');

			if (prevCollection) {
				ignores[keys.map(k => collection[k]).toString()] = true;
			}
		});

		collections = collections.filter(c => !ignores[keys.map(k => c[k]).toString()]);
	}

	if (collections.length) {
		const bookings = await models.Booking.find({
			otaName: { $in: _.map(collections, 'otaName') },
			otaBookingId: { $in: _.flatten(_.map(collections, c => _.map(c.transactions, 'otaBookingId'))) },
		})
			.select('otaName otaBookingId createdAt from to')
			.lean();

		const bObj = _.keyBy(bookings, b => b.otaName + b.otaBookingId);

		collections.forEach(c => {
			c.status = PayoutCollectStatus.Pending;
			c.transactions.forEach(t => {
				const booking = bObj[c.otaName + t.otaBookingId];
				if (booking) {
					t.bookingId = booking._id;
					t.booked = t.booked || booking.createdAt.toDateMysqlFormat();
					t.checkIn = t.checkIn || booking.from.toDateMysqlFormat();
					t.checkOut = t.checkOut || booking.to.toDateMysqlFormat();
				}
			});
		});
	}

	return {
		collections,
		total: collections.length,
	};
}

async function syncPayouts(payouts, data, bookings) {
	const payoutsObj = _.keyBy(payouts, 'otaId');
	const bookingObjs = _.groupBy(bookings, 'otaBookingId');

	const updatedPayouts = [];
	const processedPayouts = [];
	const newPayouts = [];

	let hasError = false;

	data.transactions.forEach(trans => {
		let payout = payoutsObj[trans.otaId];

		if (!payout && trans.amount) {
			const currentBookings = bookingObjs[trans.otaBookingId];
			if (currentBookings) {
				payout = payouts.find(
					p =>
						p.currencyAmount.amount === trans.amount && currentBookings.some(b => b._id.equals(p.bookingId))
				);
			}

			if (!payout) {
				if (trans.adjustment) {
					const currencyAmount = {
						amount: trans.amount,
						currency: trans.currency,
					};

					newPayouts.push({
						otaName: trans.otaName,
						otaId: trans.otaId,
						currencyAmount,
						collectorCustomName: trans.otaName,
						description: trans.status,
						paidAt: moment(trans.updatedAt || trans.createdAt).toDate(),
						blockIds: _.compact([data.blockId || _.get(currentBookings, '[0].blockId')]),
						bookingId: trans.bookingId || _.get(currentBookings, '[0]._id'),
						fromOTA: true,
					});
				} else {
					logger.error('confirmAwaitingCollections syncPayouts', trans);

					hasError = true;
				}
			}
		}

		if (!payout) return;

		if (payout.currencyAmount.amount !== trans.amount) {
			payout.currencyAmount.amount = trans.amount;
			updatedPayouts.push(payout);
		}

		processedPayouts.push(payout);
	});

	if (updatedPayouts.length) {
		await updatedPayouts.asyncMap(p => p.save());
	}

	if (newPayouts.length) {
		const newPayoutDocs = await newPayouts.asyncMap(p => models.Payout.createOTAPayout(p));
		processedPayouts.push(...newPayoutDocs);
	}

	if (hasError) {
		if (data.blockId) {
			const minFromBooking = _.minBy(bookings, 'from');
			const maxToBooking = _.maxBy(bookings, 'to');
			await fetchPayout([data.otaName], minFromBooking.from, maxToBooking.to, data.blockId);
		}

		throw new ThrowReturn('Có khoản thu không hợp lệ! Vui lòng làm mới lại trạng và thử lại');
	}

	return processedPayouts;
}

async function confirmAwaitingCollections(user, data) {
	if (isTest) {
		await Promise.delay(1000);

		const { testConfirmations } = require('./collection.raw');
		return testConfirmations.find(c => c.propertyId === data.propertyId);
	}

	const otaConfig = await models.OTAManager.findOne({
		active: true,
		name: data.otaName,
		account: data.account,
	});

	if (!otaConfig) {
		throw new ThrowReturn('Tạm thời chưa hỗ trợ!');
	}

	if (!data.blockId) {
		const block = await models.Block.findOne({
			OTAProperties: {
				$elemMatch: {
					propertyId: data.propertyId,
					account: data.account,
					otaName: data.otaName,
				},
			},
		}).select('_id');
		if (!block) {
			throw new ThrowReturn('Không tìm thấy thông tin nhà!');
		}

		data.blockId = block._id;
	}

	if (apis[data.otaName].mapPaymentCollections) {
		await apis[data.otaName].mapPaymentCollections(data);
	}

	const bookings = await models.Booking.find({
		otaName: data.otaName,
		otaBookingId: _.map(data.transactions, 'otaBookingId'),
	})
		.select('_id otaBookingId blockId from to')
		.lean();

	let payouts = await models.Payout.find({
		fromOTA: true,
		state: { $in: [PayoutStates.PROCESSING, PayoutStates.TRANSFERRED] },
		bookingId: { $in: _.map(bookings, '_id') },
	});

	if (!data.newPayout && !payouts.length) {
		throw new ThrowReturn('Không tìm thấy khoản thu hợp lệ trên hệ thống!');
	}

	if (!data.newPayout) {
		payouts = await syncPayouts(payouts, data, bookings);
	}

	if (payouts.some(p => p.inReport)) {
		throw new ThrowReturn('Có khoản thu đã nằm trong lệnh thu khác!');
	}

	const res = await apis[data.otaName].confirmAwaitingCollections({ otaConfig, ...data });

	if (res) {
		if (payouts.length) {
			const payoutCollector = await models.PaymentCollector.findOne(
				res.collectionKey
					? {
							'conds.key': res.collectionKey,
							'conds.value': res.collectionValue,
					  }
					: {
							tag: data.otaName,
					  }
			);

			const source = payoutCollector ? payoutCollector.tag : data.otaName;
			if (!data.propertyName) {
				const block = await models.Block.findOne({ _id: payouts[0].blockIds }).select('info.name');
				data.propertyName = _.get(block, 'info.name');
			}

			const report = {
				payoutType: PayoutType.RESERVATION,
				name: `${_.upperFirst(source)} Payment ${moment().format('DD/MM/Y')}${
					data.propertyName ? ` (${data.propertyName})` : ''
				}`,
				payouts: _.map(payouts, '_id'),
				source,
				groupIds: user.groupIds,
				paymentMethod: res.paymentMethod,
				paymentMethodName: res.paymentMethodName,
				createdBy: user._id,
			};

			if (res.cards) {
				res.cards = await res.cards.asyncMap(card =>
					models.PaymentCard.create(card).catch(e => {
						logger.error('create payment card', e);
					})
				);
				report.cardIds = _.compact(_.map(res.cards, '_id'));
			}

			res.report = await models.PayoutExport.createExport(report);

			data.payoutExportId = res.report._id;
		}

		data.createdBy = _.get(user, '_id');
		data.status = PayoutCollectStatus.Confirmed;

		const collectionDoc = await models.PaymentCollection.create(data);

		if (res.report) {
			res.report.collectionIds = [collectionDoc._id];
			await models.PayoutExport.updateOne(
				{
					_id: res.report._id,
				},
				{
					$set: {
						collectionIds: [collectionDoc._id],
					},
				}
			);
		}
	}

	return res;
}

async function updateCollectionCard(cardId, data, user) {
	const card = await models.PaymentCard.findById(cardId);

	if (!card) {
		throw new ThrowReturn().status(404);
	}

	card.swipeStatus = data.swipeStatus || card.swipeStatus;
	if (user) {
		card.updatedBy = user._id;
	}

	await card.save();

	return {
		swipeStatus: card.swipeStatus,
	};
}

module.exports = {
	getPaymentCollections,
	getSupportOTAs,
	confirmAwaitingCollections,
	updateCollectionCard,
};
