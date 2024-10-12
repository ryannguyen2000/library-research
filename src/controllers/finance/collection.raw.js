const testCollections = [
	{
		propertyId: '44595950',
		account: 'hoangdang',
		otaName: 'agoda',
		blockId: '5c09e9c04d46ed49f9aacbb8',
		propertyName: 'tb Homes - Kena House',
		transactions: [
			{
				amountToSale: 0,
				amountFromOTA: 0,
				amountToOTA: 0,
				amount: -401315,
				otaBookingId: '1158101965',
				otaName: 'agoda',
				booked: '2024-01-07',
				checkIn: '2024-01-08',
				checkOut: '2024-01-09',
				id: 5371498213,
				otaId: 5371498213,
				status: 'Allotment reject',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
				adjustment: true,
			},
			{
				amountToSale: 521188,
				amountFromOTA: 401315,
				amountToOTA: 0,
				amount: 401315,
				otaBookingId: '1158101965',
				otaName: 'agoda',
				booked: '2024-01-07',
				checkIn: '2024-01-08',
				checkOut: '2024-01-09',
				guestName: 'Ngoc Nguyen',
				id: 5371498212,
				otaId: 5371498212,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 536572,
				amountFromOTA: 413160,
				amountToOTA: 0,
				amount: 413160,
				otaBookingId: '1111832292',
				otaName: 'agoda',
				booked: '2024-01-05',
				checkIn: '2024-01-09',
				checkOut: '2024-01-10',
				guestName: 'Tuyền Bùi',
				id: 5363742234,
				otaId: 5363742234,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 1024485,
				amountFromOTA: 788853,
				amountToOTA: 0,
				amount: 788853,
				otaBookingId: '1158810233',
				otaName: 'agoda',
				booked: '2024-01-08',
				checkIn: '2024-01-08',
				checkOut: '2024-01-10',
				guestName: 'Hoang Thi Ngoc Phu',
				id: 5375245512,
				otaId: 5375245512,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 550833,
				amountFromOTA: 424141,
				amountToOTA: 0,
				amount: 424141,
				otaBookingId: '1159171849',
				otaName: 'agoda',
				booked: '2024-01-08',
				checkIn: '2024-01-09',
				checkOut: '2024-01-10',
				guestName: 'Minh Nguyen',
				id: 5377079795,
				otaId: 5377079795,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 550833,
				amountFromOTA: 424141,
				amountToOTA: 0,
				amount: 424141,
				otaBookingId: '1114792012',
				otaName: 'agoda',
				booked: '2024-01-08',
				checkIn: '2024-01-09',
				checkOut: '2024-01-10',
				guestName: 'Nhi Nguyen Hoang Yen',
				id: 5378360720,
				otaId: 5378360720,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 544207,
				amountFromOTA: 419040,
				amountToOTA: 0,
				amount: 419040,
				otaBookingId: '409851847',
				otaName: 'agoda',
				booked: '2024-01-08',
				checkIn: '2024-01-10',
				checkOut: '2024-01-11',
				guestName: 'Tri Pham Hoang Minh',
				id: 5376432783,
				otaId: 5376432783,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 558468,
				amountFromOTA: 430020,
				amountToOTA: 0,
				amount: 430020,
				otaBookingId: '1114491156',
				otaName: 'agoda',
				booked: '2024-01-08',
				checkIn: '2024-01-10',
				checkOut: '2024-01-11',
				guestName: 'minh nguyễn',
				id: 5377097999,
				otaId: 5377097999,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 1753360,
				amountFromOTA: 1368268,
				amountToOTA: 0,
				amount: 1368268,
				otaBookingId: '1103368752',
				otaName: 'agoda',
				booked: '2023-12-25',
				checkIn: '2024-01-09',
				checkOut: '2024-01-12',
				guestName: 'Trần Thuý Kiều Trần Thuý Kiều',
				id: 5318355096,
				otaId: 5318355096,
				status: 'Pending Departure',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 1145485,
				amountFromOTA: 899634,
				amountToOTA: 0,
				amount: 899634,
				otaBookingId: '1157936561',
				otaName: 'agoda',
				booked: '2024-01-07',
				checkIn: '2024-01-10',
				checkOut: '2024-01-12',
				guestName: 'Le Thai Loc',
				id: 5370317571,
				otaId: 5370317571,
				status: 'Pending Departure',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 587017,
				amountFromOTA: 469614,
				amountToOTA: 0,
				amount: 469614,
				otaBookingId: '1115640900',
				otaName: 'agoda',
				booked: '2024-01-09',
				checkIn: '2024-01-11',
				checkOut: '2024-01-12',
				guestName: 'My Phuong Tran',
				id: 5382754184,
				otaId: 5382754184,
				status: 'Pending Departure',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 0,
				amountFromOTA: 0,
				amountToOTA: 0,
				amount: 0,
				otaBookingId: '1159702665',
				otaName: 'agoda',
				booked: '2024-01-09',
				checkIn: '2024-05-27',
				checkOut: '2024-06-13',
				guestName: 'Thái Lý Hồng',
				id: 5380192442,
				otaId: 5380192442,
				status: 'Cancelled',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
		],
		totalAmount: 5636871,
		currency: 'VND',
		paymentMethod: 5,
		paymentMethodName: 'UPC on ePass',
		date: '2024-01-12',
		status: 'awaiting',
	},
	{
		propertyId: '32914198',
		account: 'hoangdang',
		otaName: 'agoda',
		blockId: '5cd590f02ca5fc403d7e0240',
		propertyName: 'tb Homes - June Corner',
		transactions: [
			{
				amountToSale: 1295854,
				amountFromOTA: 1006318,
				amountToOTA: 0,
				amount: 1006318,
				otaBookingId: '1089162744',
				otaName: 'agoda',
				booked: '2023-12-08',
				checkIn: '2023-12-09',
				checkOut: '2023-12-11',
				guestName: 'DEHONG SONG',
				id: 5245007213,
				otaId: 5245007213,
				status: 'Departed',
				bookingId: '6555d7defa3b2a34b0065e56',
				currency: 'VND',
			},
			{
				amountToSale: 546987,
				amountFromOTA: 410240,
				amountToOTA: 0,
				amount: 410240,
				otaBookingId: '1090407112',
				otaName: 'agoda',
				booked: '2023-12-10',
				checkIn: '2023-12-10',
				checkOut: '2023-12-11',
				guestName: 'bich ngoc',
				id: 5251701782,
				otaId: 5251701782,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 532505,
				amountFromOTA: 399379,
				amountToOTA: 0,
				amount: 399379,
				otaBookingId: '1132862645',
				otaName: 'agoda',
				booked: '2023-12-10',
				checkIn: '2023-12-10',
				checkOut: '2023-12-11',
				guestName: 'Vinh Dang hong',
				id: 5252240968,
				otaId: 5252240968,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 558562,
				amountFromOTA: 418921,
				amountToOTA: 0,
				amount: 418921,
				otaBookingId: '1090875028',
				otaName: 'agoda',
				booked: '2023-12-10',
				checkIn: '2023-12-10',
				checkOut: '2023-12-11',
				guestName: 'Chí Ân Trần',
				id: 5253664310,
				otaId: 5253664310,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 1067740,
				amountFromOTA: 800805,
				amountToOTA: 0,
				amount: 800805,
				otaBookingId: '1129063241',
				otaName: 'agoda',
				booked: '2023-12-06',
				checkIn: '2023-12-10',
				checkOut: '2023-12-12',
				guestName: 'Hải Anh Vũ',
				id: 5233692615,
				otaId: 5233692615,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 1719722,
				amountFromOTA: 1323439,
				amountToOTA: 0,
				amount: 1323439,
				otaBookingId: '1130365913',
				otaName: 'agoda',
				booked: '2023-12-07',
				checkIn: '2023-12-09',
				checkOut: '2023-12-12',
				guestName: 'Go Sawm Lian',
				id: 5239839732,
				otaId: 5239839732,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 468044,
				amountFromOTA: 351033,
				amountToOTA: 0,
				amount: 351033,
				otaBookingId: '1091352840',
				otaName: 'agoda',
				booked: '2023-12-11',
				checkIn: '2023-12-11',
				checkOut: '2023-12-12',
				guestName: 'Trịnh Ân Hồ Nguyễn',
				id: 5256299490,
				otaId: 5256299490,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 450834,
				amountFromOTA: 338126,
				amountToOTA: 0,
				amount: 338126,
				otaBookingId: '1091470288',
				otaName: 'agoda',
				booked: '2023-12-11',
				checkIn: '2023-12-11',
				checkOut: '2023-12-12',
				guestName: 'Quang Dong To',
				id: 5256734861,
				otaId: 5256734861,
				status: 'Departed',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 0,
				amountFromOTA: 0,
				amountToOTA: 0,
				amount: 0,
				otaBookingId: '1117284712',
				otaName: 'agoda',
				booked: '2024-01-11',
				checkIn: '2024-01-11',
				checkOut: '2024-01-13',
				guestName: 'Phương Trần',
				id: 5391028220,
				otaId: 5391028220,
				status: 'Cancelled',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 0,
				amountFromOTA: 0,
				amountToOTA: 0,
				amount: 0,
				otaBookingId: '1109546456',
				otaName: 'agoda',
				booked: '2024-01-02',
				checkIn: '2024-01-15',
				checkOut: '2024-01-18',
				guestName: 'Yoshitada Okada',
				id: 5351725048,
				otaId: 5351725048,
				status: 'Cancelled',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				amountToSale: 0,
				amountFromOTA: 0,
				amountToOTA: 0,
				amount: 0,
				otaBookingId: '1160829753',
				otaName: 'agoda',
				booked: '2024-01-10',
				checkIn: '2024-01-13',
				checkOut: '2024-01-20',
				guestName: 'Andre Wee',
				id: 5385496115,
				otaId: 5385496115,
				status: 'Cancelled',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
		],
		totalAmount: 5048261,
		currency: 'VND',
		paymentMethod: 1,
		paymentMethodName: 'TT - Bank Transfer',
		date: '2024-01-12',
		status: 'awaiting',
	},
	{
		propertyId: '97395562',
		account: 'tb',
		otaName: 'ctrip',
		blockId: '5cf49075617e1b2846f21f14',
		propertyName: 'tb Homes - June Corner',
		transactions: [
			{
				otaId: '3070752252',
				amountToSale: 224874.48,
				amountFromOTA: 224874.48,
				amountToOTA: 0,
				amount: 224874.48,
				otaBookingId: '999229582459830',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-10',
				checkOut: '2024-01-11',
				guestName: 'KROTKOVA/YULIA',
				id: '3070752252',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3071194471',
				amountToSale: 255305.55,
				amountFromOTA: 255305.55,
				amountToOTA: 0,
				amount: 255305.55,
				otaBookingId: '999229586408154',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-10',
				checkOut: '2024-01-11',
				guestName: 'MIN/AUNG KHANT',
				id: '3071194471',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3073993775',
				amountToSale: 250734.5,
				amountFromOTA: 250734.5,
				amountToOTA: 0,
				amount: 250734.5,
				otaBookingId: '999229608805607',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-11',
				checkOut: '2024-01-12',
				guestName: 'KANG/WOOJOO',
				id: '3073993775',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3075832839',
				amountToSale: 295682.97,
				amountFromOTA: 295682.97,
				amountToOTA: 0,
				amount: 295682.97,
				otaBookingId: '999229645391040',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-12',
				checkOut: '2024-01-13',
				guestName: 'LE/QUYNH ANH',
				id: '3075832839',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3062560525',
				amountToSale: 1083634.63,
				amountFromOTA: 1083634.63,
				amountToOTA: 0,
				amount: 1083634.63,
				otaBookingId: '999229496714136',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-09',
				checkOut: '2024-01-13',
				guestName: 'ABE/HIROSHI',
				id: '3062560525',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3077162596',
				amountToSale: 329061.56,
				amountFromOTA: 329061.56,
				amountToOTA: 0,
				amount: 329061.56,
				otaBookingId: '999229677814382',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-13',
				checkOut: '2024-01-14',
				guestName: 'ZHANG/WANG',
				id: '3077162596',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3080297623',
				amountToSale: 256754.58,
				amountFromOTA: 256754.58,
				amountToOTA: 0,
				amount: 256754.58,
				otaBookingId: '999229693194472',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-14',
				checkOut: '2024-01-15',
				guestName: 'CHEN/QIAN',
				id: '3080297623',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
			{
				otaId: '3072952726',
				amountToSale: 1072901.97,
				amountFromOTA: 1072901.97,
				amountToOTA: 0,
				amount: 1072901.97,
				otaBookingId: '999229601680080',
				otaName: 'ctrip',
				booked: '',
				checkIn: '2024-01-11',
				checkOut: '2024-01-15',
				guestName: 'HUANG/YIWEN',
				id: '3072952726',
				currency: 'VND',
				bookingId: '6555d7defa3b2a34b0065e56',
			},
		],
		totalAmount: 3768950.24,
		currency: 'VND',
		paymentMethod: 1,
		paymentMethodName: 'Bank Transfer',
		bankAccountInfo: {
			bankName: 'Vietnam Technological and Commercial Joint Stock Bank',
			cardNo: '************1017',
			accountName: 'CONG TY CO PHAN DICH VU CONG NGHE tb',
		},
		date: '2024-01-15',
		status: 'awaiting',
	},
];

const testConfirmations = [
	{
		paymentMethod: 5,
		paymentMethodName: 'UPC on ePass',
		propertyId: '44595950',
		cards: [
			{
				_id: '65a0f1c68e5c60071f6d181c',
				cardHolderName: 'NGUYEN VAN A',
				cardNumber: '1233 4334 3434 3434',
				cardType: 'Master Card',
				expiryDate: '12-01',
				currency: 'VND',
				amount: 11234567,
				securityCode: '441',
				isSingleSwipe: true,
				statusPaid: false,
				swipeStatus: 'unswiped',
			},
		],
		collectionKey: 'PaymentMethod',
		collectionValue: 'UPC on ePass',
		report: {
			_id: '65a0f1faecb5b667d851464f',
			currencyAmount: {
				VND: 1165000,
				USD: 0,
			},
			payoutType: 'reservation',
			payouts: ['656fe2b98683be263c189857', '656fe2c28683be263c189873', '656fe0bd8683be263c18964e'],
			payoutFees: [],
			collectionIds: [],
			attachments: [],
			confirmationAttachments: [],
			transactionIds: [],
			printBill: false,
			groupIds: ['6358f2cd929154c8cb28d893'],
			blockIds: ['5c4976831c55e260e2e592a8'],
			name: 'TEST COLLECTIONS',
			createdBy: '5bd979d16ced2e868cfe77b5',
			noId: 'HU1040',
			approved: [],
			cardIds: ['65a0f1c68e5c60071f6d181c'],
			createdAt: '2024-01-12T15:02:02.266+07:00',
			updatedAt: '2024-01-12T15:02:21.558+07:00',
			totalTransactionFee: 500,
		},
	},
	{
		paymentMethod: 2,
		paymentMethodName: 'TT - Bank Transfer',
		propertyId: '32914198',
		cards: [],
		collectionKey: 'PaymentMethod',
		collectionValue: 'Agoda - Telex Transfer',
		report: {
			_id: '65a0f1faecb5b667d851464f',
			currencyAmount: {
				VND: 1165000,
				USD: 0,
			},
			payoutType: 'reservation',
			payouts: ['656fe2b98683be263c189857', '656fe2c28683be263c189873', '656fe0bd8683be263c18964e'],
			payoutFees: [],
			collectionIds: [],
			attachments: [],
			confirmationAttachments: [],
			transactionIds: [],
			printBill: false,
			groupIds: ['6358f2cd929154c8cb28d893'],
			blockIds: ['5c4976831c55e260e2e592a8'],
			name: 'TEST COLLECTIONS',
			createdBy: '5bd979d16ced2e868cfe77b5',
			noId: 'HU1040',
			approved: [],
			cardIds: ['65a0f1c68e5c60071f6d181c'],
			createdAt: '2024-01-12T15:02:02.266+07:00',
			updatedAt: '2024-01-12T15:02:21.558+07:00',
			totalTransactionFee: 500,
		},
	},
	{
		paymentMethod: 2,
		paymentMethodName: 'TT - Bank Transfer',
		propertyId: '97395562',
		cards: [],
	},
];

module.exports = {
	testCollections,
	testConfirmations,
};