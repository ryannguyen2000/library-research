const moment = require('moment');
const _ = require('lodash');
const { v4: uuid } = require('uuid');
const path = require('path');
const xlsx = require('xlsx');

const { BANK_ACCOUNT } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { getPayoutExportDetail } = require('./payoutGroup');

async function exportMisaPayoutGroup(id, user) {
	const data = await getPayoutExportDetail(id, user);
	if (!data) ThrowReturn('Not found data!');

	const wb = xlsx.utils.book_new();
	const dateFormat = moment(data.createdAt).format('M/D/YYYY');
	const monthFormat = moment(data.createdAt).format('MM/YYYY');
	const bankName = _.get(
		data.revenues.revenues.find(item => item.smsId),
		'smsId.phone'
	);
	const bankAccount =
		bankName &&
		(await models.BankAccount.findOne({
			name: bankName,
			type: BANK_ACCOUNT.PRIVATE,
			groupIds: { $in: user.groupIds },
		}));
	const shortName = bankAccount ? bankAccount.shortName || bankAccount.name : '';

	const wsData = [
		[
			'Hiển thị trên sổ',
			'Ngày hạch toán (*)',
			'Ngày chứng từ (*)',
			'Số chứng từ (*)',
			'Mã đối tượng',
			'Tên đối tượng',
			'Địa chỉ',
			'Nộp vào TK',
			'Mở tại NH',
			'Lý do thu',
			'Diễn giải lý do thu',
			'Nhân viên thu',
			'Loại tiền',
			'Tỷ giá',
			'Diễn giải',
			'TK Nợ (*)',
			'TK Có (*)',
			'Số tiền',
			'Số tiền quy đổi',
			'Đối tượng',
			'Khoản mục CP',
			'Đơn vị',
			'Đối tượng THCP',
			'Công trình',
			'Đơn đặt hàng',
			'Hợp đồng mua',
			'Hợp đồng bán',
			'Mã thống kê',
		],
		...data.revenues.revenues.map((item, index) => {
			const stt = index + 1;
			return [
				'',
				dateFormat,
				dateFormat,
				`${shortName}.${stt < 10 ? `0${stt}` : stt}.${monthFormat}`,
				'',
				'',
				'',
				_.get(bankAccount, ['accountNos', 0], ''),
				_.get(bankAccount, 'fullName', ''),
				'',
				'Khách hàng thanh toán tiền phòng',
				'',
				'',
				'',
				'Khách hàng thanh toán tiền phòng',
				`1121${shortName}`,
				'3388',
				item.currencyAmount.exchangedAmount,
			];
		}),
	];

	const ws = xlsx.utils.aoa_to_sheet(wsData);
	xlsx.utils.book_append_sheet(wb, ws, 'Chứng từ thu tiền');

	const fileName = `Phieu_thu_tien_gui.xls`;
	const TMP_FOLDER = 'tmp';
	const filePath = path.resolve(`${TMP_FOLDER}/${uuid()}`);

	await xlsx.writeFile(wb, filePath, { bookType: 'xls' });

	return { fileName, filePath };
}

module.exports = {
	exportMisaPayoutGroup,
};
