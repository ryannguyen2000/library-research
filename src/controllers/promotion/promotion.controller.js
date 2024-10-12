const _ = require('lodash');
const models = require('@models');
const { LocalOTA } = require('@utils/const');

const job = require('./promotion.job');
const APIs = require('./otas');

async function updatePromotion(id, newDataUpdate, data, promo, disabledOTAs, enabledOTAs, none) {
	const promotion = await models.Promotion.findByIdAndUpdate(id, { $set: data }, { new: true });

	if (!promotion) return;

	if (promotion.active) {
		if (disabledOTAs.length) {
			await job.addTask({ promotionId: id, operator: 'clear', otas: disabledOTAs });
		}

		if (enabledOTAs.length) {
			await job.addTask({ promotionId: id, operator: 'set', otas: enabledOTAs });
		}

		if (none.length) {
			const jsonPromotion = promotion.toJSON();

			const ignoreFields = ['_id', 'tags', 'otaIds', 'createdAt', 'updatedAt', '__v', 'realDiscount', none[0]];
			const ignoreDataKeys = ['CreationDate'];

			ignoreDataKeys.forEach(k => {
				_.unset(jsonPromotion.data, k);
				_.unset(promo.data, k);
			});

			const keys = _.keys(_.omit(newDataUpdate, ignoreFields));
			const hasChaned = keys.some(key => !_.isEqual(jsonPromotion[key], promo[key]));

			if (hasChaned) {
				await job.addTask({ promotionId: id, operator: 'update', otas: none });
			}
		}
	} else {
		await job.addTask({
			promotionId: id,
			operator: 'clear',
			otas: _.uniq([...disabledOTAs, ...enabledOTAs, ...none]),
		});
	}

	return promotion;
}

async function findAndUpdatePromotion(id, newDataUpdate, genData) {
	const data = await models.Promotion.findById(id);
	const promo = data.toJSON();

	const oldActive = promo.activeOTAs || [];
	const newActive = newDataUpdate.activeOTAs || [];

	const [disabledOTAs, enabledOTAs, none] = oldActive.diff(newActive);

	Object.assign(data, newDataUpdate);

	if (genData) {
		newActive.forEach(key => {
			const muduleAPIs = key.startsWith(LocalOTA) ? APIs[LocalOTA] : APIs[key];
			if (muduleAPIs) {
				data.data = muduleAPIs.generate(data);
			}
		});
	}

	return updatePromotion(id, newDataUpdate, data, promo, disabledOTAs, enabledOTAs, none);
}

async function updatePromotionActive(_id, active) {
	await models.Promotion.updateOne({ _id }, { $set: { active: !!active } });

	await job.addTask({ promotionId: _id, operator: active ? 'set' : 'clear' });
}

async function _deletePromotion(id) {
	// const promotion = await models.Promotion.findById(id).select('active');
	// if (promotion && promotion.active) {
	await job.addTask({ promotionId: id, operator: 'clear' });
	// }
}

module.exports = {
	updatePromotionActive,
	findAndUpdatePromotion,
	_deletePromotion,
};
