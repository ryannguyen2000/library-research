const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const mime = require('mime-types');

const { OTT_CONFIG, URL_CONFIG } = require('@config/setting');
const { checkFolder } = require('@utils/file');

const OTT_NAME = 'telegram';

function parseExt(type) {
	switch (type) {
		case 'storage.fileJpeg':
			return '.jpg';
		case 'storage.fileGif':
			return '.gif';
		case 'storage.filePng':
			return '.png';
		case 'storage.fileMp3':
			return '.mp3';
		case 'storage.fileMov':
			return '.mov';
		case 'storage.fileMp4':
			return '.mp4';
		case 'storage.fileWebp':
			return '.webp';
		default:
			return '';
	}
}

function getExt(file, media) {
	const ext = parseExt(file.type._);
	if (ext) return ext;

	const mediaFileName = _.get(
		_.find(_.get(media, 'document.attributes'), a => a.file_name),
		'file_name',
		''
	);
	const extByName = path.extname(mediaFileName);
	if (extByName) return extByName;

	const extByMime = mime.extension(_.get(media, 'document.mime_type'));
	if (extByMime) return `.${extByMime}`;

	return '';
}

async function saveFile(sender, phone, id, file, message) {
	const fileName = `${id}${getExt(file, message.media)}`;

	const time = _.get(message.media, 'photo.date') || _.get(message.media, 'document.date') || message.date;
	const isNewDir = new Date(time * 1000) >= OTT_CONFIG.DATE_NEW_DIR;

	const rPath = `${isNewDir ? `${moment(time * 1000).format('YYYY/MM/DD')}/` : ''}${sender}/${phone}`;
	const folder = `${OTT_CONFIG.STATIC_RPATH}/telegram/${rPath}`;

	await checkFolder(folder);
	await fs.promises.writeFile(path.resolve(`${folder}/${fileName}`), Buffer.from(file.bytes));

	return `${rPath}/${fileName}`;
}

function getFileReference(reference) {
	return reference instanceof Uint8Array ? reference : new Uint8Array(_.toArray(reference));
}

function getFileLocation(media) {
	if (!media) return;

	if (media.photo) {
		return {
			_: 'inputPhotoFileLocation',
			id: media.photo.id,
			access_hash: media.photo.access_hash,
			file_reference: getFileReference(media.photo.file_reference),
			thumb_size: 'y',
		};
	}
	if (media.document) {
		const sticker = _.find(media.document.attributes, a => a.stickerset);
		if (sticker) {
			return;
		}
		return {
			_: 'inputDocumentFileLocation',
			id: media.document.id,
			access_hash: media.document.access_hash,
			file_reference: getFileReference(media.document.file_reference),
			thumb_size: 'y',
		};
	}
}

function getInputMediaUploadedDocument(file) {
	return {
		_: 'inputMediaUploadedDocument',
		nosound_video: false,
		force_file: false,
		file: {
			_: 'inputFile',
			id: file.id,
			name: file.name,
			parts: file.parts,
			// md5_checksum: 'bfa81e74e59edc0bf0f5f4f5e1fb4a46',
		},
		mime_type: file.type,
		attributes: [
			{
				_: 'documentAttributeFilename',
				file_name: file.name,
			},
		],
		stickers: [],
	};
}

function getMessageByMedia(media) {
	const type = _.get(media, '_');
	if (!type) return '';

	if (type === 'messageMediaGeo') {
		return [`Latitude: ${_.get(media, 'geo.lat')}`, `Longitude: ${_.get(media, 'geo.long')}`].join('\n');
	}
	if (type === 'messageMediaContact') {
		return [
			`Phone number: ${media.phone_number}`,
			`First name: ${media.first_name}`,
			`Last name: ${media.last_name}`,
			`Vcard: ${media.vcard}`,
		].join('\n');
	}
	if (type === 'messageMediaWebPage') {
		return _.get(media, 'webpage.display_url');
	}
	if (_.get(media.document, 'mime_type') === 'application/x-tgsticker') {
		return _.get(
			_.find(media.document.attributes, a => a.stickerset),
			'alt'
		);
	}
	if (type === 'messageMediaDocument' || type === 'messageMediaPhoto') {
		return '';
	}

	return `*This Media Unsupported*`;
}

function parseMessage({ message, mediaUrl }) {
	const msg = message.message || getMessageByMedia(message.media);

	return {
		message: msg,
		messageId: message.id.toString(),
		fromMe: message.out,
		image_attachment_url: mediaUrl ? [`${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${OTT_NAME}/${mediaUrl}`] : [],
		time: message.date * 1000,
	};
}

module.exports = { saveFile, getFileLocation, getInputMediaUploadedDocument, parseMessage };
