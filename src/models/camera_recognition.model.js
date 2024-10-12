const mongoose = require('mongoose');
const { eventEmitter, EVENTS } = require('@utils/events');

const { Schema } = mongoose;
const { Mixed } = Schema.Types;

const CSchema = new Schema(
	{
		event_id: Number,
		eventFaceRecognition: Mixed,
		image: String,
	},
	{
		timestamps: {
			updatedAt: false,
		},
		versionKey: false,
	}
);

CSchema.post('save', async function (doc) {
	const camera = await this.model('Camera').findOne().populate('blockId', 'info.name');
	if (camera) {
		eventEmitter.emit(EVENTS.CAMERA_RECOGNITION, camera.toJSON());
	}
});

module.exports = mongoose.model('CameraRecognition', CSchema, 'camera_recognition');
