const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const { genUrl, removeAccents } = require('@utils/generate');
const {
	OTANotHaveProperty,
	DefaultManageFee,
	RuleDay,
	Services,
	PropertyCIType,
	RuleHour,
	RuleDelay,
	EXTRA_FEE,
	GUARANTEE_REV_TYPE,
	RuleOvernight,
	PROPERTY_TYPES,
} = require('@utils/const');
const { setDelayTime } = require('@utils/date');
const { generateStatic } = require('@services/google/map');
const { logger } = require('@utils/logger');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const DEFAULT_RULES = {
	day: {
		checkin: RuleDay.from,
		checkout: RuleDay.to,
	},
	hour: {
		maxHour: RuleHour.maxHour,
		minHour: RuleHour.minHour,
		openHour: RuleHour.openHour,
		closeHour: RuleHour.closeHour,
	},
	night: {
		checkin: RuleOvernight.from,
		checkout: RuleOvernight.to,
	},
	delay: RuleDelay,
};

const FEE_KEYS = {
	longTerm: { type: Number, default: DefaultManageFee.longTerm },
	shortTerm: { type: Number, default: DefaultManageFee.shortTerm },
	hasTax: { type: Boolean, default: DefaultManageFee.hasTax }, // Chi phí tài chính
	hasVAT: { type: Boolean, default: DefaultManageFee.hasVAT },
	includeVAT: { type: Boolean },
	includeCompensation: { type: Boolean },
	includeManageFee: { type: Boolean },
	shareExpense: { type: Boolean },
	reportType: { type: String },
	version: { type: Number },
	ignoreDebtPayment: { type: Boolean }, // không trừ doanh thu tb thu vào phần thanh toán
	// noReduxManageFee: { type: Boolean }, // không giảm trừ phí quản lí
	profits: [
		{
			min: { type: Number },
			max: { type: Number },
			czRate: { type: Number },
			guaranteeRev: { type: Number, enum: _.values(GUARANTEE_REV_TYPE) },
		},
	],
};

const MANAGE_FEE_SCHEMA = {
	...FEE_KEYS,
	conditions: _.entries(FEE_KEYS).reduce(
		(a, c) => ({
			...a,
			[c[0]]: [{ _id: false, from: String, to: String, value: c[1] }],
		}),
		{}
	),
};

