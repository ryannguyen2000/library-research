const moment = require('moment');
const _ = require('lodash');
const xlsx = require('xlsx');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const {
	VATExportType,
	Currency,
	BookingStatus,
	AccountConfigTypes,
	AccountProvider,
	TaskStatus,
	INVOICE_STATUS,
	Services,
} = require('@utils/const');
const EasyInvoice = require('@services/easyInvoice');
const VnptInvoice = require('@services/vnptInvoice');
const { eventEmitter, EVENTS } = require('@utils/events');
const { logger } = require('@utils/logger');

const { XLSX_CONFIG } = require('./const');

function getNote({ from, to, fromHour, toHour, isHour }) {
	if (isHour) {
		return `Tiền phòng từ ${fromHour} đến ${toHour} ${moment(from).format('DD/MM')}`;
	}

	const generate = value => (value < 10 ? `0${value}` : `${value}`);

	const _from = moment(from);
	const _to = moment(to);
	const fromMonth = generate(_from.month() + 1);
	const toMonth = generate(_to.month() + 1);
	const fromDate = generate(_from.date());
	const toDate = generate(_to.date());

	return fromMonth === toMonth
		? `Tiền phòng từ ${fromDate}-${toDate}/${toMonth}`
		: `Tiền phòng từ ${fromDate}/${fromMonth}-${toDate}/${toMonth}`;
}

function getPriceData({ task, reservation, totalReservationDays, vatPercent }) {
	const amount = _.get(task, 'other.price') || _.get(task, 'other.bookPrice') || 0;
	const itemQuantity = reservation.dates.length || 1;

	const itemPriceIncludingVAT = _.round(amount / totalReservationDays);
	const priceincludingVAT = itemPriceIncludingVAT * itemQuantity;

	const itemPriceExcludingVAT = _.round(itemPriceIncludingVAT / (1 + vatPercent));
	const priceExcludingVAT = itemPriceExcludingVAT * itemQuantity;

	return {
		itemQuantity,
		itemPriceIncludingVAT,
		itemPriceExcludingVAT,
		priceExcludingVAT,
		priceincludingVAT,
	};
}

function getMisaRow({ index, group, task, vatPercent, reservation, totalReservationDays, serviceType }) {
	const { DEFAULT } = XLSX_CONFIG[VATExportType.MISA].XLSX;

	const from = reservation.dates[0].date;
	const to = moment(_.last(reservation.dates).date).add(1, 'day').toISOString();
	const note = getNote({ from, to, serviceType });
	const present = moment().format('DD/MM/YYYY');

	const { itemQuantity, itemPriceIncludingVAT, priceExcludingVAT, itemPriceExcludingVAT } = getPriceData({
		task,
		reservation,
		totalReservationDays,
		vatPercent,
	});

	return [
		'', // Hiển thị trên sổ,
		'', // Hình thức bán hàng,
		'', // Phương thức thanh toán,
		'', // Kiểm phiếu xuất kho,
		'', // XK vào khu phi thuế quan và các TH được coi như XK,
		DEFAULT.issueInvoiceAlongWith, // Lập kèm hóa đơn,
		'', // Đã lập hóa đơn,
		present, // Ngày hạch toán (*),
		present, // Ngày chứng từ (*),
		group, // Số chứng từ (*),
		index, // Số phiếu xuất,
		'', // Lý do xuất,
		'', // Số hóa đơn,
		present, // Ngày hóa đơn,
		'', // Mã khách hàng,
		task.other.company, // Tên khách hàng,
		task.other.address, // Địa chỉ,
		task.other.taxNumber, // Mã số thuế,
		note, // Diễn giải,
		'', // Nộp vào TK,
		'', // NV bán hàng,
		DEFAULT.productCode, // Mã hàng (*),
		note, // Tên hàng,
		'', // Hàng khuyến mại,
		DEFAULT.loanAccount, // TK Tiền/Chi phí/Nợ (*),
		DEFAULT.revenueAccount, // TK Doanh thu/Có (*),
		DEFAULT.unit, // ĐVT,
		itemQuantity, // Số lượng,
		itemPriceIncludingVAT, // Đơn giá sau thuế,
		itemPriceExcludingVAT, // Đơn giá,
		priceExcludingVAT, // Thành tiền,
		'', // Tỷ lệ CK (%),
		'', // Tiền chiết khấu,
		'', // TK chiết khấu,
		'', // Giá tính thuế XK,
		'', // % thuế XK,
		'', // Tiền thuế XK,
		'', // TK thuế XK,
		vatPercent * 100, // % thuế GTGT,
		'', // Tiền thuế GTGT,
		'', // TK thuế GTGT,
		'', // HH không TH trên tờ khai thuế GTGT,
		'', // Kho,
		'', // TK giá vốn,
		'', // TK Kho,
		'', // Đơn giá vốn,
		'', // Tiền vốn,
		'', // Hàng hóa giữ hộ/bán hộ,
	];
}

