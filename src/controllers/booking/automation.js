const _ = require('lodash');

const { MessageAutoType } = require('@utils/const');
const models = require('@models');

async function changeAutoMessages(booking, { autos, off }) {
	if (!autos) {
		autos = await models.ChatAutomatic.getTemplateNames();
	}

	await models.Booking.setIgnoreTemplate(booking, autos, off);
}

async function getAutoMessages(booking) {
	const templates = await models.ChatAutomatic.find({
		active: true,
		autoType: MessageAutoType.GUEST,
		triggerHour: { $ne: null },
		groupIds: booking.groupIds[0],
	})
		.select('name template displayOnly')
		.lean();

	const rs = _.uniqBy(templates, 'template').map(t => {
		return {
			template: t.template,
			name: t.name || t.template,
			active: t.displayOnly ? false : !_.includes(booking.ignoreTemplate, t.template),
			done: _.includes(booking.doneTemplate, t.template),
		};
	});

	return { auto: rs };
}

module.exports = {
	getAutoMessages,
	changeAutoMessages,
};
