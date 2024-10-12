/* eslint-disable no-inner-declarations */
require('module-alias/register');
require('@utils/ext');
require('@src/init/db').initDB();

const { countries } = require('country-data');
const moment = require('moment');
const _ = require('lodash');
const fs = require('fs');
const xlsx = require('xlsx');
const crypto = require('crypto');
const sharp = require('sharp');
const path = require('path');
const mime = require('mime-types');
const HttpsProxyAgent = require('https-proxy-agent');
const parseCsv = require('csv-parse/lib/sync');
const { customAlphabet } = require('nanoid');
const mongoose = require('mongoose');
const { parsePhoneNumber } = require('libphonenumber-js');

const { UPLOAD_CONFIG } = require('@config/setting');
const models = require('@models');
const { normPhone, isVirtualPhone } = require('@utils/phone');
const fetch = require('@utils/fetch');
const { atob, btoa } = require('@utils/func');
const { groupDates } = require('@utils/date');
const { downloadContentFromUrl, checkFolder } = require('@utils/file');

// const { downloadContentFromUrl } = require('@utils/file');
const { removeAccents } = require('@utils/generate');
const { logger } = require('@utils/logger');
const {
	BookingStatus,
	PayoutType,
	PayoutStates,
	OTAs,
	ROOM_GROUP_TYPES,
	OTANotHaveRatePlan,
	OTAsIgnoreParentRate,
	Services,
	GUEST_GROUP_LAST_TIME,
} = require('@utils/const');

// const { getHeaders } = require('@controllers/ota_api/headers/traveloka');
const { decryptData, encryptData, md5 } = require('@utils/crypto');

const limit = 5000;
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);
const state = {};

const { ObjectId } = mongoose.Types;

async function run() {
	console.time('run');

	// await syncZaloMsgs();

	// await guestStats();

	// await syncRevenuesCashFlows({
	// 	otaBookingId: '999234097751121',
	// });
	// await syncPayoutCashFlows();p
	// await syncPayoutTransactionFees();

	// await cloneLayout({
	// 	fromLayoutId: '637455a1c447808e3f1cb6a9',
	// 	toBlockId: '65d32ba28632ac3b4c7a4a99',
	// });

	// await cloneRooms({ parentRoomId: '63744ab81c5dd66bd466ed50', newParentRoomId: '65d32ba28632ac3b4c7a4ac9' });

	// console.log(encryptData('db235FGE4@4/**3J='));

	// const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
	// 	namedCurve: 'secp256k1',
	// 	modulusLength: 2048,
	// 	publicKeyEncoding: {
	// 		type: 'spki',
	// 		format: 'pem',
	// 	},
	// 	privateKeyEncoding: {
	// 		type: 'pkcs8',
	// 		format: 'pem',
	// 	},
	// });

	// console.log('The public key is: ');
	// console.log(publicKey.toString('base64'));
	// console.log('The private key is: ');
	// console.log(privateKey.toString('base64'));

	// const user = 'service.mb01';
	// const pass = 'gvdfW3@ewe12';

	// console.log(Buffer.from(`${user}:${pass}`).toString('base64'));

	// const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);

	// const user = nanoid(24);
	// const pass = nanoid(12);

	// await autoGroupsGuestV2();

	// await groupGuests();

	// await exportGuests();

	// await exportHomes();

	// await syncPriceTasks();

	await generateBlockConfigs();

	// await syncCommission();

	await syncRevenueStreams();

	// await syncRevenueStreamsCoop();

	// await checkRevneueStream();

	// await syncCostStreams();

	// await checkModifiedBookings();

	console.timeEnd('run');
}

const {
	onRevenueStreamUpdated,
	onCoopRevenueUpdated,
	onExpensesStreamUpdated,
} = require('@controllers/report/stream/index');

async function syncCostStreams(page = 1) {
	// onExpensesStreamUpdated
	const blockId = '5d0863b1b01f6c277cff26df';

	const slimit = 100;

	const payouts = await models.Payout.find({
		blockIds: blockId,
		payoutType: 'pay',
		// endPeriod: { $gte: '2024-01', $lte: '2024-08' },
		state: { $ne: 'deleted' },
		'reportStreams.0': { $exists: true },
		// _id: '66ac454900a008683777bf96',
	})
		.sort({ _id: 1 })
		.skip((page - 1) * slimit)
		.limit(slimit);

	await payouts.asyncMap(onExpensesStreamUpdated);

	console.log('done syncCostStreams page', page, payouts.length);

	if (payouts.length === slimit) {
		return syncCostStreams(page + 1);
	}
}

