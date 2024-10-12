const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { RateType, Services, BookingStatus } = require('@utils/const');

const LOGO_PATH = `${__dirname}/../publish/logo`;
const LANGS = {
	noice: {
		en: `NOTICE: The following notice is for hotel partners only. All other vendors (including Activity Service Providers) please disregard.<br><b>HOTEL RESERVATION CONFIRMATIONS: Please provide booking confirmation code.</b><br>Enter confirmation code at `,
		vi: `THÔNG BÁO: Thông báo dưới đây chỉ dành cho đối tác khách sạn. Mọi nhà cung cấp khác (bao gồm nhà cung cấp dịch vụ hoạt động) vui lòng bỏ qua thông báo này.<br><b>XÁC NHẬN ĐẶT PHÒNG KHÁCH SẠN: Vui lòng cung cấp mã nhận đặt phòng.</b><br>Enter Nhập mã xác nhận tại `,
	},
	policy: {
		en: '<strong>For suppliers in US only: </strong> Unless properly and timely modified by the hotel as provided in Expedia Partner Central, the total transaction amounts including, the room rate, taxes charged, and other fees or charges enumerated here will serve as the official tax invoice for both the hotel and Expedia for the identified bookings. This official tax invoice will supersede any other tax invoices issued by hotel to Expedia. Expedia may present this communication to taxing authorities as the official tax invoice and documentation of the amount of taxes charged by hotel to Expedia with respect to the identified bookings should taxing authorities request such documentation in the course of an audit examination or other inquiry.',
		vi: '<strong>Chỉ dành cho nhà cung cấp ở Mỹ:</strong> Trừ khi khách sạn chỉnh sửa chính xác và đúng theo lịch như thông tin tại Expedia Partner Central, tổng giá trị giao dịch bao gồm giá phòng, thuế và mọi loại phí hoặc phụ phí khác được liệt kê tại đây sẽ được dùng để xuất hóa đơn thuế chính thức cho cả khách sạn và Expedia trên đặt phòng cho các đặt phòng tương ứng. Hóa đơn thuế chính thức này thay thế mọi hóa đơn thuế khác khách sạn gửi đến Expedia. Expedia có thể sẽ cung cấp thông tin liên lạc này với các cơ quan thuế vụ có chức năng liên quan ở dạng hóa đơn thuế chính thức cùng hồ sơ về khoản thuế do khách sạn thu từ Expedia trên đặt phòng tương ứng, nếu cơ quan thế vụ yêu cầu các chứng từ này nhằm phục vụ việc kiểm toán thuế hoặc các vấn đề liên quan khác.',
	},
	policyTitle: {
		en: 'DO NOT DISCLOSE CONTRACTED RATES TO GUESTS',
		vi: 'KHÔNG TIẾT LỘ GIÁ CHO KHÁCH',
	},
};

function getLang(text) {
	return ['Đặt phòng mới', 'Hủy'].includes(text) ? 'vi' : 'en';
}

