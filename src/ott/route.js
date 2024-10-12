const { ChatRouter } = require('@core/router');
const { connect } = require('./ott');

function Route(app) {
	const chatRouter = ChatRouter();
	app.use('/api/v1/chat', chatRouter);

	const conversationRouter = ChatRouter();
	app.use('/api/v1/conversation', conversationRouter);

	connect(chatRouter, conversationRouter);
}

module.exports = Route;