async function checkRevneueStream() {
	const v1BlockIds = [
		'6539bdafe1ca7048878aebe3',
		'661658fbd852adfdc0a9da5e',
		'6618db2f3f0927ebf4e72415',
		'66f23c091efbb571902959f0',
		'64ad0397c061809edba4f25a',
		'63744ab81c5dd66bd466ed4d',
	];

	const { getReport } = require('@controllers/finance/reportHost');

	const blockId = ObjectId('5d35cea9df573614d3541fc9');

	const feeCategoryIds = [
		'66f0f19b1243cd956f14af92', //
		'66f0f1c61243cd956f14afff',
	];

	// const categoryIds = [ObjectId('66f0e43c1243cd956f148bda'), ObjectId('66f0e4571243cd956f148c22')];
	const categoryIds = [
		ObjectId('66f0e4571243cd956f148c22'),
		ObjectId('66f0e43c1243cd956f148bda'), //
	];

	const key = 'manageFeeRedux';

	// const from = '2024-09-01';
	// const to = '2024-09-30';

	const periods = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'];

	const blocks = await models.Block.find({
		_id: { $nin: v1BlockIds },
		// isProperty: true,
		isTest: false,
	});

	// const otaNames = [
	// 	'tb.com',
	// 	'facebook',
	// 	'zalo',
	// 	// 'tb_extend',
	// 	'instagram',
	// 	'whatsapp',
	// 	'zalo_oa',
	// 	'line',
	// 	'hotline',
	// 	'email',
	// 	'telegram',
	// ];

	await blocks.asyncForEach(async block => {
		await periods.asyncForEach(async period => {
			let [from, to] = block.findDatesOfPeriod(period);

			from = from.toDateMysqlFormat();
			to = to.toDateMysqlFormat();

			const allstreams = await models.ReportStreamTransaction.aggregate([
				{
					$match: {
						date: { $gte: from, $lte: to },
						blockId: block._id,
						source: 1,
						$or: [
							{
								categoryId: { $in: categoryIds },
							},
							{
								projectId: { $in: categoryIds },
							},
						],
					},
				},
				{
					$group: {
						_id: { bookingId: '$bookingId', categoryId: '$categoryId' },
						amount: { $sum: '$amount' },
					},
				},
			]);

			const report = await getReport({
				blockId: block._id,
				from,
				to,
			});

			const groups = _.groupBy(
				[...report.revenue.revenues.data, ...report.revenue.otherRevenues.data],
				'bookingId'
			);

			const streamGroups = _.groupBy(allstreams, '_id.bookingId');
			const rmix = 11;

			_.forEach(groups, (rbookings, bookingId) => {
				const rAmount = _.sumBy(rbookings, key);

				const streams = streamGroups[bookingId];

				if (!streams || !streams.length) {
					if (rAmount) {
						console.log(bookingId, block._id, period, period, rAmount, 0);
					}
					return;
				}

				const streamAmount =
					_.sumBy(streams, s => (!feeCategoryIds.includes(s._id.categoryId.toString()) ? s.amount : 0)) *
						1.08 -
					_.sumBy(streams, s => (feeCategoryIds.includes(s._id.categoryId.toString()) ? s.amount : 0));

				if (Math.abs(rAmount - streamAmount) > rmix) {
					console.log(bookingId, block._id, period, rAmount, streamAmount);
				}
			});

			const diffs = _.differenceBy(_.keys(groups), _.keys(streamGroups), _.toString);

			if (diffs.length) {
				console.log('diffs', block._id, period, diffs);
			}
		});
	});

	// const { isReduxCommission } = require('@controllers/finance/report_host/utils');

	// bookings.forEach(booking => {
	// 	const stream = streams.find(s => s._id.toString() === booking._id.toString());

	// 	if (!stream) {
	// 		console.log(booking._id, stream.amount);

	// 		return;
	// 	}

	// 	booking.otaFee = booking.otaFee || 0;

	// 	const price = isReduxCommission(booking.otaName, booking.rateType, booking.to)
	// 		? booking.price - booking.otaFee
	// 		: booking.price;

	// 	const amount = _.round(price * 0.25);

	// 	if (amount !== _.round(stream.amount)) {
	// 		console.log(booking._id, amount, stream.amount);
	// 	}
	// });

	// console.log(diffs);
}

async function syncCommission(page = 1) {
	const slimit = 100;

	const otaName = [
		'tb.com',
		'facebook',
		'zalo',
		'tb_extend',
		'instagram',
		'whatsapp',
		'zalo_oa',
		'line',
		'hotline',
		'email',
		'telegram',
	];

	const snt = '63744ab81c5dd66bd466ed4d';

	const bookings = await models.Booking.find({
		// blockId: { $ne: snt },
		blockId: { $eq: '650ba59b902495e14d88723c' },
		from: { $gte: new Date('2024-09-01') },
		otaName,
		status: { $in: [BookingStatus.CHARGED, BookingStatus.NOSHOW, BookingStatus.CONFIRMED] },
	})
		.skip((page - 1) * slimit)
		.limit(slimit);

	await Promise.all(
		bookings.map(async b => {
			const otaFee = await b.getLocalOtaFee();

			if (_.isNumber(otaFee)) {
				b.otaFee = otaFee;

				await b.save();
			}
		})
	);

	console.log('done syncCommission page', page, bookings.length);

	if (bookings.length === slimit) {
		await syncCommission(page + 1);
	}
}

async function syncRevenueStreams(page = 1) {
	const v1BlockIds = [
		'6539bdafe1ca7048878aebe3',
		'661658fbd852adfdc0a9da5e',
		'6618db2f3f0927ebf4e72415',
		'66f23c091efbb571902959f0',
		'64ad0397c061809edba4f25a',
		'63744ab81c5dd66bd466ed4d',
	];

	// const otaName = [
	// 	'tb.com',
	// 	'facebook',
	// 	'zalo',
	// 	'tb_extend',
	// 	'instagram',
	// 	'whatsapp',
	// 	'zalo_oa',
	// 	'line',
	// 'hotline',
	// 	'email',
	// 	'telegram',
	// ];

	const slimit = 100;

	const filter = {
		blockId: {
			// $nin: v1BlockIds,
			$eq: mongoose.Types.ObjectId('5dfc5c0f9a63f518e0b1e449'),
		},
		to: { $gte: new Date('2024-01-01') },
		// blockId: '5d35cea9df573614d3541fc9',
		// to: { $gt: new Date('2024-09-01') },
		// otaName,
		// _id: '66d5f11db112ce84aa24c9e5',
		// otaBookingId: '1227049696',
		// bookingFee: { $gt: 0 },
	};

	const bookings = await models.Booking.find({
		...filter,
		status: { $in: [BookingStatus.CHARGED, BookingStatus.NOSHOW, BookingStatus.CONFIRMED] },
	})
		// .sort({ $natural: 1 })
		.skip((page - 1) * slimit)
		.limit(slimit);

	await Promise.all(bookings.map(b => onRevenueStreamUpdated(b)));

	const cancelledBookings = await models.Booking.find({
		...filter,
		status: BookingStatus.CANCELED,
	}).select('_id');

	await models.ReportStreamTransaction.deleteMany({
		bookingId: { $in: _.map(cancelledBookings, '_id') },
	});

	console.log('done syncRevenueStreams page', page, bookings.length);

	if (bookings.length === slimit) {
		return syncRevenueStreams(page + 1);
	}
}

