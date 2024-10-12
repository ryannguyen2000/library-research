// const otas = require('../otas');

// async function algorithm(plan, blockId, rates) {
// 	const { startDate, endDate, name, maxPromo, elasticity, activeOTAs } = plan;

// 	const promotion = {
// 		promoType: 'last_minute',
// 		rooms: [],
// 		active: true,
// 		modifiled: true,
// 		tb: {
// 			secretDeal: false,
// 			maxPromo,
// 			elasticity,
// 		},
// 		name: `(${name}) generate for block ${blockId}`,
// 		startDate,
// 		endDate,
// 		timeFormat: 'Day',
// 		discountAmount: Math.floor((maxPromo * 2) / 3), // + Math.floor(Math.random() * ((maxPromo * 1) / 3)),
// 		activeOTAs,
// 	};

// 	Object.keys(otas)
// 		.filter(key => otas[key].generate)
// 		.forEach(key => {
// 			promotion[key] = otas[key].generate(promotion);
// 		});

// 	return [promotion];
// }

module.exports = {
	name: 'Algorithm B',
	exec: () => [],
};
