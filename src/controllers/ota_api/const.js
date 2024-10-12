const CTRIP_REQUEST_TYPE = {
	OTA_HOTELRESRQ: {
		key: 'ota_hotelresrq',
		requestElement: 'OTA_HotelResRQ',
		responseElement: 'OTA_HotelResRS',
	},
	OTA_CANCELRQ: {
		key: 'ota_cancelrq',
		requestElement: 'OTA_CancelRQ',
		responseElement: 'OTA_CancelRS',
	},
	OTA_HOTELAVAILNOTIFRQ: {
		key: 'ota_hotelavailnotifrq',
		requestElement: 'OTA_HotelAvailNotifRQ',
		responseElement: 'OTA_HotelAvailNotifRS',
	},
	OTA_HOTELRATEAMOUNTNOTIFRQ: {
		key: 'ota_hotelrateamountnotifRQ',
		requestElement: 'OTA_HotelRateAmountNotifRQ',
		responseElement: 'OTA_HotelRateAmountNotifRS',
	},
};

const CTRIP_APPENDIX = {
	RESERVATION: {
		STATUS: {
			SUCESS: { code: 'S', description: 'Success. Committed' },
			CANCELLED: { code: 'C', description: 'Cancelled' },
			PROCESSING: { code: 'P', description: 'Processing' },
			REJECTED: { code: 'R', description: 'Rejected, failed' },
		},
		ERROR_AND_WARNING: {
			TYPE: {
				Unknown: { code: 1, description: 'Unknown' },
				Authentication: { code: 4, description: 'Authentication' },
				BizRule: { code: 3, description: 'Biz rule' },
				MD5CheckFailed: { code: 14, description: 'MD 5 Check Failed' },
			},
			CODE: {
				AuthorizationError: {
					codeValue: 497,
					codeName: 'Authorization error',
				},
				NoAvailability: {
					codeValue: 322,
					codeName: 'No availability',
				},
				SystemError: {
					codeValue: 448,
					codeName: 'System error',
				},
				UnableToProcess: {
					codeValue: 450,
					codeName: 'Unable to process',
				},
				MD5CheckFailed: {
					codeValue: 367,
					codeName: 'MD 5 Check Failed',
				},
			},
		},
		UNIQUE_ID: {
			TYPE: {
				COMPANY: '4',
				RESERVATION: '14',
				HOTEL: '10',
				MD5: '507',
			},
		},
	},
	FEE_TAX_TYPE: {
		2: {
			description: 'City Hotel Fee',
			title: 'Phí khách sạn thành phố',
			key: 'CityHotelFee',
		},
		3: {
			description: 'City Tax',
			title: 'Thuế thành phố',
			key: 'CityTax',
		},
		4: {
			description: 'County Tax',
			title: 'Thuế quận',
			key: 'CountyTax',
		},
		5: {
			description: 'Energy Tax',
			title: 'Thuế năng lượng',
			key: 'EnergyTax',
		},
		6: {
			description: 'Federal Tax',
			title: 'Thuế liên bang',
			key: 'FederalTax',
		},
		8: {
			description: 'Lodging Tax',
			title: 'Thuế lưu trú',
			key: 'LodgingTax',
		},
		9: {
			description: 'Maintenance Fee',
			title: 'Phí bảo trì',
			key: 'MaintenanceFee',
		},
		10: {
			description: 'Occupancy Tax',
			title: 'Thuế sử dụng',
			key: 'OccupancyTax',
		},
		12: {
			description: 'Resort Fee',
			title: 'Phí resort',
			key: 'ResortFee',
		},
		13: {
			description: 'Sales Tax',
			title: 'Thuế bán hàng',
			key: 'SalesTax',
		},
		14: {
			description: 'Service Charge',
			title: 'Phí dịch vụ',
			key: 'ServiceCharge',
		},
		15: {
			description: 'State Tax',
			title: 'Thuế tiểu bang',
			key: 'StateTax',
		},
		18: {
			description: 'Tourism Tax',
			title: 'Thuế du lịch',
			key: 'TourismTax',
		},
		19: {
			description: 'VAT/GST Tax',
			title: 'Thuế GTGT',
			key: 'VatGstTax',
		},
		27: {
			description: 'Miscellaneous',
			title: 'Các loại phí khác',
			key: 'Miscellaneous',
		},
		28: {
			description: 'Room Tax Test',
			title: 'Kiểm tra thuế phòng',
			key: 'RoomTaxTest',
		},
		30: {
			description: 'Country Tax',
			title: 'Thuế quốc gia',
			key: 'CountryTax',
		},
		32: {
			description: 'Banquet Service Fee',
			title: 'Phí dịch vụ tiệc',
			key: 'BanquetServiceFee',
		},
		34: {
			description: 'Local Fee',
			title: 'Phí địa phương',
			key: 'LocalFee',
		},
		35: {
			description: 'Goods and Services Tax (GST)',
			title: 'Thuế hàng hóa và dịch vụ (GST)',
			key: 'GoodsAndServicesTaxGst',
		},
		36: {
			description: 'Value Added Tax (VAT)',
			title: 'Thuế giá trị gia tăng (VAT)',
			key: 'ValueAddedTaxVat',
		},
		40: {
			description: 'Pet Sanitation Fee',
			title: 'Phí vệ sinh thú cưng',
			key: 'PetSanitationFee',
		},
		46: {
			description: 'National Government Tax',
			title: 'Thuế chính phủ quốc gia',
			key: 'NationalGovernmentTax',
		},
		53: {
			description: 'State Cost Recovery Fee',
			title: 'Phí thu hồi chi phí tiểu bang',
			key: 'StateCostRecoveryFee',
		},
		55: {
			description: 'Destination Amenity Fee',
			title: 'Phí tiện nghi điểm đến',
			key: 'DestinationAmenityFee',
		},
		58: {
			description: 'Local Amenity Usage/Maintenance Fee',
			title: 'Phí sử dụng/bảo trì tiện nghi địa phương',
			key: 'LocalAmenityUsageMaintainenceFee',
		},
		59: {
			description: 'Convention / Tourism Fee',
			title: 'Phí hội nghị/du lịch',
			key: 'ConventionTourismFee',
		},
		62: {
			description: 'Event Fee',
			title: 'Phí sự kiện',
			key: 'EventFee',
		},
		64: {
			description: 'Transportation/Transfer Fee',
			title: 'Phí vận chuyển/chuyển giao',
			key: 'TransportationTransferFee',
		},
		9000: {
			description: 'Hot Spring Tax',
			title: 'Thuế suối nước nóng',
			key: 'HotSpringTax',
		},
		9001: {
			description: 'Cleaning Fee',
			title: 'Phí dọn dẹp',
			key: 'CleaningFee',
		},
		9002: {
			description: 'Bed Linen Fee',
			title: 'Phí vải giường',
			key: 'BedLinenFee',
		},
		9003: {
			description: 'Linenpackage Fee',
			title: 'Phí gói vải',
			key: 'LinenpackageFee',
		},
		9004: {
			description: 'Towel Charge',
			title: 'Phí khăn tắm',
			key: 'TowelCharge',
		},
		9005: {
			description: 'Facility Fee',
			title: 'Phí cơ sở vật chất',
			key: 'FacilityFee',
		},
		9006: {
			description: 'Mandatory Charge',
			title: 'Phí bắt buộc',
			key: 'MandatoryCharge',
		},
	},
};

module.exports = {
	CTRIP_REQUEST_TYPE,
	CTRIP_APPENDIX,
};