async function syncRevenueStreamsCoop() {
	//
	const v1BlockIds = [
		'63744ab81c5dd66bd466ed4d',
		'64ad0397c061809edba4f25a',
		'6539bdafe1ca7048878aebe3',
		'661658fbd852adfdc0a9da5e',
		'6618db2f3f0927ebf4e72415',
		'66f23c091efbb571902959f0',
	];

	const blocks = await models.Block.find({ _id: v1BlockIds });

	const periods = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08'];
	// const periods = ['2024-08'];

	await blocks.asyncForEach(block => {
		return periods.asyncForEach(period => {
			const [from, to] = block.findDatesOfPeriod(period);

			console.log(block._id, from, to);

			return onCoopRevenueUpdated({
				blockId: block._id,
				from,
				to,
			});
		});
	});
}

async function generateBlockConfigs() {
	const { REVENUE_STREAM_CALC_TYPES, REPORT_STREAM_SOURCES, REVENUE_STREAM_TYPES } = require('@utils/const');

	// const v1BlockIds = [
	// 	'6539bdafe1ca7048878aebe3',
	// 	'661658fbd852adfdc0a9da5e',
	// 	'6618db2f3f0927ebf4e72415',
	// 	'66f23c091efbb571902959f0',
	// 	'64ad0397c061809edba4f25a',
	// 	'63744ab81c5dd66bd466ed4d',
	// ];

	const blocks = await models.Block.find({
		// isProperty: true,
		_id: '5dfc5c0f9a63f518e0b1e449',
		// _id: { $nin: v1BlockIds },
	});

	const otas = await models.BookingSource.find().lean();
	const otaObjs = _.keyBy(otas, 'name');

	const longTermOTAs = [OTAs.Famiroom];

	const categoryIds = {
		manageFee: '66f0e43c1243cd956f148bda',
		subscription: '66f0e4571243cd956f148c22',
		commission: '66f0e4681243cd956f148c52',
		coop: '66f0e4831243cd956f148c99',
		other: '66ff70fb441b66fdb4e7af85',
	};
	const costCategoryIds = {
		operation: '66f0f19b1243cd956f14af92',
		transaction: '66f0f1c61243cd956f14afff',
		otherTransaction: '6704b358441b66fdb42b014f',
	};

	const vatRate = 0.08;
	const taxRate = 0.07;

	const withVAT = val => _.round(val / (1 + vatRate), 4);

	await blocks.asyncMap(async block => {
		const config = block.getManageFee();
		const type = config.version === 2 ? REVENUE_STREAM_TYPES.BY_TRANSACTION : REVENUE_STREAM_TYPES.BY_PROFIT;

		const revenueStreams = [
			{
				source: REPORT_STREAM_SOURCES.CZ,
				type,
				transactions: [],
			},
			{
				source: REPORT_STREAM_SOURCES.OWNER,
				type,
				transactions: [],
			},
		];

		let OTAProperties = block.OTAProperties.map(o => o.toJSON());

		OTAProperties = _.uniqBy(
			[
				...OTAProperties,
				...otas.filter(o => !['TA', 'AGENCY'].includes(o.group)).map(o => ({ otaName: o.name })),
			],
			'otaName'
		);

		const status = [BookingStatus.CONFIRMED, BookingStatus.NOSHOW];

		const addComTransactions = (OTAProperty, streams) => {
			if (OTAProperty.commission && otaObjs[OTAProperty.otaName].group === 'tb_MARKETING') {
				const comBefore09 = 15;
				const comAfter09 = 16.2;
				const com1 = withVAT(comBefore09);
				const com2 = withVAT(comAfter09);

				streams.push(
					{
						otaName: OTAProperty.otaName,
						streamCategoryId: categoryIds.commission,
						ratio: com1,
						calcType: REVENUE_STREAM_CALC_TYPES.BEFORE_COMMISSION,
						startDate: '2024-08-20',
						status,
						endDate: moment(OTAProperty.startDate).add(-1, 'day').format('Y-MM-DD'),
					},
					{
						otaName: OTAProperty.otaName,
						streamCategoryId: categoryIds.commission,
						ratio: com2,
						calcType: REVENUE_STREAM_CALC_TYPES.BEFORE_COMMISSION,
						status,
						startDate: OTAProperty.startDate,
						endDate: OTAProperty.endDate || '',
					}
				);
			}
		};

		if (type === 1) {
			revenueStreams[0].transactions.push(
				{
					streamCategoryId: categoryIds.other,
					ratio: withVAT(100),
					calcType: REVENUE_STREAM_CALC_TYPES.AFTER_COMMISSION,
					status: [BookingStatus.CHARGED],
				},
				{
					projectId: categoryIds.manageFee,
					streamCategoryId: costCategoryIds.otherTransaction,
					ratio: 100,
					calcType: REVENUE_STREAM_CALC_TYPES.TRANSACTION_FEE,
					status: [BookingStatus.CHARGED],
				}
			);

			OTAProperties.forEach(OTAProperty => {
				addComTransactions(OTAProperty, revenueStreams[0].transactions);

				const czRatio = longTermOTAs.includes(OTAProperty.otaName)
					? config.longTerm * 100
					: config.shortTerm * 100;

				const ratio1 = czRatio ? withVAT(czRatio - 2) : 0;
				const ratio2 = czRatio ? withVAT(2) : 0;

				revenueStreams[0].transactions.push(
					{
						otaName: OTAProperty.otaName,
						streamCategoryId: categoryIds.manageFee,
						ratio: withVAT(czRatio),
						endDate: '2024-08-31',
						calcType: REVENUE_STREAM_CALC_TYPES.AFTER_COMMISSION,
						status,
					},
					{
						otaName: OTAProperty.otaName,
						streamCategoryId: categoryIds.manageFee,
						startDate: '2024-09-01',
						ratio: ratio1,
						calcType: REVENUE_STREAM_CALC_TYPES.AFTER_COMMISSION,
						status,
					},
					{
						otaName: OTAProperty.otaName,
						streamCategoryId: categoryIds.subscription,
						ratio: ratio2,
						startDate: '2024-09-01',
						calcType: REVENUE_STREAM_CALC_TYPES.AFTER_COMMISSION,
						status,
					}
				);
				if (czRatio) {
					revenueStreams[0].transactions.push(
						{
							otaName: OTAProperty.otaName,
							streamCategoryId: costCategoryIds.operation,
							calcType: REVENUE_STREAM_CALC_TYPES.COMMISSION,
							projectId: categoryIds.manageFee,
							ratio: czRatio,
							status,
						},
						{
							otaName: OTAProperty.otaName,
							streamCategoryId: costCategoryIds.transaction,
							projectId: categoryIds.manageFee,
							ratio: czRatio,
							calcType: REVENUE_STREAM_CALC_TYPES.TRANSACTION_FEE,
							status,
						}
					);
					if (config.hasTax) {
						revenueStreams[0].transactions.push(
							{
								otaName: OTAProperty.otaName,
								streamCategoryId: costCategoryIds.operation,
								projectId: categoryIds.manageFee,
								calcType: REVENUE_STREAM_CALC_TYPES.COMMISSION,
								ratio: (czRatio / 100) * taxRate * 100,
								status,
							},
							{
								otaName: OTAProperty.otaName,
								streamCategoryId: costCategoryIds.transaction,
								projectId: categoryIds.manageFee,
								ratio: (czRatio / 100) * taxRate * 100,
								calcType: REVENUE_STREAM_CALC_TYPES.TRANSACTION_FEE,
								status,
							}
						);
					}
				}

				revenueStreams[1].transactions.push({
					otaName: OTAProperty.otaName,
					streamCategoryId: categoryIds.coop,
					ratio: 100 - czRatio,
					calcType: 2,
					status,
				});
			});
		} else {
			revenueStreams[0].transactions.push({
				projectId: categoryIds.coop,
				streamCategoryId: costCategoryIds.operation,
			});
			revenueStreams[1].transactions.push({
				projectId: categoryIds.coop,
				streamCategoryId: costCategoryIds.operation,
			});

			if (block._id.toString() === '63744ab81c5dd66bd466ed4d') {
				revenueStreams[0].transactions.push({
					streamCategoryId: costCategoryIds.manageFee,
					calcType: REVENUE_STREAM_CALC_TYPES.FIXED,
					operation: {
						operator: '/',
						values: [18000000, 1 + vatRate],
					},
				});
			}
			if (block._id.toString() === '6618db2f3f0927ebf4e72415') {
				revenueStreams[0].transactions.push({
					streamCategoryId: costCategoryIds.manageFee,
					calcType: REVENUE_STREAM_CALC_TYPES.IN_REPORT,
					operation: {
						operator: '/',
						values: [
							{
								operator: '+',
								values: [
									'fees.data.cost_of_outsourcing_services.total',
									'fees.data.direct_labor_cost.total',
								],
							},
							1 + vatRate,
						],
					},
				});
			}

			OTAProperties.forEach(OTAProperty => {
				if (OTAProperty.commission && otaObjs[OTAProperty.otaName].group === 'tb_MARKETING') {
					revenueStreams[2] = revenueStreams[2] || {
						source: REPORT_STREAM_SOURCES.CZ,
						type: REVENUE_STREAM_TYPES.BY_TRANSACTION,
						transactions: [],
					};
					addComTransactions(OTAProperty, revenueStreams[2].transactions);
				}
			});
		}

		revenueStreams.forEach(revenueStream => {
			const group = _.groupBy(
				revenueStream.transactions,
				t =>
					`${t.streamCategoryId}${t.projectId}${t.status && t.status.join('')}${t.ratio}${t.calcType}${
						t.startDate
					}${t.endDate}`
			);

			revenueStream.transactions = _.values(group).map(gg => {
				return {
					...gg[0],
					otaName: _.compact(_.map(gg, 'otaName')),
				};
			});
		});

		await models.BlockConfig.updateOne(
			{
				blockId: block._id,
			},
			{
				revenueStreams,
			},
			{
				upsert: true,
			}
		);
	});
}

