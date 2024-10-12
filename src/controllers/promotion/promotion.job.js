const _ = require('lodash');
const models = require('@models');

async function addTask({ promotionId, operator, otas, blockId, ratePlanIds }) {
	otas = otas || [];

	otas = _.uniq(otas).map(otaName => ({ otaName }));

	if (otas.length === 0) {
		const promotion = await models.Promotion.findById(promotionId).select('activeOTAs');
		otas = promotion.activeOTAs.map(otaName => ({ otaName }));
	}

	return await otas.asyncForEach(ota =>
		models.JobPromotion.createJob({ promotionId, operrator: operator, otas: [ota], blockId, ratePlanIds })
	);
}

module.exports = {
	addTask,
};
