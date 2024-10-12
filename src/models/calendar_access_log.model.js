const mongoose = require('mongoose');
const { Settings } = require('@utils/setting');
const { RolePermissons } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CalendarAccessLog = new Schema(
	{
		userId: { type: ObjectId, ref: 'User' },
		status: { type: String },
		blockId: { type: ObjectId, ref: 'Block' },
		requestData: {
			username: String,
			from: String,
			to: String,
		},
	},
	{
		timestamps: {
			createdAt: true,
			updatedAt: false,
		},
	}
);

CalendarAccessLog.statics = {
	async checkAccess(user, blockId) {
		if (user.forceAccessCalendar) return true;

		const isIgnore = await this.model('RoleGroup')
			.checkPermission(user.role, RolePermissons.IGNORE_CHECK_CALENDAR)
			.then(role => role.exists);

		if (isIgnore) return true;

		const time = Date.now() - Settings.CalendarAccessTime.value * 1000;

		return this.findOne({
			blockId,
			userId: user._id,
			status: 'accepted',
			createdAt: { $gte: new Date(time) },
		});
	},
};

module.exports = mongoose.model('CalendarAccessLog', CalendarAccessLog, 'calendar_access_log');