async function syncPriceTasks() {
	const tasks = await models.Task.find({
		blockId: '6618db2f3f0927ebf4e72415',
		category: '5e01ed50e708e7f56a8ec081',
		status: 'waiting',
	});

	console.log('Total tasks', tasks.length);

	await tasks.asyncForEach(task => {
		return task.updatePriceVAT();
	});
}

async function exportHomes() {
	const listingController = require('@controllers/client/listing');

	const blocks = await models.Block.find({
		isTest: false,
		active: true,
		isProperty: true,
		visibleOnWebsite: { $ne: false },
		'listingIds.0': { $exists: true },
	})
		.select({
			info: 1,
		})
		.sort({ order: 1, createdAt: -1 })
		.lean();

	const language = 'vi';

	const hotels = await blocks.asyncMap(async block => {
		const rs = {
			_id: block._id,
			address: {
				vi: block.info.address,
				en: block.info.address_en,
			},
			name: block.info.name,
			location: block.info.location,
			slug: block.info.url,
		};

		let data = await listingController.getBlockByUrl(rs.slug, {
			available: 2,
			language,
		});

		const [roomContents, blockContent] = await Promise.all([
			models.BlockStaticContent.find({
				otaListingId: {
					$in: _.map(data.roomTypes, 'otaListingId'),
				},
				contentType: 'ROOM',
			})
				.select({
					otaListingId: 1,
					content: 1,
				})
				.lean(),
			models.BlockStaticContent.findOne({
				blockId: block._id,
				contentType: 'PROPERTY',
			})
				.select({
					content: 1,
				})
				.lean(),
		]);

		rs.attributes = _.compact(_.map(_.get(blockContent, 'content.facilities'), 'id.name.vi'));
		rs.attributesEn = _.compact(_.map(_.get(blockContent, 'content.facilities'), 'id.name.en'));

		rs.roomTypes = data.roomTypes.map(listing => {
			const roomContent =
				_.get(
					roomContents.find(rt => rt.otaListingId === listing.otaListingId),
					'content'
				) || {};

			return {
				id: listing.otaListingId,
				slug: listing.url,
				displayName: listing.name,
				info: roomContent.info || {
					bathroom: _.get(listing.info, 'bathrooms'),
					bed: _.get(listing.info, 'beds'),
					bedroom: _.get(listing.info, 'bedrooms'),
				},
				occupancy: roomContent.occupancy || {
					standardGuest: _.get(listing.info, 'accommodates'),
				},
				type: _.get(roomContent.type, 'name.vi') || 'Studio',
				description: _.get(roomContent.description, 'vi'),
				attributes: _.compact(_.map(roomContent.amenities, 'id.name.vi')),
				attributesEn: _.compact(_.map(roomContent.amenities, 'id.name.en')),
				tags: roomContent.tags,
			};
		});

		return rs;
	});

	fs.writeFileSync('hotels.json', JSON.stringify(hotels), 'utf-8');
}