function getViettelRow({
	index,
	group,
	task,
	vatPercent,
	reservation,
	isIncludeBuyerInfo = true,
	totalReservationDays,
	serviceType,
}) {
	const { DEFAULT } = XLSX_CONFIG[VATExportType.VIETTEL].XLSX;
	const from = reservation.dates[0].date;
	const to = moment(_.last(reservation.dates).date).add(1, 'day').toISOString();
	const itemName = getNote({ from, to, serviceType });
	const { itemQuantity, itemPriceExcludingVAT, priceExcludingVAT } = getPriceData({
		task,
		reservation,
		totalReservationDays,
		vatPercent,
	});

	const buyerInfo = isIncludeBuyerInfo
		? [
				index, // itemNo
				group, // group
				'',
				'', // buyerCode,
				'', // buyerName,
				task.other.address || '', // buyerAddress
				'', // buyerPhone
				task.other.email || '', // buyerEmail
				task.other.taxNumber || '', // buyerTaxCode
				DEFAULT.buyerIdType, // buyerIdType
				task.other.taxNumber || '', // buyerIdNo
				task.other.company || '', // buyerLegalName
				'', // buyerBankName
				'', // buyerBankAccount
				'', // contactNo
		  ]
		: [
				index, // itemNo
				group, // group
				'',
				'', // buyerCode
				'', // buyerName
				'', // buyerAddress
				'', // buyerPhone
				'', // buyerEmail
				'', // buyerTaxCode
				'', // buyerIdType
				'', // buyerIdNo
				'', // buyerLegalName
				'', // buyerBankName
				'', // buyerBankAccount
				'', // contactNo
		  ];
	const transactionInfo = [
		DEFAULT.payMethod, // payMethod
		DEFAULT.payStatus, // payStatus
		reservation.currency || Currency.VND, // currencyCode
		reservation.currencyExchange, // exchangeRate
	];
	const goodsInfo = [
		DEFAULT.selection, // selection
		DEFAULT.itemCode, // itemCode
		itemName, // itemName
		'', // itemNote
		'', // batchNo
		'', // expDate
		DEFAULT.itemUnit, // itemUnit
		itemQuantity, // itemQuantity
		itemPriceExcludingVAT, // itemPrice
		priceExcludingVAT, // amountBeforeTax
		vatPercent * 100, // taxPercentage
		'', // taxAmount
	];
	const additionalInfo = [
		'', // Exchange
		'', // Explain
		'', // BHNo
		'', // Note
		'', // bl
		'', // makh
		'', // do
		'', // rpo
		'', // tongtl
		'', // hantt
		'', // invoiceDiscount
		'', // invoiceNote
		'', // result
	];

	return [...buyerInfo, ...transactionInfo, ...goodsInfo, ...additionalInfo];
}

