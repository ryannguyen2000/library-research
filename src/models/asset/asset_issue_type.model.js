const { Schema, model } = require('mongoose');

// eslint-disable-next-line no-bitwise
const getRandomColor = () => `#${(((1 << 24) * Math.random()) | 0).toString(16).padStart(6, '0')}`;

const AssetIssueType = new Schema({
	name: { type: String, required: true },
	description: String,
	color: { type: String },
});

AssetIssueType.pre('save', function (next) {
	if (this.isNew) {
		this.color = getRandomColor();
	}
	next();
});

module.exports = model('AssetIssueType', AssetIssueType, 'asset_issue_type');
