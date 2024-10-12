/* eslint-disable no-empty-function */
/* eslint-disable class-methods-use-this */
const ThrowReturn = require('@core/throwreturn');

const UNSUPPORT_MSG = 'Function does not support';

class EmailClient {
	constructor() {
		if (this.contructor === EmailClient) {
			throw new ThrowReturn('this is abtraction class');
		}
	}

	async getMailFolders() {}

	async getListMessages() {}

	async getMessageConversation() {}

	async messageAttachments() {}

	async sendEmail() {}

	async replyEmail() {}

	async createReply() {
		throw new ThrowReturn(UNSUPPORT_MSG);
	}

	async createForward() {
		throw new ThrowReturn(UNSUPPORT_MSG);
	}

	async deleteMessage() {}

	async readMessageConversation() {}

	async forwardEmail() {}

	// Gmail only
	async undoMessage() {
		throw new ThrowReturn(UNSUPPORT_MSG);
	}

	async addressAutocomple() {
		throw new ThrowReturn(UNSUPPORT_MSG);
	}

	async getAttachmentContentBytes() {
		throw new ThrowReturn(UNSUPPORT_MSG);
	}
}

module.exports = EmailClient;
