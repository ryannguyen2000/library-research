const _ = require('lodash');
const moment = require('moment');

const MailComposer = require('nodemailer/lib/mail-composer');
const { HEADERS, LABELS, DRAFT_TYPE } = require('./const');

function base64Decoding(data) {
	const bufferDecode = Buffer.from(data, 'base64');
	return bufferDecode.toString();
}

function encodeMessage(message) {
	return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getAddress(address) {
	return (address || []).map(toRecipient => _.get(toRecipient, 'emailAddress.address', ''));
}

function convertOutlookToGmailMsg({ message, isDraft = false }) {
	const {
		messageId,
		toRecipients,
		ccRecipients,
		bccRecipients,
		body = {},
		subject = '',
		attachments = [],
		sender,
	} = message;

	const address = isDraft
		? { to: _.get(sender, 'emailAddress.address', '') }
		: {
				to: getAddress(toRecipients),
				cc: getAddress(ccRecipients),
				bcc: getAddress(bccRecipients),
		  };

	const html = body.content;
	const fileAttachments = attachments.map(attachment => ({
		filename: attachment.name,
		content: attachment.contentBytes,
		encoding: 'base64',
		cid: attachment.isInline ? attachment.contentId : '',
	}));

	const msg = {
		subject,
		html,
		attachments: fileAttachments,
		textEncoding: 'base64',
		inReplyTo: messageId,
		references: messageId,
		...address,
	};

	return msg;
}

async function generateRawMessage(message) {
	const mimeNode = new MailComposer(message).compile();
	mimeNode.keepBcc = true;
	const raw = await mimeNode.build();

	return encodeMessage(raw);
}

function getAddressFromHeaders(fullEmailAddress) {
	if (!fullEmailAddress) return [];
	const emailAddressList = fullEmailAddress.split(',');

	return emailAddressList.map(emailAddress => {
		const emailAddressArr = emailAddress.split(' <');
		const name = emailAddressArr[0].trim();
		const address = _.replace(emailAddressArr[1], '>', '').trim() || emailAddressArr[0].trim();
		return { emailAddress: { name, address } };
	});
}

function getPartContainHTML(parts) {
	let isContainHTML = false;
	let part = parts.find(_part => {
		isContainHTML = _part.mimeType === 'text/html';
		return isContainHTML || _part.mimeType.includes('multipart/');
	});
	if (isContainHTML) return part;
	if (!part) return;

	return getPartContainHTML(part.parts);
}

function getHTMLContent(payload, parts) {
	const encodeContent = getPartContainHTML(parts) || payload;
	const content = base64Decoding(_.get(encodeContent, 'body.data', '')).replaceAll(/(?:\r|\n|\t)/g, '');
	return content;
}

function convertGmailToOutlookObj(msg = {}) {
	const parts = _.get(msg, 'payload.parts', []);
	const payload = msg.payload || {};
	const content = getHTMLContent(payload, parts);
	const hasAttachments = !!parts.find(part => _.get(part, 'body.id'));

	const headers = _.keyBy(_.get(payload, 'headers', []), header => header.name.toLowerCase());
	const sender = _.get(headers, [HEADERS.FROM, 'value'], '').split(' <');
	const messageId = _.get(headers, [HEADERS.MESSAGE_ID, 'value']);
	const subject = _.get(headers, [HEADERS.SUBJECT, 'value']);
	const toRecipients = getAddressFromHeaders(_.get(headers, [HEADERS.TO, 'value'], ''));
	const ccRecipients = getAddressFromHeaders(_.get(headers, [HEADERS.CC, 'value'], ''));
	const bccRecipients = getAddressFromHeaders(_.get(headers, [HEADERS.BCC, 'value'], ''));
	const receivedDateTime = new Date(_.get(headers, [HEADERS.DATE, 'value'], Date.now())).toISOString();

	const labelIds = msg.labelIds || [];
	const isRead = !labelIds.includes('UNREAD');
	const isDraft = labelIds.includes(LABELS.DRAFT);

	return {
		id: msg.id,
		messageId,
		conversationId: msg.threadId,
		body: { content },
		hasAttachments,
		sender: {
			emailAddress: {
				name: sender[0].trim(),
				address: _.replace(sender[1], '>', '').trim() || sender[0].trim(),
			},
		},
		toRecipients,
		ccRecipients,
		bccRecipients,
		subject,
		bodyPreview: msg.snippet,
		receivedDateTime,
		isRead,
		isDraft,
		labels: msg.labelIds,
	};
}

function getAddressHtml(addressArr = []) {
	return addressArr.reduce((html, { emailAddress } = {}) => {
		const address = emailAddress.address.replaceAll(/<|>/g, '');
		html += `&lt; <a href="${address}">${address}</a> &gt;`;
		return html;
	}, '');
}

function generateReplyOrForwardHtml(message, type) {
	if (!_.values(DRAFT_TYPE).includes(type)) return '';
	const { sender, receivedDateTime, toRecipients, ccRecipients, subject, body } = message;
	const date = moment(receivedDateTime).format('ddd, MMM DD, YYYY [at] h:mm A');
	const senderName = sender.emailAddress.name;
	const senderAddress = sender.emailAddress.address;

	if (type === DRAFT_TYPE.REPLY) {
		const replyHtml = `<div dir="ltr">${date} ${senderName} &lt;<a href="${senderAddress}" target="_blank">${senderAddress}</a>&gt; wrote:<br></div>`;
		return `${replyHtml} <blockquote style="margin: 0px 0px 0px 0.8ex; border-left: 1px solid rgb(204, 204, 204); padding-left: 1ex">${body.content}</blockquote>`;
	}

	const toHtml = toRecipients.length ? `To: ${getAddressHtml(toRecipients)} <br/>` : '';
	const ccHtml = ccRecipients.length ? `Cc: ${getAddressHtml(ccRecipients)} <br/>` : '';

	const html = `
		<div dir="ltr">---------- Forwarded message ---------<br/>
			From: <strong dir="auto">${senderName}</strong> <span dir="auto">&lt;<a href="mailto:${senderAddress}">${senderAddress}</a>&gt;</span><br/>
			Date: ${date} <br/>
			Subject: ${subject}<br/>
			${toHtml}
			${ccHtml}
		</div>
		<br/><br/>${body.content}`;

	return html;
}

function getAttachmentsFromMessage(payload, attachments) {
	if (!payload.parts) return attachments;
	let multiPart;

	payload.parts.forEach(part => {
		if (part.mimeType.includes('multipart/')) multiPart = part;
		const attachmentId = _.get(part, 'body.attachmentId');
		const size = _.get(part, 'body.size', 0);
		const hasAttachment = !!attachmentId;
		if (hasAttachment) {
			const headerKeyByName = _.keyBy(part.headers, header => header.name.toLowerCase());
			const contentDisposition = _.get(headerKeyByName, [HEADERS.CONTENT_DISPOSITION, 'value'], '');
			const contentId = _.get(headerKeyByName, [HEADERS.CONTENT_ID, 'value'], '').replaceAll(/<|>/g, '');
			const isInline = contentDisposition.includes('inline');

			attachments.push({
				attachmentId,
				filename: part.filename,
				mimeType: part.mimeType,
				isInline,
				contentId,
				size,
			});
		}
	});
	if (!multiPart) return attachments;
	return getAttachmentsFromMessage(multiPart, attachments);
}

module.exports = {
	convertGmailToOutlookObj,
	generateRawMessage,
	convertOutlookToGmailMsg,
	generateReplyOrForwardHtml,
	getAttachmentsFromMessage,
};