async function exportGuests() {
	const bookings = await models.Booking.find()
		.select('guestId guestIds createdAt from to price currency otaName otaBookingId status')
		.populate('blockId', 'info.name')
		.lean();

	const bookers = {};
	// const stays = {};

	bookings.forEach(booking => {
		const guestIds = [booking.guestId, ...(booking.guestIds || [])];

		_.forEach(guestIds, guestId => {
			bookers[guestId] = bookers[guestId] || [];
			bookers[guestId].push(booking);
		});

		booking.homeName = _.get(booking.blockId, 'info.name') || '';

		delete booking.guestId;
		delete booking.guestIds;
		delete booking.blockId;
	});

	const guests = await models.Guest.find({
		active: true,
		// merged: false,
	})
		.select(
			'_id fullName email phone ota otaId createdAt country genius passportNumber address gender dayOfBirth ottIds'
		)
		.lean();

	// const guestBookers = [];
	// const guestStays = [];
	// const guestNonStays = [];

	// guests.forEach(guest => {
	// 	if (bookers[guest._id]) {
	// 		guestBookers.push(guest);
	// 	} else if (stays[guest._id]) {
	// 		guestStays.push(guest);
	// 	} else {
	// 		guestNonStays.push(guest);
	// 	}
	// });

	guests.forEach(guest => {
		if (bookers[guest._id]) {
			guest.bookings = bookers[guest._id];
		}
	});

	await fs.promises.writeFile('guests.json', JSON.stringify(guests), 'utf-8');

	// await fs.promises.writeFile('guestBookers.json', JSON.stringify(guestBookers), 'utf-8');
	// await fs.promises.writeFile('guestStays.json', JSON.stringify(guestStays), 'utf-8');
	// await fs.promises.writeFile('guestNonStays.json', JSON.stringify(guestNonStays), 'utf-8');
}

async function autoGroupsGuestV2(page = 1) {
	const { mergeGuest } = require('@controllers/guest/mergerV2');

	state.processed = state.processed || [];
	state.totalMerged = state.totalMerged || 0;
	state.totalNewGuest = state.totalNewGuest || 0;

	const groupLimit = 100;

	const filter = {
		groupKey: 'phone',
		total: { $gt: 2 },
		groupValue: { $nin: state.processed },
		// groupValue: '+861059563064',
	};

	if (page === 1) {
		const total = await models.GuestGroup.countDocuments(filter);

		console.log('autoGroupsGuestV2 -> total', total);
	}

	const groups = await models.GuestGroup.find(filter).limit(groupLimit);

	const ids = [];

	await groups.asyncMap(async group => {
		state.processed.push(group.groupValue);

		const guests = await models.Guest.find({
			active: true,
			merged: false,
			phone: group.groupValue,
		});

		if (guests.length <= 1) return;

		let names = [];

		guests.forEach(guest => {
			const normName = removeAccents(_.trim(guest.fullName))
				.replace(/\/|\\/g, ' ')
				.replace(/,/g, '')
				.split(' ')
				.filter(r => r)
				.sort()
				.join(' ');

			if (normName) {
				names.push({ guest, normName });
			}
		});

		names.sort((a, b) => (a.normName > b.normName ? 1 : -1));
		// names.sort();

		// console.log(names);

		const groupNames = groupName(names);

		// console.log(groupNames);

		const maxGroup = _.maxBy(groupNames, a => a.length);

		// console.log(maxGroup);

		// const isMatch = names.every((name, index) => {
		// 	if (!names[index + 1]) return true;

		// 	if (name.every(n => names[index + 1].includes(n))) {
		// 		return true;
		// 	}

		// 	return false;
		// });

		const rateCond = 0.5;
		const isMatch = maxGroup.length / names.length > rateCond;

		if (isMatch) {
			const listGuests = _.map(maxGroup, 'guest');

			const newGuest = await mergeGuest(listGuests);

			await models.GuestV2.create(newGuest);

			state.totalMerged += listGuests.length;
			state.totalNewGuest += 1;

			ids.push(..._.map(listGuests, '_id'));
		}
	});

	if (ids.length) {
		await models.GuestGroup.syncGuestIds(ids, true);
		// console.log('autoGroupsGuestV2 -> merged', ids.length);
	}

	console.log('autoGroupsGuestV2 -> page', `${page * groupLimit}`);

	if (groups.length === groupLimit) {
		await autoGroupsGuestV2(page + 1);
	} else {
		console.log('autoGroupsGuestV2 -> merged', state.totalMerged, state.totalNewGuest);
	}
}

