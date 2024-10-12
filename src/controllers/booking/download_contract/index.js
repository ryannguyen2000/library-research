const PizZip = require('pizzip');
const { countries } = require('country-data');
const _ = require('lodash');
const moment = require('moment');

const fs = require('fs');
const path = require('path');
const Docxtemplater = require('docxtemplater');
const ExcelJS = require('exceljs');
const { convertNumber2VietnameseWord, convertNumber2EnglishWord, formatPriceWithDot } = require('@src/utils/price');
const { formatDateDiffText, isDocx, isXlsx } = require('@src/utils/func');
const { removeAccents } = require('@src/utils/generate');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');

function formatDate(date, format = 'DD/MM/Y') {
	return moment(date).format(format);
}

const { LANGUAGE, ContractType } = require('@utils/const');

async function downloadContract({ booking, id }, res) {
	try {
		await models.Booking.populate(booking, [
			{
				path: 'guestId guestIds',
				select: '-histories',
			},
		]);
		const reservation = await models.Reservation.getReservatedRoomsDetails(booking._id);
		const contract = await models.BookingContract.findOne({ bookingIds: booking._id })
			.select('startDate endDate originPrice price discount contractType deposit histories')
			.populate({
				path: 'bookingIds',
				select: 'price',
			})
			.lean();
		const contractTemplate = await models.BookingContractTemplate.findOne({
			blockIds: { $in: [booking.blockId] },
			_id: id,
		}).select('path sheets contractType name');

		const roomNo = _.get(reservation, '[0].info.roomNo') || '';
		const tenants = _.map([booking.guestId, ...booking.guestIds], (item, i) => {
			return {
				order: i + 1,
				name: item.fullName || '',
				dayOfBirth: item.dayOfBirth ? formatDate(item.dayOfBirth) : '',
				country: _.get(countries, [item.country, 'name']) || '',
				passportNumberTime: item.passportNumberTime ? formatDate(item.passportNumberTime) : '',
				address: item.address || '',
				represent: item.represent || '',
				position: item.position || '',
				taxCode: item.taxCode || '',
				passport: item.passportNumber || _.get(booking.guestIds, '[0].passportNumber') || '',
				phone: item.phone || _.get(booking.guestIds, '[0].phone') || '',
				email: item.email || _.get(booking.guestIds, '[0].email') || '',
				passportNumberAddress:
					item.passportNumberAddress ||
					_.get(booking.guestIds, '[0].passportNumberAddress') ||
					'Cục Cảnh Sát Quản lý Hành Chính về Trật Tự Xã Hội',
				resident: _.upperCase(_.get(booking.guestIds, '[0].fullName')) || '',
			};
		});
		const tenantInfo = _.head(tenants);
		let data = {
			roomNo,
			tenants: contractTemplate.contractType === ContractType.Company ? tenantInfo : tenants,
			createdDate: formatDate(contract.createdAt),
			createdDateFullText: formatDate(contract.createdAt, '[ngày] DD [tháng] MM [năm] YYYY'),
			startDateFullText: contract.startDate
				? formatDate(contract.startDate, '[ngày] DD [tháng] MM [năm] YYYY')
				: '',
			endDateFullText: contract.endDate ? formatDate(contract.endDate, '[ngày] DD [tháng] MM [năm] YYYY') : '',
			startDate: contract.startDate ? formatDate(contract.startDate) : '',
			endDate: contract.endDate ? formatDate(contract.endDate) : '',
			originPrice: contract.originPrice ? formatPriceWithDot(contract.originPrice) : 0,
			price: contract.price ? formatPriceWithDot(contract.price) : 0,
			electricFee: booking.electricFee ? formatPriceWithDot(booking.electricFee) : 0,
			deposit: contract.deposit ? formatPriceWithDot(contract.deposit) : 0,
			discount: contract.discount ? formatPriceWithDot(contract.discount) : 0,
			residents: tenants.length,
			durationVi:
				contract.startDate && contract.endDate ? formatDateDiffText(contract.startDate, contract.endDate) : '',
			durationEn:
				contract.startDate && contract.endDate
					? formatDateDiffText(contract.startDate, contract.endDate, LANGUAGE.EN)
					: '',
			priceTextVi: contract.price ? `${convertNumber2VietnameseWord(contract.price)} đồng` : '  ',
			priceTextEn: contract.price ? `${_.upperFirst(convertNumber2EnglishWord(contract.price).trim())}` : '  ',
			depositTextVi: contract.deposit ? `${convertNumber2VietnameseWord(contract.deposit)} đồng` : '  ',
			depositTextEn: contract.deposit
				? `${_.upperFirst(convertNumber2EnglishWord(contract.deposit).trim())}`
				: '  ',
		};

		if (
			contractTemplate.contractType === ContractType.Extend ||
			contractTemplate.contractType === ContractType.Others
		) {
			const extendHistory = _.findLast(contract.histories, item => {
				return item.action === 'CONTRACT_UPDATE_END_DATE' && moment(item.prevData).isBefore(item.data);
			});
			data = {
				...data,
				...tenantInfo,
				otherTenants: _.drop(tenants).map((item, index) => ({ ...item, order: index + 1 })),
				extendDate: formatDate(),
				createdDate: formatDate(contract.createdAt),
				from: extendHistory ? formatDate(extendHistory.prevData) : formatDate(contract.startDate),
				to: extendHistory ? formatDate(extendHistory.data) : formatDate(contract.endDate),
				originPriceTextVi: contract.originPrice
					? `${convertNumber2VietnameseWord(contract.originPrice)} đồng`
					: '  ',
				originPriceTextEn: contract.originPrice
					? `${_.upperFirst(convertNumber2EnglishWord(contract.originPrice).trim())}`
					: '  ',
				currentElectricQuantity: booking.currentElectricQuantity || '',
				previousElectricQuantity: booking.previousElectricQuantity || '',
				electricQuantity: booking.currentElectricQuantity - booking.previousElectricQuantity,
			};
		}

		const customerName = _.upperCase(removeAccents(_.get(tenants, '[0].name')));
		const contractTmplateName = _.upperCase(removeAccents(contractTemplate.name));
		const fileName = `${roomNo} ${customerName}-${contractTmplateName}`;
		const templatePath = path.resolve(__dirname, `${contractTemplate.path}`);

		if (isDocx(contractTemplate.path)) await downloadDocx({ fileName, templatePath }, data, res);
		if (isXlsx(contractTemplate.path))
			await downloadXlsx(
				{
					fileName,
					templatePath,
					contractTemplate,
					roomNo,
					address: tenants[0].address,
					passport: tenants[0].passport,
					passportNumberTime: tenants[0].passportNumberTime,
					guestName: tenants[0].name,
					originPrice: data.originPrice,
					durationVi: data.durationVi,
					deposit: data.deposit,
					currentElectricQuantity: booking.currentElectricQuantity || '',
					currentWaterQuantity: booking.currentWaterQuantity || '',
					firstPaymentDate: data.startDateFullText,
					firstPaymentAmount: !_.isEmpty(contract.bookingIds)
						? formatPriceWithDot(contract.bookingIds[0].price)
						: '',
				},
				res
			);
	} catch (error) {
		console.log('error', error);
		throw new ThrowReturn('Lỗi !');
	}
}

