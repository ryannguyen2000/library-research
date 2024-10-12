const mongoose = require('mongoose');
const _ = require('lodash');

const { eventEmitter, EVENTS } = require('@utils/events');
const { PAYMENT_CARD_STATUS } = require('@utils/const');
const { encryptData, decryptData } = require('@utils/crypto');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		otaName: String,
		otaBookingId: String,
		cardInfo: String,
		cardToken: String,
		vaultInfo: Schema.Types.Mixed,
		// otaData: Schema.Types.Mixed,
		rawData: Schema.Types.Mixed,
		cardStatus: { type: String, default: PAYMENT_CARD_STATUS.UNKNOWN, enum: Object.values(PAYMENT_CARD_STATUS) },
		cardUpdatedAt: { type: Date, default: Date.now }, // for check marked error card has been updated or not
		updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
		deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
		deleted: { type: Boolean, default: false },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

ModelSchema.pre('save', function (next) {
	this.$locals.isModifiedCardStatus = this.isModified('cardStatus') || this.isNew;

	next();
});

ModelSchema.post('save', async function (doc) {
	if (!doc.deleted && doc.$locals.isModifiedCardStatus) {
		await Model.updateCardStatus(
			{
				otaBookingId: doc.otaBookingId,
				otaName: doc.otaName,
			},
			{
				'paymentCardState.status': doc.cardStatus,
			}
		);
	}
});

ModelSchema.methods = {
	getPublicCardInfo() {
		if (!this.cardInfo && this.vaultInfo) {
			return {
				cardType: this.vaultInfo.Type,
				cardName: this.vaultInfo.CardName,
				cardNumber: `${this.vaultInfo.CardNumberBin}****${this.vaultInfo.CardNumberLast4}`,
				expirationDate: `${this.vaultInfo.ExpireMonth}/${this.vaultInfo.ExpireYear}`,
				cvc: '',
				country: this.vaultInfo.Country,
				brand: this.vaultInfo.Brand,
			};
		}

		const cardInfo = this.cardInfo ? Model.decryptCardInfo(this.cardInfo) : {};

		if (this.cardStatus !== PAYMENT_CARD_STATUS.VALID && this.cardStatus !== PAYMENT_CARD_STATUS.UNKNOWN) {
			return cardInfo;
		}

		return {
			...cardInfo,
			cardNumber: cardInfo.cardNumber ? `****${cardInfo.cardNumber.slice(-4)}` : '',
			cvc: cardInfo.cvc
				? _.range(cardInfo.cvc.length)
						.map(() => '*')
						.join('')
				: '',
		};
	},
};

ModelSchema.statics = {
	decryptCardInfo(data) {
		return JSON.parse(decryptData(data));
	},

	encryptCardInfo(data) {
		return encryptData(JSON.stringify(Object.sort(data)));
	},

	async updateCardStatus(filter, data) {
		await Promise.all([
			this.model('Booking').updateMany(filter, data),
			this.model('BlockInbox').updateMany(filter, data),
		]);

		eventEmitter.emit(EVENTS.BOOKING_CHARGED_STATUS_UPDATE, {
			...filter,
			...data,
		});
	},
};

const Model = mongoose.model('GuestCard', ModelSchema, 'guest_card');

module.exports = Model;