function equalTwoName(g1, g2) {
	const g1a = g1.split(' ');
	const g2a = g2.split(' ');

	const isMatch = g1a.every(name => g2a.includes(name)) || g2a.every(name => g1a.includes(name));

	return isMatch;
}

function groupName(arr) {
	const groups = [];

	let cloneArr = [...arr];

	while (cloneArr.length) {
		const lastGroup = cloneArr[0];

		const gg = [lastGroup];

		cloneArr.forEach((gn, i) => {
			if (i === 0) {
				return;
			}

			if (equalTwoName(gn.normName, lastGroup.normName)) {
				gg.push(gn);
			}
		});

		cloneArr = cloneArr.filter(a => !gg.includes(a));

		groups.push(gg);
	}

	// cloneArr.forEach((gname, index) => {
	// 	if (index === 0) {
	// 		groups.push([gname]);
	// 		return;
	// 	}

	// 	const lastGroup = _.last(groups);

	// 	if (lastGroup.some(gg => equalTwoName(gname.normName, gg.normName))) {
	// 		lastGroup.push(gname);
	// 	} else {
	// 		groups.push([gname]);
	// 	}
	// });

	return groups;
}

run();

async function groupGuests() {
	const keys = ['phone', 'fullName', 'passportNumber', 'email'];

	for (const key of keys) {
		const filterPipeline = [
			{
				$match: {
					active: true,
					merged: false,
					[key]: { $nin: [null, ''] },
					createdAt: { $lt: GUEST_GROUP_LAST_TIME },
				},
			},
			// {
			// 	$project: {
			// 		phone: 1,
			// 		fullName: 1,
			// 		displayName: 1,
			// 		passportNumber: 1,
			// 		email: 1,
			// 		country: 1,
			// 		gender: 1,
			// 		dayOfBirth: 1,
			// 		address: 1,
			// 		createdAt: 1,
			// 	},
			// },
			{
				$group: {
					_id: `$${key}`,
					total: { $sum: 1 },
				},
			},
		];

		const groups = await models.Guest.aggregate([...filterPipeline]).allowDiskUse(true);

		const bulks = groups
			.filter(group => _.trim(group._id))
			.map(group => ({
				updateOne: {
					filter: {
						groupKey: key,
						groupValue: group._id,
					},
					update: {
						total: group.total,
					},
					upsert: true,
				},
			}));

		await models.GuestGroup.bulkWrite(bulks);
	}
}

async function syncRevenuesCashFlows({ page = 1, ...dfilter }) {
	const date = new Date('2024-06-01');

	const skip = (page - 1) * limit;
	const filter = {
		...dfilter,
		// otaBookingId: 'JC37V5',
		// otaBookingId: '5IBSAE',
		// otaBookingId: '1018095196',
		// otaBookingId: '377830223',
		// otaBookingId: '1005120992',
		// otaBookingId: 'U2QLY9',
		// otaBookingId: '13GUJ4',
		// otaBookingId: 'RJCWYD',
		// otaBookingId: 'EOA2HP',
		// otaBookingId: 'QZMBAG',
		// otaBookingId: '1043034080',
		// blockId: '63744ab81c5dd66bd466ed4d',
		// 'relativeBookings.0': { $exists: true },
		// otaName: OTAs.Agoda,
		// status: BookingStatus.CANCELED,
		// rateType: 'PAY_NOW',
	};

	const allBookings = await models.Booking.find({
		// to: { $gte: date },
		// status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHARGED, BookingStatus.NOSHOW] },
		// status: { $in: [BookingStatus.CANCELED, BookingStatus.CHARGED] },
		...filter,
	})
		.select('otaBookingId otaName')
		// .select('-histories')
		.skip(skip)
		.limit(limit)
		.lean();

	console.time(page);

	console.log(allBookings.length);

	await _.values(_.groupBy(allBookings, b => b.otaName + b.otaBookingId)).asyncMap(async b => {
		await models.CashFlow.setBookingFlow({ bookingId: b[0]._id });
	});

	console.timeEnd(page);

	if (allBookings.length >= limit) {
		await syncRevenuesCashFlows({ page: page + 1 });
	}
}

async function syncPayoutCashFlows(page = 1) {
	const date = new Date('2024-01-01');

	const filter = {
		paidAt: { $gte: date },
		payoutType: PayoutType.PAY,
		state: { $ne: PayoutStates.DELETED },
		// blockIds: { $in: ['6539bdafe1ca7048878aebe3'] },
	};
	const skip = (page - 1) * limit;

	console.time(page);

	const payouts = await models.Payout.find({
		...filter,
	})
		.skip(skip)
		.limit(limit)
		.select('-logs')
		.lean();
	console.log(payouts.length);

	await payouts.asyncMap(async payout => {
		await models.CashFlow.setPayoutFlow(payout);
	});

	console.timeEnd(page);

	if (payouts.length >= limit) {
		await syncPayoutCashFlows(page + 1);
	}
}

