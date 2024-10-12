const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { SERVICE_FEE_TYPES, MessageVariable, MessageAutoType, AutoEvents, OTTs } = require('@utils/const');
const { formatPrice, convertNumber2VietnameseWord, convertNumber2EnglishWord } = require('@utils/price');
const { logger } = require('@utils/logger');
const { generateImagePath } = require('@utils/puppeteer');
const ServiceFee = require('@controllers/booking/service_fee');
const messageOTT = require('@controllers/message/ott');

async function getInvoice(bookingId) {
	if (!mongoose.Types.ObjectId.isValid(bookingId)) {
		throw new ThrowReturn('BookingId invalid!');
	}
	const [booking, serviceFees] = await Promise.all([
		models.Booking.findById(bookingId)
			.populate('blockId', 'info')
			.populate('guestId', 'fullName phone ottIds')
			.populate('reservateRooms', 'info.name info.roomNo'),
		ServiceFee.getServiceFeesByBookingId(bookingId),
	]);

	return { booking, serviceFees };
}

async function sendInvoiceMessage(bookingId) {
	try {
		if (!mongoose.Types.ObjectId.isValid(bookingId)) {
			throw new ThrowReturn('Booking invalid');
		}

		const { booking, serviceFees } = await getInvoice(bookingId);
		const template = await models.ChatAutomatic.findOne({
			groupIds: booking.groupIds[0],
			autoType: MessageAutoType.GUEST,
			template: 'invoice',
			event: AutoEvents.Payment,
		});
		if (!template) {
			throw new ThrowReturn('Template does not exist');
		}
		const msgs = [];
		await template.contents.asyncForEach(async content => {
			let msg = content.content;
			if (msg.includes(MessageVariable.DATE.text)) {
				msg = msg.replaceAll(MessageVariable.DATE.text, moment().format('MM/YYYY'));
			}
			if (msg.includes(MessageVariable.BANK_INFO.text)) {
				msg = msg.replaceAll(MessageVariable.BANK_INFO.text, '');
			}
			if (msg.includes(MessageVariable.URL.text)) {
				msg = msg.replaceAll(MessageVariable.URL.text, 'URL');
			}
			if (msg.includes(MessageVariable.IMAGE.text)) {
				const html = await generateInvoiceHtml(booking, serviceFees);
				const imgPath = await generateImagePath({ html, fileName: bookingId });
				msgs.push({
					type: 'image',
					url: imgPath,
				});
			}
			if (msg !== MessageVariable.IMAGE.text) {
				msgs.push({
					message: msg,
					type: 'message',
				});
			}
		});

		const phone = _.get(booking, `guestId.ottIds.${OTTs.Zalo}`) || _.get(booking, 'guestId.phone');
		const ottMsgs = [];

		await msgs.asyncForEach(async msg => {
			if (msg.type === 'image') {
				const { message } = await messageOTT.sendOTTMessage({
					ottName: OTTs.Zalo,
					phone,
					attachments: [{ url: msg.url }],
					groupId: booking.groupIds,
					blockId: _.get(booking.blockId, '_id') || booking.blockId,
				});
				ottMsgs.push({
					ottName: OTTs.Zalo,
					ottPhone: phone,
					messageId: message.messageId,
					bookingId: booking._id,
					type: ['Invoice'],
				});
			} else {
				const { message } = await messageOTT.sendOTTMessage({
					ottName: OTTs.Zalo,
					phone,
					text: msg.message,
					groupId: booking.groupIds,
					blockId: _.get(booking.blockId, '_id') || booking.blockId,
				});
				ottMsgs.push({
					ottName: OTTs.Zalo,
					ottPhone: phone,
					messageId: message.messageId,
					bookingId: booking._id,
					type: ['Invoice'],
				});
			}
		});

		await models.FeeAutoMessage.insertMany(ottMsgs);

		return { serviceFees, template, phone };
	} catch (err) {
		logger.error(err);
		throw new ThrowReturn('Send invoice message error');
	}
}

async function getInvoiceHtml(bookingId) {
	if (!mongoose.Types.ObjectId.isValid(bookingId)) {
		throw new ThrowReturn('Booking invalid');
	}
	const { booking, serviceFees } = await getInvoice(bookingId);
	const html = await generateInvoiceHtml(booking, serviceFees);
	return html;
}