function getTotalReservationDays(task, reservationsGrbyBookingId) {
	const total = task.bookingId.reduce((totalBookingDays, bookingId) => {
		const reservations = reservationsGrbyBookingId[bookingId._id.toString()] || [];
		const totalResDays = reservations.reduce((_total, res) => {
			_total += _.get(res, 'dates.length', 0);
			return _total;
		}, 0);

		totalBookingDays += totalResDays;
		return totalBookingDays;
	}, 0);

	return total;
}

function getWsDataByType({ tasks, reservationsGrbyBookingId, vatPercent, type }) {
	const { XLSX } = XLSX_CONFIG[type];
	const data = [];
	let index = 0;
	let group = 0;
	const isMisaExportType = type === VATExportType.MISA;

	tasks.forEach(task => {
		if (!_.isEmpty(task.bookingId)) group++;
		const totalReservationDays = getTotalReservationDays(task, reservationsGrbyBookingId);

		task.bookingId.forEach((booking, bookingIndex) => {
			const isFirstBooking = bookingIndex === 0;
			const reservations = reservationsGrbyBookingId[booking._id] || [];

			const rows = reservations.map((res, resIndex) => {
				index++;
				const isFirstRes = resIndex === 0;
				res.currencyExchange = booking.currencyExchange;

				const rowData = {
					index,
					group,
					task,
					vatPercent,
					reservation: res,
					isIncludeBuyerInfo: isFirstBooking && isFirstRes,
					totalReservationDays,
					serviceType: booking.serviceType,
				};

				return isMisaExportType ? getMisaRow(rowData) : getViettelRow(rowData);
			});

			data.push(...rows);
		});
	});

	const wsData = isMisaExportType
		? [XLSX.TITLE, ...data]
		: [Array(XLSX.TITLE.length).fill(''), XLSX.TITLE, XLSX.SUB_TITLE, ...data];

	return wsData;
}

async function getWsData(tasks = [], type) {
	const otaBookingIds = tasks.reduce((arr, task) => {
		arr.push(..._.map(task.bookingId, 'otaBookingId'));
		return arr;
	}, []);

	const [bookings, vatPercent] = await Promise.all([
		models.Booking.find({
			otaBookingId: { $in: otaBookingIds },
			status: { $ne: BookingStatus.CANCELED },
		})
			.select('roomPrice price compensation currencyExchange currency from to otaBookingId serviceType')
			.lean(),
		models.Setting.getVATPercent(),
	]);

	tasks.forEach(task => {
		const _otaBookingIds = task.bookingId.map(b => b.otaBookingId);
		task.bookingId = bookings.filter(b => _otaBookingIds.includes(b.otaBookingId));
	});

	const bookingIds = bookings.map(booking => booking._id);
	const reservations = await models.Reservation.find({ bookingId: { $in: bookingIds } })
		.select('roomPrice price compensation currencyExchange currency dates bookingId')
		.lean();
	const reservationsGrbyBookingId = _.groupBy(reservations, 'bookingId');

	const wsData = getWsDataByType({ tasks, reservationsGrbyBookingId, vatPercent, type });

	return wsData;
}

async function exportVATList(data, user) {
	const { type = VATExportType.MISA, taskIds } = data;

	const CONFIG = XLSX_CONFIG[type];
	if (!CONFIG) throw new ThrowReturn('Invoice type does not supported');
	if (!_.get(taskIds, 'length', 0)) throw new ThrowReturn('Task can not empty');

	const [category, { filters }] = await Promise.all([
		models.TaskCategory.getVAT(),
		models.Host.getBlocksOfUser({ user }),
	]);

	const filter = {
		_id: { $in: taskIds },
		category: category._id,
		...filters,
	};

	const tasks = await models.Task.find(filter)
		.select('other bookingId')
		.populate('bookingId', 'roomPrice price compensation currencyExchange currency from to otaBookingId')
		.sort({ time: -1 })
		.lean();

	const wsData = await getWsData(tasks, type);

	const wb = xlsx.utils.book_new();
	const ws = xlsx.utils.aoa_to_sheet([]);

	Object.assign(ws, CONFIG.XLSX.WS_DEFAULT);

	xlsx.utils.sheet_add_aoa(ws, wsData, { origin: CONFIG.XLSX.ORIGIN });
	xlsx.utils.book_append_sheet(wb, ws, 'Thông tin hoá đơn');

	const fileName = CONFIG.FILE_NAME;
	const xlsxBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xls' });

	return { fileName, xlsxBuffer };
}