async function syncZaloMsgs() {
	// const users = await models.User.find({ enable: true, 'otts.ottName': 'zalo' });

	// const ottIds = users.map(user => user.otts.filter(o => o.ottName === 'zalo').map(o => o.ottId)).flat();

	// console.log('ottIds', ottIds.length);

	const ZaloDB = require('@services/zalo/personal/database');
	const { parseMessage } = require('@services/zalo/personal/utils');
	const { runJobs } = require('@controllers/message/autoTask/index');

	const groupId = 'g4687216840850279869';
	const time = moment().startOf('day').toDate().valueOf().toString();

	const msgs = await ZaloDB.Message()
		.find({ sendDttm: { $gt: time }, toUid: groupId })
		.sort({ sendDttm: 1 })
		.toArray();

	console.log('msgs', msgs.length);

	await msgs.asyncForEach(async (msg, index) => {
		const msgDoc = await parseMessage(msg);
		const thread = await models.Messages.findOne({ threadId: msg.toUid });

		await runJobs({
			msgDoc,
			thread,
			ottName: 'zalo',
			ottAccount: msg.account,
			time: new Date(Number(msg.sendDttm)),
			ottId: msg.fromUid,
			msgInfo: msg,
		}).catch(e => {
			console.error('runJobs', msg);
		});
		console.log('done', index);
	});
}

async function cloneRooms({ parentRoomId, newParentRoomId }) {
	const blockId = mongoose.Types.ObjectId('65d32ba28632ac3b4c7a4a99');

	const rooms = await models.Room.find({ parentRoomId })
		.select('-relationRoomIds -blockId -parentRoomId -lock -virtual')
		.lean();

	if (!newParentRoomId || !rooms.length) return;

	const newRooms = await models.Room.insertMany(
		rooms.map(r => {
			return {
				...r,
				_id: undefined,
				virtual: false,
				blockId,
				parentRoomId: newParentRoomId,
			};
		})
	);

	await models.Room.updateOne({ _id: newParentRoomId }, { $set: { roomIds: _.map(newRooms, '_id') } });

	await rooms.asyncMap((r, index) => cloneRooms({ parentRoomId: r._id, newParentRoomId: newRooms[index]._id }));
}

async function cloneLayout({ fromLayoutId, toBlockId }) {
	const layout = await models.BlockLayout.findOne({ _id: fromLayoutId, layoutType: 'ROOT' })
		.populate({
			path: 'layouts',
			options: { sort: { order: -1 } },
			select: '-createdAt -updatedAt',
			populate: {
				path: 'layouts',
				select: '-createdAt -updatedAt',
				options: { sort: { order: -1 } },
				populate: {
					path: 'roomId',
					select: 'info.roomNo',
				},
			},
		})
		.select('-createdAt -updatedAt')
		.lean();

	const rootLayout = await models.BlockLayout.create({
		layoutType: 'ROOT',
		blockId: toBlockId,
		name: layout.name,
		viewType: layout.viewType,
	});

	await layout.layouts.asyncMap(async lY => {
		const yLayout = await models.BlockLayout.create({
			...lY,
			blockId: toBlockId,
			parentId: rootLayout._id,
			layouts: undefined,
			_id: undefined,
		});

		await lY.layouts.asyncMap(async lX => {
			const xData = {
				...lX,
				blockId: toBlockId,
				parentId: yLayout._id,
				layouts: undefined,
				_id: undefined,
			};
			if (lX.roomId) {
				const newRoom = await models.Room.findOne({
					blockId: toBlockId,
					'info.roomNo': lX.roomId.info.roomNo,
				}).select('_id');
				if (newRoom) {
					xData.roomId = newRoom._id;
				} else {
					console.error('not found roomId', xData.roomId._id);
					delete xData.roomId;
				}
			}

			await models.BlockLayout.create(xData);
		});
	});
}

async function syncPayoutTransactionFees() {
	const allPayouts = await models.Payout.find({
		payoutType: PayoutType.RESERVATION,
		collectorCustomName: 'paydi',
		transactionFee: 0,
		state: { $ne: 'deleted' },
		'currencyAmount.exchangedAmount': { $gt: 0 },
	});

	console.log(allPayouts.length);

	const paymentCollector = await models.PaymentCollector.findOne({
		tag: 'paydi',
	});

	await allPayouts.asyncMap(async payout => {
		// payout.transactionFee = await payout.getTransactionFee();
		// await payout.save();

		const date = moment(payout.paidAy).format('Y-MM-DD');

		const cond =
			paymentCollector.conds.find(c => (!c.fromDate || c.fromDate <= date) && (!c.toDate || c.toDate >= date)) ||
			_.last(paymentCollector.conds);
		if (!cond) return;

		const transactionFee = _.round(payout.currencyAmount.exchangedAmount * cond.fee);
		if (!transactionFee) return;

		payout.transactionFee = transactionFee;
		await payout.save();

		await models.CashFlow.setBookingFlow({ bookingId: payout.bookingId });
	});
}

async function guestStats() {
	let month = '2023-04';

	const stats1 = [];

	while (month <= moment().format('Y-MM')) {
		const bookings = await models.Booking.find({
			from: {
				$gte: moment(month, 'Y-MM').startOf('month').toDate(),
				$lte: _.min([moment(month, 'Y-MM').endOf('month').toDate(), moment().endOf('day').toDate()]),
			},
			status: 'confirmed',
			blockId: '63744ab81c5dd66bd466ed4d',
		})
			.select('guestId guestIds serviceType')
			.populate('guestId guestIds');

		const result = {};
		const allCountries = {};

		function pross(guest, serviceType) {
			const { country = 'VN' } = guest;

			allCountries[country] = allCountries[country] || 0;
			allCountries[country] += 1;

			const international = country && country !== 'VN';
			const isLongTerm = serviceType === 4;

			result.longterm = result.longterm || {};
			result.shortterm = result.shortterm || {};

			const temr = isLongTerm ? result.longterm : result.shortterm;

			temr.national = temr.national || 0;
			temr.international = temr.international || 0;

			if (international) {
				temr.international++;
			} else {
				temr.national++;
			}
		}

		bookings.forEach(booking => {
			pross(booking.guestId, booking.serviceType);
			booking.guestIds.forEach(g => pross(g, booking.serviceType));
		});

		const sortedCountries = _.entries(allCountries).sort((a, b) => b[1] - a[1]);
		const mostCount = 10;

		const most = _.take(sortedCountries, mostCount).map(a => ({
			country: a[0],
			label: countries[a[0]].name,
			value: a[1],
		}));

		// const others = _.sumBy(sortedCountries.slice(mostCount), '1');

		const list = ['CN', 'KR', 'IN', 'US', 'JP', 'GB', 'FR', 'ID', 'RU', 'SG', 'TH'];
		// console.log(JSON.stringify(most, '', 4));
		// console.log('others', others);

		const od = list.map(c => allCountries[c]);

		const others = _.sumBy(sortedCountries, '1') - _.sumBy(od, 'amount');

		stats1.push({
			month,
			// result,
			// most,
			others,
			od,
		});

		month = moment(month, 'Y-MM').add(1, 'month').format('Y-MM');
	}

	console.log(JSON.stringify(stats1, '', 4));
}

