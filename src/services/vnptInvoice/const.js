const ERROR_CODES = {
	'ERR:1': 'Tài khoản đăng nhập sai hoặc không có quyền thêm mới hóa đơn',
	'ERR:2': 'Pattern hoặc serial truyền vào rỗng',
	'ERR:3': 'Dữ liệu xml đầu vào không đúng quy định',
	'ERR:4': 'Không lấy được thông tin công ty (currentCompany null)',
	'ERR:6': 'Không đủ số lượng hóa đơn cho lô thêm mới',
	'ERR:7': 'User name không phù hợp, không tìm thấy user.',
	'ERR:11': 'Pattern hoặc serial không đúng định dạng',
	'ERR:13': 'Danh sách hóa đơn tồn tại hóa đơn trùng Fkey',
	'ERR:15':
		'Ngày lập truyền vào lớn hơn ngày hiện tại hoặc XML không đúng định dạng (hóa đơn ngoại tệ không truyền tỷ giá)',
	'ERR:20':
		'Pattern và serial không phù hợp, hoặc không tồn tại hóa đơn đã đăng ký có sử dụng Pattern và Serial truyền vào',
	'ERR:5': 'Không phát hành được hóa đơn',
	'ERR:10': 'Lô có số hóa đơn vượt quá max cho phép',
	'ERR:21': 'Trùng số hóa đơn',
	'ERR:22': 'Thông tin người bán vượt maxlength',
	'ERR:23': 'Mã CQT rỗng',
	'ERR:30': 'Danh sách hóa đơn tồn tại ngày hóa đơn nhỏ hơn ngày hóa đơn đã phát hành',
};

module.exports = {
	ERROR_CODES,
};