function getIKey(config, task) {
	return `${config.others.iKeyPrefix || ''}${task.no}`;
}

async function publishInvoices(user, data) {
	const { taskIds } = data;

	if (!_.get(taskIds, 'length', 0)) {
		throw new ThrowReturn('Danh sách nhiệm vụ không được để trống!');
	}

	const [category, { filters }] = await Promise.all([
		models.TaskCategory.getVAT(),
		models.Host.getBlocksOfUser({ user }),
	]);

	const filter = {
		_id: { $in: taskIds },
		category: category._id,
		...filters,
	};

	const tasks = await models.Task.find(filter).populate({
		path: 'bookingId',
		select: 'blockId roomPrice price compensation currencyExchange currency from to fromHour toHour otaBookingId guestId serviceType',
		populate: {
			path: 'guestId',
			select: 'phone fullName',
		},
	});
	if (!tasks.length) {
		throw new ThrowReturn('Danh sách nhiệm vụ trống!');
	}

	const config =
		(await models.AccountConfig.findOne({
			accountType: AccountConfigTypes.Invoice,
			active: true,
			blockIds: tasks[0].blockId,
		})) ||
		(await models.AccountConfig.findOne({
			accountType: AccountConfigTypes.Invoice,
			active: true,
			groupIds: { $in: user.groupIds },
		}));
	if (!config) {
		throw new ThrowReturn('Không tìm thấy cấu hình xuất hoá đơn!');
	}

	const vatPercent = await models.Setting.getVATPercent();
	// config.provider === AccountProvider.VNPT_INVOICE

	const items = tasks.map(task => {
		const totalPrice = task.other.price || task.other.bookPrice;
		const totalDays = _.sumBy(task.bookingId, b => b.to.diffDays(b.from) || 1);
		const totalPriceBeforeTax = vatPercent ? _.round(totalPrice / (1 + vatPercent)) : totalPrice;

		const vatRate = _.round(vatPercent * 100);
		const customerCode = _.get(task.bookingId[0], 'guestId.phone') || task.bookingId[0].otaBookingId;
		const customerName = _.get(task.bookingId[0], 'guestId.fullName');
		const globalUnitPriceIncludeTax = _.round(totalPrice / totalDays);
		const globalUnitPrice = _.round(totalPriceBeforeTax / totalDays);

		const products = _.map(task.bookingId, (booking, i) => {
			const isHour = booking.serviceType === Services.Hour;

			const unit = isHour ? 'Giờ' : 'Đêm';
			const quantity = !isHour
				? booking.to.diffDays(booking.from) || 1
				: _.round(moment(booking.toHour, 'HH:mm').diff(moment(booking.fromHour, 'HH:mm'), 'minute') / 60, 1);

			const unitPrice = !isHour ? globalUnitPrice : globalUnitPrice / quantity;
			const unitPriceIncludeTax = !isHour ? globalUnitPriceIncludeTax : globalUnitPriceIncludeTax / quantity;

			const priceBeforeTax = unitPrice * quantity;
			const price = unitPriceIncludeTax * quantity;

			return {
				code: `${booking.otaBookingId}_${i + 1}`,
				name: isHour
					? getNote({
							from: booking.from,
							to: booking.to,
							fromHour: booking.fromHour,
							toHour: booking.toHour,
							isHour,
					  })
					: getNote({ from: booking.from, to: booking.to }),
				quantity,
				unitPrice,
				unit,
				price,
				priceBeforeTax,
				vatRate,
				vatAmount: price - priceBeforeTax,
			};
		});

		return {
			vatRate,
			iKey: getIKey(config, task),
			company: task.other.company,
			email: task.other.email || '',
			address: task.other.address || '',
			taxNumber: task.other.taxNumber || '',
			phone: '',
			customerCode,
			customerName,
			totalPrice: _.sumBy(products, 'price'),
			totalPriceBeforeTax: _.sumBy(products, 'priceBeforeTax'),
			totalVatAmount: _.sumBy(products, 'vatAmount'),
			products,
		};
	});

	const invoices =
		config.provider === AccountProvider.EASY_INVOICE
			? await EasyInvoice.publishInvoices({ config, items }).catch(e => {
					logger.error('EasyInvoice.publishInvoices', e);
					throw new ThrowReturn(e);
			  })
			: config.provider === AccountProvider.VNPT_INVOICE
			? await VnptInvoice.publishInvoices({ config, items }).catch(e => {
					logger.error('VnptInvoice.publishInvoices', e);
					throw new ThrowReturn(e);
			  })
			: null;

	const doneTasks = [];

	const rs = tasks.map(task => {
		const iKey = getIKey(config, task);
		const invoice = invoices.find(i => i.Ikey === iKey);
		const amount = task.other.price || task.other.bookPrice;

		if (invoice) {
			doneTasks.push({
				task,
				description: invoice.LinkView || invoice.Ikey,
			});
		}

		return {
			taskId: task._id,
			iKey: _.get(invoice, 'Ikey'),
			success: !!_.get(invoice, 'No'),
			linkView: _.get(invoice, 'LinkView'),
			status: INVOICE_STATUS.PUBLISHED,
			invoice,
			amount,
			vatRate: vatPercent,
		};
	});

	const haveIkeys = rs.filter(r => r.iKey);

	if (haveIkeys.length) {
		await models.Invoice.bulkWrite(
			haveIkeys.map(r => ({
				updateOne: {
					filter: {
						iKey: r.iKey,
					},
					update: {
						...r,
						createdBy: user._id,
					},
					upsert: true,
				},
			}))
		);
	}

	await doneTasks.asyncMap(t => {
		return t.task.changeStatus(
			{
				status: TaskStatus.Done,
				description: t.description,
			},
			user
		);
	});

	return rs;
}

