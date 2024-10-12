const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const { URL_CONFIG } = require('@config/setting');
const { eventEmitter, EVENTS } = require('@utils/events');
const { AutoEvents, MessageAutoType, LANGUAGE, MessageVariable, LocalOTAs } = require('@utils/const');
const { Settings } = require('@utils/setting');
const { formatPriceWithDot } = require('@utils/price');
const { equalConditions } = require('@utils/func');
const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const ChatAutomaticSchema = new Schema(
	{
		template: { type: String },
		name: { type: String },
		description: { type: String },
		triggerNow: { type: Boolean, default: false },
		triggerHour: { type: String },
		triggerDate: { type: Number, default: 0 },
		active: {
			type: Boolean,
		},
		displayOnly: {
			type: Boolean,
		},
		contents: [
			{
				_id: false,
				action: String,
				content: String,
				templateId: Mixed,
				lang: {
					vi: String,
					en: String,
				},
				displayAllLang: Boolean,
			},
		],
		OTAcontents: [
			{
				_id: false,
				otaName: String,
				contents: [
					{
						_id: false,
						content: String,
						lang: {
							vi: String,
							en: String,
						},
						displayAllLang: Boolean,
					},
				],
			},
		],
		otts: [String],
		event: { type: String, enum: Object.values(AutoEvents) },
		conditions: Mixed,
		autoType: { type: String, enum: Object.values(MessageAutoType) },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		deactiveListings: [
			{
				_id: false,
				listingId: { type: ObjectId, ref: 'Listing' },
				otaName: String,
			},
		],
		preTemplates: [String],
	},
	{
		timestamps: true,
	}
);

ChatAutomaticSchema.methods = {
	isActive(listingId, otaName) {
		return !this.deactiveListings.some(l => l.listingId.equals(listingId) && l.otaName === otaName);
	},
};

function getOriStr(content, lang) {
	const singleLang = _.get(content.lang, lang) || _.get(content.lang, LANGUAGE.EN) || _.values(content.lang)[0];
	const txtLang = content.displayAllLang ? _.values(content.lang).join('\n\n').trim() : singleLang;

	return [_.compact([txtLang, content.content]).join('\n'), _.compact([singleLang, content.content]).join('\n')];
}

function getGuide(bookingId, lang) {
	return `${URL_CONFIG.HOME}${lang === LANGUAGE.EN ? '/en' : ''}/reservation/${bookingId}`;
}

function getPaymentUrl(booking, lang) {
	return `${URL_CONFIG.HOME}${lang === LANGUAGE.EN ? '/en' : ''}/b/p/${booking.otaBookingId}?ota=${encodeURIComponent(
		booking.otaName
	)}`;
}

function getRefundUrl(booking, lang) {
	return `${URL_CONFIG.HOME}${lang === LANGUAGE.EN ? '/en' : ''}/form/refund?bookingId=${booking._id}`;
}

async function getOTANameReview(booking) {
	if (_.values(LocalOTAs).includes(booking.otaName)) return 'Google';

	const source = await mongoose.model('BookingSource').findOne({ name: booking.otaName });
	if (!source || !source.label) return _.capitalize(booking.otaName);

	return source.group === 'OTA' ? source.label : 'Google';
}