const BlockSchema = new Schema(
	{
		info: {
			name: String,
			shortName: [String],
			description: String,
			address: String,
			address_en: String,
			city: String,
			location: {
				type: {
					type: String,
					enum: ['Point'],
				},
				coordinates: {
					type: Mixed,
				},
			},
			mapStatic: { type: String },
			// order: { type: Number, default: 0 },
			taskOrder: { type: Number, default: 0 },
			blog: String,
			url: String,
			logoUrl: String,
		},
		order: { type: Number },
		keywords: String,
		view: { type: Number },
		provinceId: { type: Number, ref: 'Province' },
		districtId: { type: Number, ref: 'District' },
		wardId: { type: Number, ref: 'Ward' },
		streetId: { type: Number, ref: 'Street' },
		locker: {
			hotelId: String,
			coid: String,
			forceCheckin: Boolean, // Yêu cầu checkin/out bằng thẻ
		},
		type: { type: Number, enum: Object.values(PROPERTY_TYPES), default: PROPERTY_TYPES.PROPERTY },
		ignorePrice: { type: Boolean, default: false },
		activeCodeTime: { type: String, default: RuleDay.from },
		layout: [[String]],
		virtualRoomId: { type: ObjectId, ref: 'Room' }, // list all rooms
		listingIds: [{ type: ObjectId, ref: 'Listing' }],
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		OTAProperties: [
			{
				otaName: { type: String, required: true },
				propertyId: String,
				propertyName: String,
				account: String,
				url: String,
				commission: { type: Number, min: 0 },
				startDate: String,
				endDate: String,
				active: { type: Boolean, default: true },
				isOwnerCollect: Boolean,
				bankAccountId: String,
				payoutSource: String, // PayoutSources
			},
		],
		ottId: { type: ObjectId, ref: 'Ott' },
		active: { type: Boolean, default: true },
		isProperty: { type: Boolean, default: true },
		isSelfCheckin: { type: Boolean, default: true },
		ciType: { type: String, enum: [null, ..._.values(PropertyCIType)] },
		isTest: { type: Boolean, default: false },
		staffs: {
			maid: [{ type: ObjectId, ref: 'User' }],
		},
		manageFee: MANAGE_FEE_SCHEMA,
		operationReportCategories: [{ type: String }],
		reportConfig: {
			overviewKeys: [{ key: String, title: String }],
			maxOccupancyDays: Number, // số ngày dùng để tính công suất phòng tối đa VD: 10 ngày cao nhất trong tháng
			period: [
				{
					_id: false,
					from: String, // Y-MM
					month: { type: Number, default: 1 },
					days: { type: Number },
					startDay: { type: Number, default: 1 },
				},
			],
		},
		visibleOnWebsite: Boolean,
		startRunning: mongoose.Custom.Schema.Types.Date,
		endRunning: mongoose.Custom.Schema.Types.Date,
		disableAutoTask: Boolean,
		disableReminderTask: Boolean,
		disableAutoMsg: Boolean,
		activeCalendarLog: Boolean,
		serviceTypes: [{ type: Number, enum: Object.values(Services) }],
		rules: {
			hour: {
				maxHour: { type: Number, default: RuleHour.maxHour },
				minHour: { type: Number, default: RuleHour.minHour },
				openHour: { type: String, default: RuleHour.openHour },
				closeHour: { type: String, default: RuleHour.closeHour },
				firstHours: { type: Number, default: RuleHour.firstHours },
			},
			day: {
				checkin: { type: String, default: RuleDay.from },
				checkout: { type: String, default: RuleDay.to },
			},
			night: {
				checkin: { type: String, default: RuleOvernight.from },
				checkout: { type: String, default: RuleOvernight.to },
			},
			delay: { type: Number, default: RuleDelay },
		},
		autoVATTask: Boolean,
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

BlockSchema.virtual('locks', {
	ref: 'BlockLock',
	localField: '_id',
	foreignField: 'blockId',
});

BlockSchema.pre('save', async function (next) {
	if (this.isModified('info.name')) {
		this.info.url = genUrl(this.info.name);
	}

	if (this.isModified('info.location')) {
		this.$locals.isModifiedLocation = true;
	}

	if (this.isModified('manageFee')) {
		Object.assign(this.manageFee, this.getManageFee());
	}

	if ((this.$locals.isModifiedLocation || !this.info.mapStatic) && _.get(this.info.location, 'coordinates.length')) {
		await generateStatic({
			lng: this.info.location.coordinates[0],
			lat: this.info.location.coordinates[1],
		})
			.then(res => {
				this.info.mapStatic = res.filePath;
			})
			.catch(e => {
				logger.error('generateStatic', e);
			});
	}

	const keywordFields = ['info.name', 'info.address', 'info.address_en'];

	if (keywordFields.some(k => this.isModified(k))) {
		this.keywords = removeAccents(_.compact(keywordFields.map(k => _.get(this, k))).join(' '));
	}

	this.$locals.isNew = this.isNew;

	next();
});

BlockSchema.post('save', function (doc) {
	if (this.$locals.isModifiedLocation) {
		this.model('Listing')
			.updateMany(
				{
					blockId: doc._id,
				},
				{
					location: doc.info.location,
				}
			)
			.catch(e => console.error(e));
	}

	if (this.$locals.isNew) {
		this.model('BlockConfig').create({ blockId: doc._id });
	}

	this.model('RatePlan').syncDefaultRatePlan(doc._id);
});

BlockSchema.methods = {
	async getRoomTypes(query, isLT) {
		const filter = {
			...query,
			blockId: this._id,
			virtual: false,
		};
		if (isLT) {
			filter['info.nameLT'] = { $ne: null };
		}

		const rooms = await this.model('Room')
			.find(filter)
			.select('info.name info.nameLT info.roomNo info.layoutBg info.layoutBgLT isSelling');

		const roomTypes = _.groupBy(rooms, isLT ? 'info.nameLT' : 'info.name');
		return roomTypes;
	},

	accounts(otaName) {
		return this.OTAProperties.filter(o => o.active !== false && o.otaName === otaName).map(o => o.account);
	},

	getPropertyId(otaName, account) {
		return this.OTAProperties.find(
			o => o.active !== false && o.otaName === otaName && (!account || o.account === account)
		);
	},

	validateHourReservation(from, to, serviceType = Services.Day) {
		const rules = _.get(this, 'rules', DEFAULT_RULES);

		if (serviceType === Services.Hour) {
			const hour = moment(to, 'HH:mm').diff(moment(from, 'HH:mm'), 'hour');
			if (!rules.hour) return { error: false };

			if (hour > rules.hour.maxHour || hour < rules.hour.minHour)
				return { error: true, msg: 'Number of hours invalid' };
			if (from < rules.hour.openHour || from > rules.hour.closeHour)
				return { error: true, msg: 'From out of range' };
			if (to < rules.hour.openHour || to > rules.hour.closeHour) return { error: true, msg: 'To out of range' };
			if (from >= to) return { error: true, msg: 'From is greater than to' };
		}

		return { error: false };
	},

	getRules() {
		const rules = this.rules || _.cloneDeep(DEFAULT_RULES);
		rules.delay = rules.delay || RuleDelay;

		const checkin = _.get(rules, 'day.checkin', RuleDay.from);
		const checkout = _.get(rules, 'day.checkout', RuleDay.to);
		const from = setDelayTime(checkin, rules.delay, 'SUBTRACT');
		const to = setDelayTime(checkout, rules.delay, 'ADD');

		_.set(rules, 'day.from', from);
		_.set(rules, 'day.to', to);

		const ncheckin = _.get(rules, 'night.checkin', RuleOvernight.from);
		const ncheckout = _.get(rules, 'night.checkout', RuleOvernight.to);
		const nfrom = setDelayTime(ncheckin, rules.delay, 'SUBTRACT');
		const nto = setDelayTime(ncheckout, rules.delay, 'ADD');

		_.set(rules, 'night.from', nfrom);
		_.set(rules, 'night.to', nto);

		return rules;
	},

	getManageFee(date) {
		return BlockModel.getFeeConfig(this.manageFee.toJSON(), date);
	},

	findPeriodByDate(date) {
		const periods = _.get(this.reportConfig, 'period');
		const mDateText = moment(date).format('Y-MM');

		const currentOpt = _.find(periods, p => p.from <= mDateText) || _.find(periods, p => !p.from);
		const startDay = _.get(currentOpt, 'startDay') || 1;

		if (moment(date).date() >= startDay) {
			return mDateText;
		}

		return moment(date).add(-_.get(currentOpt, 'month', 1), 'month').format('Y-MM');
	},

	getPeriods(start, end) {
		const periods = _.get(this.reportConfig, 'period');
		start = new Date(start).zeroHours();
		end = new Date(end).zeroHours();

		if (this.startRunning) {
			start = _.max([start, new Date(this.startRunning).zeroHours()]);
		}

		let mfrom = moment(start);
		const mto = moment(end).add(-1, 'day');
		const mfromText = mfrom.format('Y-MM');

		const current = _.find(periods, p => p.from <= mfromText) || _.find(periods, p => !p.from);
		const startDay = _.get(current, 'startDay') || 1;
		const month = _.get(current, 'month') || 1;
		const rs = [];

		while (mfrom.isSameOrBefore(mto, 'day')) {
			const date = moment(mfrom).date();
			const isGt = date >= startDay;

			const from = _.max([isGt ? moment(mfrom).date(startDay).toDate() : moment(mfrom).toDate(), start]);
			const to = _.min([
				isGt
					? moment(mfrom).add(month, 'month').date(startDay).toDate()
					: moment(mfrom).date(startDay).toDate(),
				end,
			]);

			rs.push({
				period: isGt ? moment(mfrom).format('Y-MM') : moment(mfrom).add(-1, 'month').format('Y-MM'),
				from,
				to,
				// diff: to.diffDays(from),
			});

			mfrom = moment(to);
		}

		return rs;
	},

	findDatesOfPeriod(period) {
		const periods = _.get(this.reportConfig, 'period');
		const currentOpt = _.find(periods, p => p.from && p.from <= period) || _.find(periods, p => !p.from);

		const startDay = _.get(currentOpt, 'startDay') || 1;
		const days = _.get(currentOpt, 'days');
		const month = _.get(currentOpt, 'month', 1);

		const start = new Date(moment(period, 'Y-MM').date(startDay).format('Y-MM-DD'));
		const end = days
			? moment(start).add(days, 'day').toDate()
			: moment(start).add(month, 'month').subtract(1, 'day').toDate();

		return [start, end];
	},
};

BlockSchema.statics = {
	getCheckPrices() {
		return this.find({ ignorePrice: { $ne: true } })
			.select('_id')
			.then(rs => rs.map(b => b._id));
	},

	getCheckGuides() {
		return this.find({ ignoreGuide: { $ne: true } })
			.select('_id')
			.then(rs => rs.map(b => b._id));
	},

	isActive(blockId) {
		return this.findOne({
			_id: blockId,
			active: true,
			isProperty: true,
		}).select('_id');
	},

	async getPropertiesId(otaName, account, includeBlockId, blockId) {
		const filter = {
			active: true,
			isProperty: true,
			isTest: false,
		};
		if (blockId && mongoose.Types.ObjectId.isValid(blockId)) {
			filter._id = mongoose.Types.ObjectId(blockId);
		}

		const [data] = await this.aggregate([
			{
				$match: filter,
			},
			{ $unwind: '$OTAProperties' },
			{
				$match: _.pickBy({
					'OTAProperties.otaName': otaName,
					'OTAProperties.account': account,
					'OTAProperties.active': { $ne: false },
				}),
			},
			{
				$group: {
					_id: null,
					properties: {
						$push: {
							propertyId: '$OTAProperties.propertyId',
							account: '$OTAProperties.account',
							bankAccountId: '$OTAProperties.bankAccountId',
							blockId: '$_id',
							groupIds: '$groupIds',
							propertyName: '$info.name',
						},
					},
				},
			},
		]);

		if (data && data.properties) {
			return includeBlockId ? data.properties : _.uniq(data.properties.map(p => p.propertyId));
		}
		return [];
	},

	async getPropertyIdOfABlock(blockId, otaName, account) {
		if (OTANotHaveProperty.includes(otaName)) return null;

		const block = await this.findOne({ _id: blockId, isProperty: true, active: true }).select('OTAProperties');
		const property = _.find(
			block && block.OTAProperties,
			b => b.active !== false && b.otaName === otaName && b.account === account
		);

		return (property && property.propertyId) || null;
	},

	getActiveBlock(defaultQuery = null) {
		const query = { active: true, isTest: false, isProperty: true, ...defaultQuery };

		return this.find(query)
			.select('_id')
			.then(res => res.map(v => v._id));
	},

	findBySlugOrId(slugOrId) {
		const isId = mongoose.Types.ObjectId.isValid(slugOrId);
		if (isId)
			return this.findOne({
				_id: slugOrId,
			});

		return this.findOne({
			'info.url': slugOrId,
		});
	},

	async getStartRunningFilters(blockIds) {
		const blocks = await this.find({ _id: blockIds, active: true }).select('startRunning manageFee');

		return {
			filter: {
				$or: [
					{
						blockId: { $in: blocks.filter(b => !b.startRunning).map(b => b._id) },
					},
					...blocks
						.filter(b => b.startRunning)
						.map(b => ({
							blockId: b._id,
							to: {
								$gt: new Date(b.startRunning).zeroHours(),
							},
						})),
				],
			},
			blocks: _.keyBy(blocks, '_id'),
		};
	},

	async getRunningFilters(blockIds) {
		const blocks = await this.find({ _id: blockIds, active: true }).select('startRunning endRunning manageFee');

		return {
			filter: {
				$or: [
					{
						blockId: { $in: blocks.filter(b => !b.startRunning && !b.endRunning).map(b => b._id) },
					},
					...blocks
						.filter(b => b.startRunning || b.endRunning)
						.map(b =>
							_.pickBy({
								blockId: b._id,
								from: b.endRunning && {
									$lte: new Date(b.endRunning).zeroHours(),
								},
								to: b.startRunning && {
									$gt: new Date(b.startRunning).zeroHours(),
								},
							})
						),
				],
			},
			blocks: _.keyBy(blocks, '_id'),
		};
	},

	async getManageFee({ blockId, date, roomId }) {
		const block = await this.findById(blockId).select('manageFee');
		if (!block) {
			return null;
		}

		const manageFee = block.getManageFee(date);

		if (!_.isEmpty(roomId)) {
			const roomHasConfig = await this.model('Room')
				.findOne({ _id: roomId, 'manageFee.shortTerm': { $ne: null } })
				.select('manageFee')
				.lean();

			if (roomHasConfig) {
				_.assign(manageFee, _.pickBy(roomHasConfig.manageFee));
			}
		}

		return manageFee;
	},

	getRevenueKeys(manageFee) {
		let revenueKeys = _.values(EXTRA_FEE);

		if (!manageFee.includeVAT) {
			revenueKeys = revenueKeys.filter(k => k !== EXTRA_FEE.VAT_FEE);
		}
		if (!manageFee.includeCompensation) {
			revenueKeys = revenueKeys.filter(k => k !== EXTRA_FEE.COMPENSATION);
		}
		if (!manageFee.includeManageFee) {
			revenueKeys = revenueKeys.filter(k => k !== EXTRA_FEE.MANAGEMENT_FEE);
		}

		return revenueKeys;
	},

	getFeeConfig(manageJSON, date) {
		date = date || moment().format('YYYY-MM-DD');

		const conditions = _.get(manageJSON, 'conditions');
		const manageFeeKeys = _.keys(FEE_KEYS);

		if (_.isEmpty(conditions)) return manageJSON;

		const rs = {};

		_.forEach(manageFeeKeys, key => {
			const validConditions = _.sortBy(
				_.filter(conditions[key], c => {
					const isFromValid = c.from ? c.from <= date : true;
					const isToValid = c.to ? c.to > date : true;
					return isFromValid && isToValid;
				}),
				['from', 'to']
			);
			const current = _.last(validConditions);
			rs[key] = current ? current.value : _.get(manageJSON, key);
		});

		return rs;
	},

	async getRules(blockId) {
		const block = await this.model('Block').findById(blockId).select('rules');

		return block.getRules();
	},

	async getPeriods(blockIds, period) {
		const blocks = await this.find({ _id: blockIds, active: true, isProperty: true }).select(
			'info.name reportConfig manageFee'
		);

		const blockPeriods = blocks.map(block => {
			const periods = _.get(block.reportConfig, 'period');
			const current = _.find(periods, p => p.from <= period) || _.find(periods, p => !p.from);
			const startDay = _.get(current, 'startDay') || 1;
			const month = _.get(current, 'month') || 1;
			const days = _.get(current, 'days');

			const from = new Date(moment(period, 'Y-MM').date(startDay).format('Y-MM-DD')).zeroHours();
			const to = days
				? moment(from).add(days, 'day').toDate()
				: moment(from).add(month, 'month').subtract(1, 'day').toDate();

			return {
				block,
				blockId: block._id,
				from,
				to,
			};
		});

		return blockPeriods;
	},

	async getPropertyConfig({ blockId, otaName, date }) {
		const block = await this.findOne({ _id: blockId }).select('OTAProperties');

		return _.find(
			block && block.OTAProperties,
			b =>
				b.active !== false &&
				b.otaName === otaName &&
				(date
					? (b.startDate ? b.startDate <= moment(date).format('Y-MM-DD') : true) &&
					(b.endDate ? b.endDate >= moment(date).format('Y-MM-DD') : true)
					: true)
		);
	},
};

const BlockModel = mongoose.model('Block', BlockSchema, 'block');

module.exports = BlockModel;
