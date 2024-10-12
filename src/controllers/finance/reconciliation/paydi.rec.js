const moment = require('moment');
const _ = require('lodash');
const fs = require('fs');
const ExcelJS = require('exceljs');

const { PayoutType, PayoutStates } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const { getUploadFolder } = require('@controllers/resource/upload');

async function cloneReportFiles(fileData, rowData, report) {
	const lastRow = 4;

	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(fileData);

	const worksheet = workbook.getWorksheet();

	worksheet.eachRow((row, rowNum) => {
		row.eachCell((cell, col) => {
			if (rowNum === lastRow) {
				cell.value = rowData[col - 1];
			} else if (rowNum > lastRow) {
				cell.value = '';
			}

			if (_.has(cell._value, 'model.value.richText')) {
				_.forEach(cell._value.model.value.richText, rt => {
					if (rt.font) {
						rt.font.italic = false;
						rt.font.strike = false;
						rt.font.bold = false;
					}
				});
			}

			_.set(cell.style.font, 'strike', false);
			_.set(cell.style.font, 'italic', false);
			if (rowNum !== 3) {
				_.set(cell.style.font, 'bold', false);
			}
		});
	});

	const { fullPath, url } = await getUploadFolder({
		rootFolder: 'finance',
		fileName: `${report.source}_${_.get(report.blockIds, '[0].info.shortName[0]') || report.description}.xlsx`,
	});

	await workbook.xlsx.writeFile(fullPath);

	return [url];
}

async function recocileFile({ source, paymentCollector, resource, replaceConfirmationFile }) {
	const filePath = resource.getRelativePath();
	const fileData = await fs.promises.readFile(filePath);

	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(fileData);

	const worksheet = workbook.getWorksheet();
	const rowData = [];
	let startRow = 4;

	while (true) {
		const row = worksheet.getRow(startRow);
		const currentRowData = [];
		row.eachCell(cell => {
			currentRowData.push(cell.value);
		});

		if (!currentRowData[12]) break;

		rowData.push(currentRowData);
		startRow++;
	}

	const indexDate = 8;
	const indexAmount = 9;
	const indexFullAmount = 7;
	const maxDateData = _.maxBy(rowData, indexDate);
	const totalAmount = _.sumBy(rowData, indexAmount);
	const data = rowData.map(r => ({
		date: moment(r[1], 'DD/MM/YYYY').startOf('day').toDate(),
		amount: r[indexFullAmount],
	}));

	const date = maxDateData[indexDate];

	const transactions = await models.BankTransaction.findTransactonsFromCollector({
		collector: paymentCollector,
		startTime: moment(date).startOf('day').toDate(),
		amount: totalAmount,
	});

	// if (!transactions.length) {
	// 	logger.warn('not found transaction', source);
	// 	return { done: false };
	// }

	const reports = [];
	const { roundedValue } = paymentCollector;

	await data.asyncForEach(async (item, i) => {
		const report = await models.PayoutExport.findOne({
			payoutType: PayoutType.RESERVATION,
			state: { $ne: PayoutStates.DELETED },
			createdAt: {
				$gte: item.date,
			},
			// source,
			'currencyAmount.VND': roundedValue
				? {
						$gte: item.amount - roundedValue,
						$lte: item.amount + roundedValue,
				  }
				: roundedValue,
		}).populate('blockIds', 'info.shortName');

		if (!report) {
			logger.warn('not found report', source, item, rowData[i]);
			return;
		}

		if (!report.confirmationAttachments.includes(resource.url)) {
			report.confirmationAttachments.push(resource.url);
		}

		if (replaceConfirmationFile || !report.attachments.length) {
			const files = await cloneReportFiles(fileData, rowData[i], report);
			if (files && files.length) {
				report.attachments = files;
			}
		}

		if (!report.confirmedDate && transactions.length) {
			const { transactionIds } = transactions[0];
			report.transactionIds.push(...transactionIds);

			await report.confirm();
		} else {
			await report.save();
		}

		reports.push(report);
	});

	return {
		done: reports.length === data.length,
		...transactions[0],
		reports,
	};
}

module.exports = {
	recocileFile,
};