async function downloadDocx({ templatePath, fileName }, data, res) {
	const templateContent = await fs.promises.readFile(templatePath, 'binary');
	const zip = new PizZip();
	zip.load(templateContent);
	const doc = new Docxtemplater(zip, templateContent);
	doc.setData(data);
	doc.render();
	const output = doc.getZip().generate({ type: 'nodebuffer' });
	res.writeHead(200, [
		['Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
		['Content-Disposition', `attachment; filename=${fileName}.docx`],
	]);
	res.end(Buffer.from(output, 'base64'));
}

async function downloadXlsx(
	{
		contractTemplate,
		roomNo,
		address,
		passport,
		passportNumberTime,
		templatePath,
		fileName,
		originPrice,
		durationVi,
		deposit,
		currentElectricQuantity,
		currentWaterQuantity,
		guestName,
		firstPaymentDate,
		firstPaymentAmount,
	},
	res
) {
	const workbook = new ExcelJS.Workbook();
	workbook.xlsx
		.readFile(templatePath)
		.then(async () => {
			const excelData = [];
			_.forEach(contractTemplate.sheets, item => {
				const worksheet = workbook.getWorksheet(item.sheetName);
				worksheet.eachRow((row, rowNumber) => {
					const rowData = row.values;
					excelData[rowNumber - 1] = rowData;
				});
				item.cells.forEach(cell => {
					cell.value = cell.value.replaceAll('%ROOM_NO%', roomNo);
					cell.value = cell.value.replaceAll('%ORIGIN_PRICE%', originPrice);
					cell.value = cell.value.replaceAll('%DURATION%', durationVi);
					cell.value = cell.value.replaceAll('%DEPOSIT%', deposit);
					cell.value = cell.value.replaceAll('%ADDRESS%', address);
					cell.value = cell.value.replaceAll('%PASSPORT%', passport);
					cell.value = cell.value.replaceAll('%PASSPORT_NUMBER_TIME%', passportNumberTime);
					cell.value = cell.value.replaceAll('%CURRENT_ELECTRICT_QUANTITY%', currentElectricQuantity);
					cell.value = cell.value.replaceAll('%CURRENT_WATER_QUANTITY%', currentWaterQuantity);
					cell.value = cell.value.replaceAll('%GUEST_NAME%', guestName);
					cell.value = cell.value.replaceAll('%FIRST_PAYMENT_DATE%', firstPaymentDate);
					cell.value = cell.value.replaceAll('%FIRST_PAYMENT_AMOUNT%', firstPaymentAmount);
					worksheet.getCell(cell.cell).value = cell.value;
				});
			});
			const output = await workbook.xlsx.writeBuffer();
			res.writeHead(200, [
				['Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
				['Content-Disposition', `attachment; filename=${fileName}.xlsx`],
			]);
			res.end(Buffer.from(output, 'base64'));
		})
		.catch(error => {
			res.end();
			throw new ThrowReturn('Lỗi !', error);
		});
}

module.exports = {
	downloadContract,
};