ChatAutomaticSchema.statics = {
	async list(listingId, otaName) {
		let results = await this.find({ active: true });

		results = results.map(auto => {
			const active = auto.isActive(listingId, otaName);
			auto = auto.toObject();
			auto.active = active;

			delete auto.deactiveListings;
			return auto;
		});

		return results;
	},

	getTemplateNames(query = {}) {
		return this.find({ active: true, template: { $ne: null }, ...query })
			.select('template')
			.then(res => [...new Set(res.map(t => t.template))]);
	},

	async customTemplate(listingId, otaName, data) {
		data.active = data.active === undefined ? true : data.active;

		const doc = new this(data);
		if (!data.active) {
			doc.deactiveListings.push({
				listingId,
				otaName,
			});
		}
		await doc.save();

		// emit event new auto chat
		eventEmitter.emit(EVENTS.UPDATE_AUTOMATION, doc);

		return doc;
	},

	async updateTemplate(id, data) {
		const template = await this.findById(id);
		if (!template) {
			throw new ThrowReturn("Can't not update this template");
		}
		delete data.template;
		delete data.deactiveListings;

		const auto = await this.findOneAndUpdate({ _id: id }, data, {
			new: true,
		});

		// emit event update auto chat
		eventEmitter.emit(EVENTS.UPDATE_AUTOMATION, auto);
		return auto;
	},

	async activeTemplate(id, listingId, otaName, active = true) {
		await this.updateOne(
			{ _id: id },
			{
				[!active ? '$addToSet' : '$pull']: {
					deactiveListings: { listingId: mongoose.Types.ObjectId(listingId), otaName },
				},
			}
		);
	},

	async activeAllTemplates(listingId, otaName, active = true) {
		await this.updateMany(
			{},
			{
				[!active ? '$addToSet' : '$pull']: {
					deactiveListings: { listingId: mongoose.Types.ObjectId(listingId), otaName },
				},
			}
		);
	},

	validateSync({ templates, blockId, booking, otaName, guest }) {
		const today = new Date().zeroHours();
		const results = [];

		_.forEach(templates, auto => {
			if (booking) {
				if (auto.event === AutoEvents.Confirmed || auto.event === AutoEvents.Inquiry) {
					const hasIgnore =
						booking.error || !!booking.checkin || moment(booking.from).add(1, 'day').isBefore(today, 'day');
					if (hasIgnore) {
						return;
					}
				}

				const diffDays = _.get(auto.conditions, 'diffDays');
				if (diffDays) {
					const diff = booking.from.diffDays(today);
					if (!equalConditions(diffDays, diff)) {
						return;
					}
				}

				const diffCheckin = _.get(auto.conditions, 'diffCheckin');
				if (diffCheckin) {
					if (!booking.checkin || !equalConditions(diffCheckin, moment().diff(booking.checkin, 'minute'))) {
						return;
					}
				}

				const conditionPayment = _.get(auto.conditions, 'paid');
				if (_.isBoolean(conditionPayment)) {
					const isPaid = booking.isRatePaid() || booking.paid > 0;
					if (conditionPayment !== Boolean(isPaid)) {
						return;
					}
				}

				const isNonRefundable = _.get(auto.conditions, 'isNonRefundable');
				if (_.isBoolean(isNonRefundable)) {
					if (isNonRefundable !== Boolean(booking.isNonRefundable())) {
						return;
					}
				}

				const autoCancel = _.get(auto.conditions, 'autoCancel');
				if (_.isBoolean(autoCancel)) {
					if (autoCancel !== Boolean(_.get(booking.paymentCardState, 'autoCancel'))) {
						return;
					}
				}

				const canceledBy = _.get(auto.conditions, 'canceledBy');
				if (canceledBy) {
					if (_.get(booking.canceledBy, 'type') !== canceledBy) {
						return;
					}
				}

				const hasPassport = _.get(auto.conditions, 'hasPassport');
				if (_.isBoolean(hasPassport)) {
					if (hasPassport !== Boolean(_.get(guest, 'passport.length'))) {
						return;
					}
				}

				const blockIdCond = _.get(auto.conditions, 'blockId');
				if (blockIdCond) {
					if (!equalConditions(blockIdCond, _.toString(blockId))) {
						return;
					}
				}

				const otaNameCond = _.get(auto.conditions, 'otaName');
				if (otaNameCond) {
					if (!equalConditions(otaNameCond, otaName)) {
						return;
					}
				}

				const serviceTypeCond = _.get(auto.conditions, 'serviceType');
				if (serviceTypeCond) {
					if (!equalConditions(serviceTypeCond, booking.serviceType)) {
						return;
					}
				}

				const createdAtCond = _.get(auto.conditions, 'createdAt');
				if (createdAtCond) {
					if (!equalConditions(createdAtCond, new Date(booking.createdAt))) {
						return;
					}
				}
			}

			results.push(auto);
		});

		return results;
	},

	async replaceContent({ contents, booking, guest, tasks, roomIds, lang }) {
		lang = lang || guest.lang;
		let strs = contents.map(content => getOriStr(content, lang));
		let str = strs.map(s => s[0]).join('');
		let replaces = [];

		if (guest) {
			const value = guest.fullName || guest.name || guest.displayName;
			replaces.push({ key: MessageVariable.GUEST.text, value });
		}

		if (booking && str.includes(MessageVariable.GUIDE.text)) {
			const rooms = await this.model('Reservation').getReservatedRoomsDetails(booking._id);
			const value =
				rooms.length <= 1
					? getGuide(booking._id, lang)
					: rooms.map(r => `\n${r.info.roomNo}: ${getGuide(r.bookingId, lang)}?r=${r._id}`).join('');
			replaces.push({ key: MessageVariable.GUIDE.text, value });
		}

		if (booking && str.includes(MessageVariable.TIME_EXPIRATION.text)) {
			const config = moment(booking.createdAt).isSame(booking.from, 'date')
				? Settings.ShortPaymentExpirationTime
				: Settings.LongPaymentExpirationTime;

			replaces.push({ key: MessageVariable.TIME_EXPIRATION.text, value: config.value });
		}

		if (booking && str.includes(MessageVariable.PAYMENT_URL.text)) {
			const paymentUrl = getPaymentUrl(booking, lang);
			replaces.push({ key: MessageVariable.PAYMENT_URL.text, value: paymentUrl });
		}

		if (booking && str.includes(MessageVariable.REFUND_URL.text)) {
			const refundUrl = getRefundUrl(booking, lang);
			replaces.push({ key: MessageVariable.REFUND_URL.text, value: refundUrl });
		}

		if (booking && str.includes(MessageVariable.OTA.text)) {
			const otaRName = await getOTANameReview(booking);
			replaces.push({ key: MessageVariable.OTA.text, value: otaRName });
		}

		if (booking && str.includes(MessageVariable.PROPERTY_NAME.text)) {
			const block = await this.model('Block').findById(booking.blockId).select('info.name');
			const blockName = _.get(block, 'info.name', '');

			replaces.push({ key: MessageVariable.PROPERTY_NAME.text, value: blockName });
		}

		if (booking && str.includes(MessageVariable.HOTLINE.text)) {
			const hotline = await this.model('Ott')
				.findOne({
					active: true,
					hotline: true,
					blockId: { $in: [booking.blockId, null] },
				})
				.sort({ blockId: -1 })
				.lean();

			const dPhone = hotline ? `+${hotline.phone.split('').join('-')}` : '';

			replaces.push({ key: MessageVariable.HOTLINE.text, value: dPhone });
		}

		if (booking && str.includes(MessageVariable.ZALO_NUMBER.text)) {
			const zaloOtt = await this.model('Ott')
				.findOne({
					active: true,
					zalo: true,
					whatsapp: true,
					blockId: { $in: [booking.blockId, null] },
				})
				.sort({ blockId: -1 })
				.lean();

			const dPhone = zaloOtt ? `+${zaloOtt.phone.split('').join('-')}` : '';

			replaces.push({ key: MessageVariable.ZALO_NUMBER.text, value: dPhone });
		}

		if (tasks && str.includes(MessageVariable.CLEANING_DATES.text)) {
			const msgDate = _.uniq(tasks.map(task => task.time.getDate())).join(', ');
			replaces.push({ key: MessageVariable.CLEANING_DATES.text, value: msgDate });
		}

		if (booking && str.includes(MessageVariable.BOOKING_CODE.text)) {
			replaces.push({ key: MessageVariable.BOOKING_CODE.text, value: booking.otaBookingId });
		}

		if (booking && str.includes(MessageVariable.FROM.text)) {
			const from = moment(booking.from).format('DD/MM/YYYY');
			replaces.push({ key: MessageVariable.FROM.text, value: from });
		}

		if (booking && str.includes(MessageVariable.TO.text)) {
			const to = moment(booking.to).format('DD/MM/YYYY');
			replaces.push({ key: MessageVariable.TO.text, value: to });
		}

		if (booking && str.includes(MessageVariable.ROOM.text)) {
			const rooms = _.get(roomIds, 'length', 0)
				? await this.model('Room')
						.find({ _id: { $in: roomIds } })
						.select('info.roomNo')
						.lean()
				: await this.model('Reservation').getReservatedRoomsDetails(booking._id, false);
			const roomsTxt = rooms.map(room => _.get(room, 'info.roomNo', '')).join(', ');
			replaces.push({ key: MessageVariable.ROOM.text, value: roomsTxt });
		}

		if (booking && str.includes(MessageVariable.OTA_FEE.text)) {
			const otaFee = `${formatPriceWithDot(booking.otaFee, ',')} ${booking.currency}`;
			replaces.push({ key: MessageVariable.OTA_FEE.text, value: otaFee });
		}

		if (booking && str.includes(MessageVariable.PRICE.text)) {
			const price = `${formatPriceWithDot(booking.price, ',')} ${booking.currency}`;
			replaces.push({ key: MessageVariable.PRICE.text, value: price });
		}

		replaces.forEach(rep => {
			strs = strs.map(strArray => {
				return strArray.map(txt => txt.replaceAll(rep.key, rep.value));
			});
		});

		return strs;
	},
};

module.exports = mongoose.model('ChatAutomatic', ChatAutomaticSchema, 'chat_automatic');