function getTemplate({ header, propertyName, address, contentHTML, confirmHTML, footerHTML }) {
	const lang = getLang(header);
	return `
<html>
	<head>
		<META http-equiv="Content-Type" content="text/html; charset=utf-8">
		<TITLE>${header}</TITLE>
		<STYLE>
			A {
				color: #006699;
			}
			A.visited {
				color: #006699;
			}
			td {
				font-size: 13px;
				font-family: Arial, Helvetica, Sans Serif;
				color: #222;
			}
			.pageHeading {
				font-size: 16px;
				font-family: Arial;
				font-weight: bold;
				line-height: 30px
			}
			.pageNotificationType {
				font-size: 20px;
				font-family: Arial;
				font-weight: bold;
				line-height: 30px;
				color: #FF9933;
			}
			.pageFooter {
				font-size: 13px;
				font-family: Arial
			}
			.pageHeadingCancelChange {
				font-size: 15px;
				font-family: Arial, Helvetica, Sans Serif;
			}
			.fontPaymentHotelCollect {
				font-size: 18px;
				font-family: Arial;
				font-weight: bold;
				line-height: 30px;
				color: #FF9933;
			}
			.fontPaymentExpediaCollect {
				font-size: 18px;
				font-family: Arial;
				font-weight: bold;
				line-height: 30px;
				color: #FFFFFF;
			}
			.fontRateAttribute {
				font-size: 12px;
				font-family: Arial;
				font-weight: bold;
				line-height: 30px;
				color: #FF9933;
			}
			.fontPageFooterNew {
				font-size: small;
				font-family: Arial;
				width: 25%
			}
			.fontPageFooter {
				font-size: 8px;
				font-family: Arial, Helvetica, Sans Serif;
			}
			.visibleFor72hrs {
				font-size: 10px;
				font-family: Arial, Helvetica, sans-serif;
				font-weight: bold;
				color: #666666;
			}
			.fontFooter2 {
				font-size: 11px;
				color: #666666;
			}
			.noFaxText {
				font-size: 11px;
				letter-spacing: -0.5px;
				font-weight: 100;
			}
			.noFaxText b {
				font-weight: 100;
			}
			;
		</STYLE>
	</head>

	<body LEFTMARGIN="0" TOPMARGIN="0">
		<font face="arial" size="-1"> ${LANGS.noice[lang]}<a
				href="https://link.expedia.com/c/7/eyJhaSI6NDc2ODk4ODcsImUiOiJhZG1pbkBjb3pydW0uY29tIiwicmkiOm51bGwsInJxIjoiMDItdDIzMTQ5LTk4YWE2ZDA4N2M1YzRlOGM5MDNiNmM5ZTE1MDU1NWIxIiwicGgiOm51bGwsIm0iOmZhbHNlLCJ1aSI6IjAiLCJ1biI6IiIsInUiOiJodHRwOi8vd3d3LmV4cGVkaWFwYXJ0bmVyY2VudHJhbC5jb20ifQ/988T2uA_OCPq-A5vjzqj5w">www.expediapartnercentral.com
				<a> <br><br>
					<BASEFONT FACE="Arial, Helvetica, Sans Serif">
					<table cellpadding="0" cellspacing="0" width="700">
						<tr>
							<td style="width:30%" class="pageNotificationType">${header}</td>
							<td colspan="2"></td>
						</tr>
						<tr>
							<td rowspan="4" ALIGN="left">
								<img src="${LOGO_PATH}/expedia_logo.png" height="40px" width="150px"/> 
							</td>
							<td CLASS="pageHeading">${propertyName}</td>
							<td rowspan="4" ALIGN="right">
								<img src="${LOGO_PATH}/expedia_group_logo.png"/> 
							</td>
						</tr>
						<tr>
							<td>${address}</td>
						</tr>
					</table>
					<br>
					<table cellpadding="0" cellspacing="0" width="700">
						<tr>
							<td colspan="3">
								<table width="700">${contentHTML}</table>
								<table width="700">
									<tr>
										<td>
											<hr>
										</td>
									</tr>
									<tr>
									</tr>
								</table>
								<table width="700">
									<tr>
										<td align="CENTER" style="color:#FF9933;font-weight:bold;">
											${LANGS.policyTitle[lang]}</td>
									</tr>
									<tr>
										<td style="font-size:11px;">${LANGS.policy[lang]}</td>
									</tr>
									<tr>
										${confirmHTML}
									</tr>
									<tr>
										<td>
											<hr>
										</td>
									</tr>
								</table>
								<table width="700">${footerHTML}</table>
								<img src="https://link.expedia.com/o/4/eyJhaSI6NDc2ODk4ODcsImUiOiJhZG1pbkBjb3pydW0uY29tIiwicmkiOm51bGwsInJxIjoiMDItdDIzMTQ5LTk4YWE2ZDA4N2M1YzRlOGM5MDNiNmM5ZTE1MDU1NWIxIiwicGgiOm51bGx9/f2gPQlzJgZkB1uVHVytfng"
									width="1" height="1" />
	</body>
</html>`;
}