async function generateInvoiceHtml(booking, serviceFees) {
	const serivceFeeTypes = _.values(SERVICE_FEE_TYPES);
	const block = _.get(booking, 'blockId.info');
	const logoUrl = _.get(booking, 'blockId.info.logoUrl');
	const roomNo = _.get(booking, 'reservateRooms[0].info.roomNo') || '';
	const guestName = _.get(booking, 'guestId.fullName') || '';
	const month = moment(booking.from).month() + 1;

	const bankAccount =
		(await models.BankAccount.findOne({
			active: true,
			displayOnWeb: true,
			blockIds: booking.blockId._id,
		}).lean()) ||
		(await models.BankAccount.findOne({
			active: true,
			displayOnWeb: true,
			groupIds: { $in: booking.groupIds },
			'blockIds.0': { $exists: false },
		}).lean());

	if (!bankAccount) throw new ThrowReturn('BankAccount does not exist!');

	/// style
	const header_style =
		'color: #5495ff; font-weight: bold; text-align: center; font-size: 1em; border: 1px solid black;padding: 1.5em 5em 1.5em 5em';
	const right_container_style = 'display: flex; flex: 3; flex-direction: column; align-items: center; height: 100';
	const info_style = 'font-size: 15px; margin: 0px 0px 4px 0px; ';
	const item_style =
		'font-size: 14px; text-align: start; margin: 0 2px 0 2px; border: 1px solid black; border-collapse: collapse; ';
	const bank_info_style = 'font-size: 14px; color: red; margin: 0';
	const noti_style = 'font-size: 14px; font-weight: bold; margin: 0';
	const amount_style =
		'font-weight: bold; font-size: 14px; text-align: end; border: 1px solid black; border-collapse: collapse; ';
	const th_style =
		'font-size: 15px; border: 1px solid black; border-collapse: collapse; text-align: center; padding: 5px;';
	const sub_item_title_style = 'font-size: 12px; font-style: italic; margin: 0; font-weight: normal;';

	const bodyArrs = [
		{
			key: 'payables',
			title: 'Nợ kỳ trước/ Payables',
		},
		{
			key: 'rent',
			title: 'Tiền thuê/ Rent',
			unit: 'Ngày/Date',
			amount: 'roomPrice',
		},
		{
			key: 'electric',
			title: 'Tiền điện/Electric',
			unit: 'Kwh',
			unitPrice: 'electricPricePerKwh',
			previousQuantity: 'previousElectricQuantity',
			currentQuantity: 'currentElectricQuantity',
			amount: 'electricFee',
		},
		{
			key: 'water',
			title: 'Tiền nước/Water',
			unitPrice: 'defaultWaterPrice',
			previousQuantity: 'previousWaterQuantity',
			currentQuantity: 'currentWaterQuantity',
			amount: 'waterFee',
		},
		{
			key: 'other',
			title: 'Khác/Other',
			items: [
				{
					key: 'serivce',
					title: 'Phí dịch vụ/Service fee',
				},
				{
					key: 'internetFee',
					title: 'Internet, Wifi',
				},
				{
					key: 'motobikeFee',
					title: 'Phí giữ xe máy/Bike parking fee ',
					unit: 'Đêm/night',
				},
				{
					key: 'carFee',
					title: 'Phí giữ xe hơi/Car parking fee',
					unit: 'Đêm/Night',
				},
				{
					key: 'cleaningFee',
					title: 'Vệ sinh phòng/Cleaning fee',
				},
				{
					key: 'laundryFee',
					title: 'Chăn ga, giặt đồ/Laundry service',
					unit: 'Kg',
				},
				{
					key: 'drinkWaterFee',
					title: 'Bình nước uống/Water jar',
				},
				{
					key: 'other',
					title: 'Khác/ Other',
				},
			],
		},
	];
	let userInfo = `
		<p contenteditable style="${info_style}">Khách hàng/ <i>Tenant</i>: ${guestName}</p>
		<p contenteditable style="${info_style}">Căn hộ/ <i>Unit</i>: ${roomNo}_T${month}</p>
		<p contenteditable style="${info_style}">Toà nhà/ <i>Building</i>: ${block.name}</p>
		<p contenteditable style="${info_style}">Địa chỉ/ <i>Addess</i>: ${block.address}</p>
	  `;
	let tableData = ``;

	bodyArrs.forEach((item, index) => {
		/*
			index
			unit
			quantity
			price
			amount
		*/
		const items = _.get(item, 'items');
		if (!_.isEmpty(items)) {
			tableData += `<tr>
			<td style ="border: 1px solid black; border-collapse: collapse; text-align: center; padding: 5px;" ${
				items ? `rowspan="${items.length + 1}"` : ''
			}>${index}</td>
			<td style="${item_style} padding: 5px;">${item.title}</td>
			${['center', 'center', 'end', 'end']
				.map(
					value =>
						`<td style="text-align:${value}; border: 1px solid black; border-collapse: collapse; padding: 5px;"/>`
				)
				.join('')}
			</tr>`;

			items.forEach(_item => {
				let unit = _item.unit || '';
				let quantity = '';
				let unitPrice = '';
				let amount = _.get(booking, _item.key);

				if (_.includes(serivceFeeTypes, _item.key)) {
					amount = _.get(serviceFees, `${_item.key}Amount`) || '';
					quantity = _.get(serviceFees, `${_item.key}Quantity`) || '';
					unitPrice = _.get(serviceFees, `${_item.key}UnitPrice`) || '';
				}

				tableData += `<tr>
				<td style="${item_style} padding: 5px;">${_item.title}</td>
				<td style="text-align: center; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${unit}</div></td>
				<td style="text-align: center; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${quantity}</div></td>
				<td style="text-align: end; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${formatPrice(
					{
						price: unitPrice,
					}
				)}</div></td>
				<td style="text-align: end; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${formatPrice(
					{
						price: amount,
						defaultValue: '0',
					}
				)}</div></td>
				</tr>`;
			});
		} else {
			let quantity = 0;
			let unitPrice = 0;
			const previous = _.get(booking, item.previousQuantity) || 0;
			const current = _.get(booking, item.currentQuantity) || 0;
			const unit = item.unit || '';
			const amount = _.get(booking, item.amount) || '';
			const key = _.get(item, 'key') || '';
			let subTitle = '';

			if (key === 'rent') {
				const from = moment(_.get(booking, 'from'));
				const to = moment(_.get(booking, 'to'));
				subTitle = `Từ/From ${from.format('DD/MM/YYYY')} Đến/To: ${to.format('DD/MM/YYYY')}`;
				quantity = to.diff(from, 'days');
				unitPrice = _.round(amount / quantity);
			} else if (key !== 'payables') {
				quantity = current > previous ? current - previous : '';
				unitPrice = _.get(booking, item.unitPrice) || '';
				subTitle = `Số cũ/Previous: ${previous} Số mới/Current: ${current}`;
			}

			tableData += `<tr>
		  <td style="border: 1px solid black; border-collapse: collapse; text-align: center; padding: 5px;" ${
				items ? `rowspan="${items.length + 1}"` : ''
			}>${index}</td>
		  <td style="${item_style} padding: 5px;">${item.title}</br><i>${subTitle}</i></td>
		  <td style="text-align: center; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${unit}</div></td>
		  <td style="text-align: center; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${quantity}</div></td>
		  <td style="text-align: end; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${formatPrice(
				{
					price: unitPrice,
				}
			)}</div></td>
		  <td style="text-align: end; border: 1px solid black; border-collapse: collapse; padding: 5px;"><div style="font-size: small;" contenteditable>${formatPrice(
				{
					price: amount,
					defaultValue: '0',
				}
			)}</div></td>
		</tr>`;
		}
	});

	const amountHtml = `
        <tr>
		  <td style="border: 1px solid black; border-collapse: collapse; text-align: center; padding: 5px;"/>
		  <td style="${amount_style} text-align: start; padding: 5px;">Tổng cộng/ Total (VND)</td>
		  ${[...Array(3)].map(() => '<td style="border: 1px solid black; border-collapse: collapse; padding: 5px;"/>').join('')}
		  <td style="${amount_style} border: 1px solid black; border-collapse: collapse; text-align: center; padding: 5px;"><div contenteditable>${formatPrice(
		{ price: booking.price }
	)}</div></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; border-collapse: collapse; padding: 5px;" rowspan="2"/>
          <td style="border: 1px solid black; border-collapse: collapse; padding: 5px; font-size: 14px;" colspan="5"><i contenteditable>${convertNumber2VietnameseWord(
				booking.price
			)} đồng</i></td>
        </tr>
        <tr>
          <td style="border: 1px solid black; border-collapse: collapse; padding: 5px; font-size: 14px;" colspan="5"><i contenteditable>${_.upperFirst(
				convertNumber2EnglishWord(booking.price)
			)}, VND</i></td>
        </tr> `;

	const dueDate = moment(booking.from).add(4, 'day').format('DD/MM/YYYY');
	const bankInfoHtml = `
		<p contenteditable style="${bank_info_style}">${roomNo}_T${month} Amount: ${formatPrice({ price: booking.price })}</p>
		<p contenteditable style="${bank_info_style}">-> ${bankAccount.shortName}, ${bankAccount.fullName || ''}</p>
		<p contenteditable style="${bank_info_style}">${bankAccount.accountNos[0]} - ${bankAccount.accountName}</p>
		`;

	const html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<title></title>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1">
		</head>
		<body id="invoice" style="width: 90%; padding: 1em 0 1.5em 0; margin: auto">
			<!-- header -->
			<div style="display: flex; flex-direction: row; height: 8em; width: 100%; align-items: center; font-size: small; margin-bottom: 20px">
			<div style="display: flex; flex: 2; font-size: small; justify-content: center; margin-top: 20px">
			<img src="${logoUrl}" width="80" height="80"/>			</div>
			<div style="${right_container_style}">
				<p style="${header_style}" >THÔNG BÁO THANH TOÁN<br/><i>DEBIT NOTE</i></p>
			</div>
			</div>
			<!-- body -->
			<div>
			${userInfo}
			<table style="width: 100%; margin-top: 1em; border: 1px solid black; border-collapse: collapse; text-align: center;">
				<tr>
				<th style="${th_style}">No.</th>
				<th style="${th_style}">Nội dung<p style="${sub_item_title_style}">Item</p></th>
				<th style="${th_style}">ĐVT<p style="${sub_item_title_style}">Unit</p></th>
				<th style="${th_style}">Số lượng<p style="${sub_item_title_style}">Quantity</p></th>
				<th style="${th_style}">Đơn giá<p style="${sub_item_title_style}">Price</p></th>
				<th style="${th_style}">Thành tiền<p style="${sub_item_title_style}">Amount</p></th>
				</tr>
					${tableData}
				<!-- amount -->
				${amountHtml}
			</table>
			</div>
			<!-- footer -->
			<div style="display: flex; margin-top: 1em; margin-bottom: 8em;">
			<div style="flex: 1; margin-left: 1em;">
			<p style="margin: 0px; font-size: small">NGƯỜI LẬP/PREP AIR</p>
			</div>
			<div style="flex: 1; margin-left: 1em;">
				<p style="margin: 0px; font-size: small">BÊN THUÊ/LESSEE</p>
			</div>
			</div>
			<p style="${noti_style}">Vui lòng thanh toán theo nội dung / Contents of transfer to Beneficiary</p>
			<!-- Bank info -->
			<div style="margin: 0.5em 0 0.5em 4em; ">
			${bankInfoHtml}
			</div>
			<p contenteditable style="${noti_style}">Trước ngày/Please payment before ${dueDate}</p>
			<p style="${noti_style}">Ghi chú/Note:<p style="margin: 2px 0px 0px 0px" contenteditable></p></p>
		</body>
		</html>
	`;

	return html;
}

async function uploadInvoice(booking, urls, user) {
	if (booking.isInvoiceExported) throw new ThrowReturn('Invoice was exported');
	await booking.addInvoice(urls, user._id);
}

module.exports = {
	getInvoice,
	sendInvoiceMessage,
	getInvoiceHtml,
	uploadInvoice,
};
