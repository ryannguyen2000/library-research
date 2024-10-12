const mongoose = require('mongoose');

const { Schema } = mongoose;

const Methods = ['POST', 'GET', 'PUT', 'DELETE', '*'];
const Actions = ['allow', 'deny'];

const RolePermissionsSchema = new Schema(
	{
		name: { type: String, unique: true, index: true },
		permissions: [
			{
				resource: String,
				methods: [{ type: String, require: true, enum: Methods }],
				action: { type: String, require: true, enum: Actions },
				subRoutes: [
					{
						resource: String,
						methods: [{ type: String, require: true, enum: Methods }],
						action: { type: String, require: true, enum: Actions },
					},
				],
				prefix: String,
			},
		],
		description: String,
		sys: Boolean,
		public: Boolean,
	},
	{
		timestamps: true,
	}
);

// const initData = [
// 	{
// 		name: 'root',
// 		permissions: [
// 			{
// 				resource: '*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Truy cập toàn bộ hệ thống',
// 	},
// 	{
// 		name: 'anonymous',
// 		permissions: [
// 			{
// 				resource: '/user/auth',
// 				methods: ['POST'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/user/clone',
// 				methods: ['GET'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/booking/guide/*',
// 				methods: ['GET'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/room/block/locations',
// 				methods: ['GET'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '*',
// 				methods: ['*'],
// 				action: 'allow',
// 				prefix: 'web/v1',
// 			},
// 			{
// 				resource: '/guest/dataPassport/*',
// 				methods: ['GET'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Anonymous users allow login and read check in guide',
// 	},
// 	{
// 		name: 'room',
// 		permissions: [
// 			{
// 				resource: '/ota/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/room/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/upload/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/auto/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thông tin nhà, phòng',
// 	},
// 	{
// 		name: 'user',
// 		permissions: [
// 			{
// 				resource: '/user/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/host/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/role/',
// 				methods: ['GET'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Quyền đăng nhập vào hệ thống',
// 	},
// 	{
// 		name: 'reservation',
// 		permissions: [
// 			{
// 				resource: '/reservation/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/upload/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/rate/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/note/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi trạng thái đặt phòng, lịch',
// 	},
// 	{
// 		name: 'booking',
// 		permissions: [
// 			{
// 				resource: '/booking/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi danh sách, thông tin đặt phòng',
// 	},
// 	{
// 		name: 'review',
// 		permissions: [
// 			{
// 				resource: '/review/*',
// 				methods: ['GET', 'POST'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi đánh giá',
// 	},
// 	{
// 		name: 'inbox',
// 		permissions: [
// 			{
// 				resource: '/inbox/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/messages/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi tin nhắn',
// 	},
// 	{
// 		name: 'guest',
// 		permissions: [
// 			{
// 				resource: '/guest/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thông tin khách',
// 	},
// 	{
// 		name: 'promotion',
// 		permissions: [
// 			{
// 				resource: '/promotion/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thông tin khuyến mãi',
// 	},
// 	{
// 		name: 'finance',
// 		permissions: [
// 			{
// 				resource: '/finance/*',
// 				methods: ['*'],
// 				subRoutes: [
// 					{
// 						resource: '/export/confirmed/*',
// 						methods: ['POST'],
// 						action: 'deny',
// 					},
// 				],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/payment/*',
// 				methods: ['*'],
// 				subRoutes: [
// 					{
// 						resource: '/export/confirmed/*',
// 						methods: ['POST'],
// 						action: 'deny',
// 					},
// 				],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thông tin tài chính',
// 	},
// 	{
// 		name: 'payout confirmed',
// 		permissions: [
// 			{
// 				resource: '/finance/export/confirmed/*',
// 				methods: ['POST'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Xác nhận thông tin doanh thu, hoàn ứng',
// 	},
// 	{
// 		name: 'task',
// 		permissions: [
// 			{
// 				resource: '/task/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi tất cả thông tin nhiệm vụ',
// 	},
// 	{
// 		name: 'account',
// 		permissions: [
// 			{
// 				resource: '/account/*',
// 				methods: ['*'],
// 				subRoutes: [
// 					{
// 						resource: '/changRole/*',
// 						methods: ['PUT'],
// 						action: 'deny',
// 					},
// 				],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thông tin tài khoản trên hệ thống',
// 	},
// 	{
// 		name: 'cost confirmed',
// 		permissions: [
// 			{
// 				resource: '/payment/export/confirmed/*',
// 				methods: ['POST'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/payment/export/completed/*',
// 				methods: ['POST'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Xác nhận hoàn ứng / duyệt chi',
// 	},
// 	{
// 		name: 'upload',
// 		permissions: [
// 			{
// 				resource: '/upload/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Tải lên dữ liệu tĩnh (tệp, hình ảnh,...)',
// 	},
// 	{
// 		name: 'ott',
// 		permissions: [
// 			{
// 				resource: '/ott/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/facebook/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi danh sách SDT của các OTT',
// 	},
// 	{
// 		name: 'create task',
// 		permissions: [
// 			{
// 				resource: '/task/',
// 				methods: ['POST'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Tạo nhiệm vụ mới',
// 	},
// 	{
// 		name: 'hide reservation price',
// 		permissions: [],
// 		description: 'Ẩn giá đặt phòng',
// 	},
// 	{
// 		name: 'roles',
// 		permissions: [
// 			{
// 				resource: '/account/changRole/*',
// 				methods: ['PUT'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/role/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi danh sách quyền trên hệ thống',
// 	},
// 	{
// 		name: 'doing task',
// 		permissions: [
// 			{
// 				resource: 'task/:taskId/status',
// 				methods: ['POST'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Thay đổi trạng thái nhiệm vụ',
// 	},
// 	{
// 		name: 'ota headers',
// 		permissions: [
// 			{
// 				resource: '/otaHeader/*',
// 				methods: ['POST', 'GET'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Dev only!',
// 	},
// 	{
// 		name: 'calling',
// 		permissions: [
// 			{
// 				resource: 'call/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Gọi điện thoại',
// 	},
// 	{
// 		name: 'autoResolveOverbook',
// 		permissions: [
// 			{
// 				resource: '/setting/autoResolveOverbook*',
// 				methods: ['POST', 'GET'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Chỉnh sửa trạng thái Overbook',
// 	},
// 	{
// 		name: 'hide_unknown_inbox',
// 		permissions: [],
// 		description: 'Ẩn các tin nhắn không có nguồn nhà',
// 	},
// 	{
// 		name: 'roomPrice',
// 		permissions: [
// 			{
// 				resource: 'price/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: 'setting',
// 				methods: ['GET'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thông tin giá phòng',
// 	},
// 	{
// 		name: 'view_booking_note',
// 		permissions: [],
// 		description: 'Xem ghi chú của đặt phòng',
// 	},
// 	{
// 		name: 'performance',
// 		permissions: [
// 			{
// 				resource: '/performance/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Xem thông tin hiệu suất các nhà',
// 	},
// 	{
// 		name: 'work note',
// 		permissions: [
// 			{
// 				resource: 'workNote/*',
// 				methods: ['*'],
// 				action: 'allow',
// 				subRoutes: [
// 					{
// 						resource: 'workNote/host/*',
// 						methods: ['*'],
// 						action: 'deny',
// 					},
// 				],
// 			},
// 		],
// 		description: 'Đọc/ghi sổ giao ca',
// 	},
// 	{
// 		name: 'work note host',
// 		permissions: [
// 			{
// 				resource: 'workNote/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi sổ giao ca (host)',
// 	},
// 	{
// 		name: 'sms',
// 		permissions: [
// 			{
// 				resource: '/sms/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Xem thông tin sms',
// 	},
// 	{
// 		name: 'sms_money',
// 		permissions: [],
// 		description: 'Xem thông tin số dư sms',
// 	},
// 	{
// 		name: 'equipment',
// 		permissions: [
// 			{
// 				resource: '/equipment/*',
// 				methods: ['*'],
// 				action: 'allow',
// 				subRoutes: [
// 					{
// 						resource: '/:type/approve/:id',
// 						methods: ['PUT'],
// 						action: 'deny',
// 					},
// 				],
// 			},
// 		],
// 		description: 'Đọc / ghi thông tin vật tư',
// 	},
// 	{
// 		name: 'equipment_approve',
// 		permissions: [
// 			{
// 				resource: '/equipment/:type/approve/:id',
// 				methods: ['PUT'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Duyệt thông tin vật tư',
// 	},
// 	{
// 		name: 'assets',
// 		permissions: [
// 			{
// 				resource: '/asset/*',
// 				methods: ['*'],
// 				action: 'allow',
// 				subRoutes: [
// 					{
// 						resource: '/:type/approve/:id',
// 						methods: ['PUT'],
// 						action: 'deny',
// 					},
// 				],
// 			},
// 		],
// 		description: 'Quản lý tài sản',
// 	},
// 	{
// 		name: 'assets_approve',
// 		permissions: [
// 			{
// 				resource: '/asset/:type/approve/:id',
// 				methods: ['PUT'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/asset/asset_confirmation/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Duyệt thông tin taì sản',
// 	},
// 	{
// 		name: 'assets_action_approve',
// 		permissions: [
// 			{
// 				resource: '/asset/:type/approve/:id',
// 				methods: ['PUT'],
// 				action: 'allow',
// 			},
// 			{
// 				resource: '/asset/asset_action/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Duyệt yêu cầu thay đổi tài sản',
// 	},
// 	{
// 		name: 'letter',
// 		permissions: [
// 			{
// 				resource: 'letter/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi thư',
// 	},
// 	{
// 		name: 'voucher',
// 		permissions: [
// 			{
// 				resource: 'voucher/*',
// 				methods: ['*'],
// 				action: 'allow',
// 			},
// 		],
// 		description: 'Đọc/ghi Voucher',
// 	},
// ];

const Model = mongoose.model('RolePermissions', RolePermissionsSchema, 'role_permissions');

module.exports = Model;
