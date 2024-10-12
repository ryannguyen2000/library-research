const mongoose = require('mongoose');
// const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const NoteSchema = new Schema(
	{
		description: String,
		images: [String],
		by: { type: ObjectId, ref: 'User' },
		blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
		removedBy: { type: ObjectId, ref: 'User' },
		deleted: { type: Boolean, default: false },
		system: { type: Boolean, default: false },
		cleaning: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

NoteSchema.statics = {
	async removeNote(noteId, userId) {
		return await this.findByIdAndUpdate(noteId, {
			$set: { removedBy: userId, deleted: true },
		});
	},

	async updateNote(noteId, data) {
		return await this.findByIdAndUpdate(noteId, data, { new: true });
	},
};

module.exports = mongoose.model('Note', NoteSchema, 'note');
