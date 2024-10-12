// const { SessionsClient } = require('@google-cloud/dialogflow-cx');
// const uuid = require('uuid');
// const { logger } = require('@utils/logger');
// const { LOCATION, AGENT } = require('./const');

// async function getAnswer(question) {
// 	const sessionId = uuid.v4();
// 	const sessionClient = new SessionsClient({
// 		apiEndpoint: `${LOCATION}-dialogflow.googleapis.com`,
// 	});

// 	const session = sessionClient.projectLocationAgentSessionPath(
// 		process.env.DIALOGFLOW_PROJECT_ID,
// 		LOCATION,
// 		AGENT,
// 		sessionId
// 	);
// 	// The text query request.
// 	const request = {
// 		session,
// 		queryInput: {
// 			text: {
// 				text: question,
// 			},
// 			languageCode: 'vi-VN',
// 		},
// 	};

// 	// Send request and log result
// 	const [response] = await sessionClient.detectIntent(request);
// 	// logger.info('dialogflow responses', JSON.stringify(response));

// 	const agentResponses = [];
// 	for (const message of response.queryResult.responseMessages) {
// 		if (message.text) {
// 			agentResponses.push(message.text.text[0]);
// 			logger.info(`Agent Response: ${message.text.text}`);
// 		}
// 	}
// 	if (response.queryResult.match.intent) {
// 		logger.info(`Matched Intent: ${response.queryResult.match.intent.displayName}`);
// 	}

// 	return agentResponses;
// }

// module.exports = {
// 	getAnswer,
// };