async function deleteInvoice({ user, iKey }) {
	const cfilter = {
		accountType: AccountConfigTypes.Invoice,
		provider: AccountProvider.EASY_INVOICE,
		active: true,
	};
	if (user) {
		cfilter.groupIds = { $in: user.groupIds };
	}

	const config = await models.AccountConfig.findOne(cfilter);
	if (!config) {
		throw new ThrowReturn('Không tìm thấy cấu hình xuất hoá đơn!');
	}

	const res = await EasyInvoice.deleteInvoice({ config, iKey }).catch(e => {
		throw new ThrowReturn(e);
	});

	await models.Invoice.updateOne(
		{ iKey },
		{ status: INVOICE_STATUS.DELETED, deletedBy: user && user._id, deletedAt: new Date() }
	);

	return res;
}

async function onTaskStatusUpdate(task, user) {
	if (task.status !== TaskStatus.Deleted) return;

	try {
		const invoice = await models.Invoice.findOne({ taskId: task._id, status: INVOICE_STATUS.PUBLISHED });
		if (!invoice) return;

		await deleteInvoice({ user, iKey: invoice.iKey });
	} catch (e) {
		logger.error('Task_onTaskStatusUpdate', e);
	}
}

eventEmitter.on(EVENTS.TASK_UPDATE_STATUS, onTaskStatusUpdate);

module.exports = {
	export: exportVATList,
	publishInvoices,
	deleteInvoice,
};
