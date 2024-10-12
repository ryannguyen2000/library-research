const _ = require('lodash');

const { PayoutStates, PayoutSources, RateType, OTAs } = require('@utils/const');

const { HAS_TAX_METHOD, PAY_METHOD } = require('./const');

const OTAS_REDUX_COM = _.mapKeys([OTAs.Traveloka, OTAs.Agoda, OTAs.Ctrip, OTAs.Mytour]);
const OTAS_REDUX_COM_PAYNOW = _.mapKeys([OTAs.Expedia]);
const OTAS_REDUX_COM_PAYNOW_STARTDATE = new Date('2024-01-01');

function hasTax(payType) {
	return HAS_TAX_METHOD.includes(_.replace(payType, `${PAY_METHOD.CNT} - `, ''));
}

function isHostCollect(payType, config = {}) {
	return payType ? payType.startsWith(`${PAY_METHOD.CNT} - `) : !!config.isOwnerCollect;
}

function isReduxCommission(otaName, rateType, to) {
	return !!(
		OTAS_REDUX_COM[otaName] ||
		(OTAS_REDUX_COM_PAYNOW[otaName] && rateType === RateType.PAY_NOW && to > OTAS_REDUX_COM_PAYNOW_STARTDATE)
	);
}

function getPayType(booking, payout, block) {
	if (!payout) {
		const isRatePaid = booking && booking.rateType === RateType.PAY_NOW;

		if (isRatePaid) {
			const isOwnerCollectOTA = _.get(block, ['OTAs', booking.otaName, 'isOwnerCollect']);

			return isOwnerCollectOTA ? `${PAY_METHOD.CNT} - ${PAY_METHOD.OTA}` : PAY_METHOD.OTA;
		}

		return PAY_METHOD.DEFAULT;
	}

	let type;

	switch (payout.source) {
		case PayoutSources.CASH:
		case PayoutSources.PERSONAL_BANKING:
		case PayoutSources.BACKUP_CASH: {
			type = PAY_METHOD.TM;
			break;
		}
		case PayoutSources.BANKING: {
			type = PAY_METHOD.NH;
			break;
		}
		case PayoutSources.THIRD_PARTY:
		case PayoutSources.ONLINE_WALLET: {
			type = payout.state === PayoutStates.CONFIRMED ? PAY_METHOD.NH : _.toUpper(payout.collectorCustomName);
			break;
		}
		case PayoutSources.SWIPE_CARD: {
			type = PAY_METHOD.CT;
			break;
		}
		case PayoutSources.VOUCHER: {
			type = PAY_METHOD.VOUCHER;
			break;
		}
		case PayoutSources.SUBTRACT_DEPOSIT: {
			type = PAY_METHOD.CTC;
			break;
		}
		default:
			type = PAY_METHOD.DEFAULT;
	}

	let { isOwnerCollect } = payout;

	if (booking && payout.fromOTA && _.toString(_.get(payout.blockIds, 0)) !== _.toString(booking.blockId)) {
		isOwnerCollect = false;
	}

	return isOwnerCollect ? `${PAY_METHOD.CNT} - ${type}` : type;
}

module.exports = {
	getPayType,
	hasTax,
	isHostCollect,
	isReduxCommission,
};
