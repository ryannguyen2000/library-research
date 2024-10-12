const { Schema, model, Types } = require('mongoose');

const { ObjectId } = Types;

const EmailSignatureSchema = new Schema({
	name: String,
	content: String,
	emailConfigId: { type: ObjectId, ref: 'EmailConfig' },
	userId: { type: ObjectId, ref: 'User' },
});

module.exports = model('EmailSignature', EmailSignatureSchema, 'email_signature');