function getVirtualContentHtml({
	from,
	to,
	numberAdults,
	numberChilden,
	guest,
	roomType,
	bookedOn,
	serviceType,
	payType,
	roomPrice,
	netRate,
	currency,
	cancelledBy,
	cancelledOn,
}) {
	const nights = moment(to).diff(from, 'days');
	const pricingModel = {
		[Services.Hour]: 'Per hour pricing',
		[Services.Day]: 'Per day pricing',
		[Services.Month]: 'Per month pricing',
	};
	return `
		<tbody>
			<tr>
				<td colspan="3">
					<table cellpadding="10" cellspacing="0" width="700" style="border-radius: 5em; background-color:
						#003366; color: #003366;">
						<tbody>
							<tr>
								<td class="fontPaymentExpediaCollect" colspan="3" align="center">${payType}
								</td>
							</tr>
						</tbody>
					</table>
				</td>
			</tr>
			<tr>
				<td style="height:5px"></td>
			</tr>
			<tr>
				<td style="height:5px"></td>
			</tr>
			<tr>
				<td style="width:30%"><b>Reservation ID: </b><a>14982468</a>
				</td>
				<td style="width:30%"><b>Guest: </b>${guest.fullName}</td>
				<td style="width:40%" align="right">Booked on: ${bookedOn}</td>
			</tr>
			<tr>
				<td style="width:30%"></td>
				<td style="width:30%">${guest.phone || ''}</td>
			</tr>
			<tr>
				<td style="width:30%"></td>
				<td style="width:30%"></td>
			</tr>
			<tr>
				<td colspan="3"><b>Guest Email: </b>${guest.email || ''}</td>
			</tr>
			<tr>
				<td style="height:11px"></td>
			</tr>
			<tr>
				<td colspan="3">Room Type Code: ${roomType}</td>
			</tr>
			<tr>
				<td colspan="3">
					<table cellpadding="0" cellspacing="0">
						<tbody>
							<tr>
								<td>Room Type Name: </td>
								<td style="width:4px"></td>
								<td>${roomType}</td>
							</tr>
						</tbody>
					</table>
				</td>
			</tr>
			<tr>
				<td colspan="3">Pricing Model: ${pricingModel[serviceType]}</td>
			</tr>
			<tr>
				<td colspan="3">Payment Instructions: Expedia collects payment from traveler: Hotel invoices Expedia.
				</td>
			</tr>
			${
				cancelledOn
					? `
						<tr> <td align="right" colspan="3"><b>Cancelled on: ${cancelledOn}</b></td> </tr>
						<tr> <td align="right" colspan="3"><b>Cancelled by: ${cancelledBy}</b></td> </tr>
						`
					: ''
			}
			<tr>
				<td style="height:11px"></td>
			</tr>
			<tr>
				<td colspan="3">
					<table cellpadding="0" cellspacing="0" width="700">
						<tbody>
							<tr valign="bottom">
								<td>Check-In</td>
								<td>Check-Out</td>
								<td>Adults</td>
								<td>Kid/Ages</td>
								<td>Room Nights</td>
								<td>Hotel Conf</td>
							</tr>
							<tr valign="top">
								<td>${moment(from).format('LL')}</td>
								<td>${moment(to).format('LL')}</td>
								<td>${numberAdults || 0}</td>
								<td>${numberChilden || 0}</td>
								<td>${nights}</td>
								<td></td>
							</tr>
						</tbody>
					</table>
				</td>
			</tr>
			<tr>
				<td style="height:11px"></td>
			</tr>
			<tr>
				<td style="height:11px"></td>
			</tr>
			<tr>
				<td colspan="5">
					<table cellpadding="0" cellspacing="0" width="100%">
						<tbody>
							<tr valign="top">
								<td>
								
								</td>
								<td align="right">
									<table cellspacing="0" cellpadding="0" width="50%">
										<tbody>
											<tr>
												<td style="height:11px"></td>
											</tr>
											<tr>
												<td align="right">Extra Person: </td>
												<td align="right">0 ${currency}</td>
											</tr>
											<tr>
												<td align="right">Taxes: </td>
												<td align="right">0 ${currency}</td>
											</tr>
											<tr>
												<td align="right">Fee: </td>
												<td align="right">0 ${currency}</td>
											</tr>
											<tr>
												<td align="right"><b>Total Booking Amount </b></td>
												<td align="right"><b>${roomPrice} ${currency}</b></td>
											</tr>
											<tr>
												<td align="right"><b>Amount to Charge Expedia Group: </b></td>
												<td align="right"><b>${netRate} ${currency}</b></td>
											</tr>
											<tr>
												<td align="right">Amount Paid Includes: </td>
												<td align="right">Base rate</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
				</td>
			</tr>
		</tbody>,
	`;
}

function getVirtualFooterHtml() {
	return `
		<tbody>
			<tr>
				<td align="center" class="fontFooter2"><a>Contact us</a></td>
				<td align="center" class="fontFooter2">Phone: 12011158</td>
				<td align="center" class="fontFooter2">Fax: 1 (702)6426228</td>
			</tr>
			<tr>
				<td class="fontFooter2">Report Date: ${moment().format('DD-MM-YYYY hh:m')}</td>
				<td class="fontFooter2">Hotel Code: Not Applicable</td>
				<td class="fontFooter2">Chain Code: Not Applicable</td>
				<td class="fontFooter2">Brand Code: Not Applicable</td>
			</tr>
		</tbody>
	`;
}

async function getVirtualData(bookingId) {
	const booking = await models.Booking.findById(bookingId)
		.populate('blockId', 'OTAProperties info')
		.populate('guestId', 'fullName country mail phone')
		.populate('listingId', 'name')
		.lean();
	if (!booking) throw new ThrowReturn().status(404);

	const isPayNow = booking.rateType === RateType.PAY_NOW;

	const payType = isPayNow ? 'Prepaid' : 'Pay at property';
	const {
		blockId: block,
		guestId: guest,
		listingId: listing,
		reservateRooms,
		from,
		to,
		createdAt,
		numberAdults,
		numberChilden,
		serviceType,
		currency,
		roomPrice,
		otaFee,
		status,
		canceledBy,
		canceledAt,
	} = booking;

	const isBookingCancelled = status === BookingStatus.CANCELED;
	const contentHTML = getVirtualContentHtml({
		from,
		to,
		numberAdults,
		numberChilden,
		guest,
		roomsQuantity: reservateRooms.length,
		roomType: _.get(listing, 'name', ''),
		bookedOn: moment(createdAt).format('DD-MM-YYYY hh:mm'),
		serviceType,
		payType,
		currency,
		roomPrice: roomPrice.toLocaleString(),
		netRate: (roomPrice - otaFee).toLocaleString(),
		...(isBookingCancelled
			? {
					cancelledOn: moment(canceledAt).format('LLL'),
					cancelledBy: canceledBy.type === 'OTA' ? 'Expedia' : 'Traveler',
			  }
			: {}),
	});
	const footerHTML = getVirtualFooterHtml();

	const header = isBookingCancelled ? 'CANCELLATION' : 'NEW RESERVATION';
	return {
		header,
		propertyName: _.get(block, 'info.name', ''),
		address: _.get(block, 'info.city', ''),
		contentHTML,
		confirmHTML: '',
		footerHTML,
	};
}

module.exports = { getTemplate, getVirtualData };