// async function exportBookings() {
// 	const from = new Date('2021-12-01').zeroHours();
// 	const to = new Date('2022-03-23').zeroHours();

// 	const bookings = await models.Booking.find({ to: { $gt: from }, from: { $lte: to }, status: 'confirmed' })
// 		.select('blockId guestId reservateRooms otaBookingId price otaName from to currency')
// 		.populate('guestId', 'fullName name')
// 		.populate('reservateRooms', 'info.roomNo')
// 		.populate('blockId', 'info.name');

// 	const workBook = xlsx.utils.book_new();

// 	const wsData = [
// 		['Nhà', 'Họ và Tên', 'Mã', 'Phòng', 'Nguồn', 'Checkin', 'Checkout', 'Số đêm', 'Giá'],
// 		...bookings.map(booking => {
// 			return [
// 				booking.blockId.info.name,
// 				booking.guestId.fullName || booking.guestId,
// 				booking.otaBookingId,
// 				booking.reservateRooms.map(r => r.info.roomNo).join(', '),
// 				booking.otaName,
// 				booking.from,
// 				booking.to,
// 				moment(booking.to).diff(booking.from, 'day'),
// 				booking.exchangePrice(),
// 			];
// 		}),
// 	];

// 	const ws = xlsx.utils.aoa_to_sheet(wsData);
// 	xlsx.utils.book_append_sheet(workBook, ws, 'Bookings');

// 	const fileName = `${from.toDateMysqlFormat()}_${to.toDateMysqlFormat()}.xlsx`;
// 	_.set(workBook, 'Props.Author', 'tb');
// 	const TMP_FOLDER = 'tmp';
// 	const filePath = `${TMP_FOLDER}/${fileName}`;

// 	await fs.promises.mkdir(TMP_FOLDER, { recursive: true }).catch(() => {});
// 	await xlsx.writeFile(workBook, filePath);
// }

async function checkModifiedBookings() {
	const filter = {
		blockId: { $ne: ObjectId('63744ab81c5dd66bd466ed4d') },
		to: { $gt: new Date('2024-09-01T00:00:00.000Z') },
		from: { $lte: new Date('2024-09-30T00:00:00.000Z') },
	};

	const date = new Date('2024-10-04T07:30:00.000Z');

	const bookings = await models.Booking.aggregate([
		{
			$match: {
				...filter,
				histories: {
					$elemMatch: {
						action: {
							$in: [
								'BOOKING_CANCELED',
								'BOOKING_CHARGED',
								'BOOKING_NOSHOW',
								'BOOKING_SPLIT',
								'BOOKING_UPDATE_CHECKIN',
								'BOOKING_UPDATE_CHECKOUT',
								'PRICE_UPDATE',
								'PRICE_UPDATE_AUTO',
								'FEE_ELECTRIC_UPDATE',
								'FEE_WATER_UPDATE',
								'FEE_SERVICE_UPDATE',
								'FEE_LATE_CHECKOUT',
								'FEE_EARLY_CHECKIN',
								'FEE_ROOM_UPGRADE',
								'FEE_BOOKING',
								'FEE_MANAGEMENT',
								'FEE_EXTRA_PEOPLE',
								'FEE_CHANGE_DATE',
								'FEE_CLEANING',
								'FEE_COMPENSATION',
								'FEE_VAT',
								'FEE_SERVICE',
								'FEE_INTERNET',
								'FEE_MOTOBIKE',
								'FEE_CAR',
								'FEE_LAUNDRY',
								'FEE_DRINK_WATER',
								'FEE_OTA_UPDATE',
								'PREVIOUS_ELECTRIC_QUANTITY',
								'CURRENT_ELECTRIC_QUANTITY',
								'ELECTRIC_PRICE_PER_KWH',
								'PREVIOUS_WATER_QUANTITY',
								'CURRENT_WATER_QUANTITY',
								'DEFAULT_WATER_PRICE',
								'MINIBAR',
							],
						},
						createdAt: { $gte: date },
					},
				},
			},
		},
		{
			$project: { _id: 1, otaBookingId: 1 },
		},
	]);

	const allBookings = await models.Booking.find({
		...filter,
	}).select('_id');

	const ids = _.map(allBookings, '_id');

	const payments = await models.Payout.find({
		blockIds: { $nin: [ObjectId('63744ab81c5dd66bd466ed4d'), ObjectId('5d0863b1b01f6c277cff26df')] },
		$and: [
			{
				$or: [
					{
						payoutType: 'pay',
						startPeriod: { $gte: '09-2024' },
						endPeriod: { $lte: '09-2024' },
					},
					{
						payoutType: { $ne: 'pay' },
						bookingId: { $in: ids },
					},
				],
			},
			{
				$or: [
					{
						logs: {
							$elemMatch: {
								createdAt: { $gte: date },
								field: { $in: ['currencyAmount.amount', 'transactionFee'] },
							},
						},
					},
				],
				createdAt: { $gte: date },
			},
		],
	}).select('_id');

	console.log('bookings', bookings);

	console.log('payments', payments);
}
