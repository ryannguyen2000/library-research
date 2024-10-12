const _ = require('lodash');
const models = require('@models');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { RateType } = require('@utils/const');

function getTemplate({
	otaBookingId,
	propertyName,
	propertyId,
	city,
	paidType,
	paidBy,
	customerFirstName,
	customerLastName,
	countryOfResidence,
	from,
	to,
	otherGuest,
	roomType,
	roomQuantity,
	occupancy,
	extraBed,
	benefitsIncluced,
	specialRequests,
	supplierNote,
	cancellationPolicy,
	roomPrices,
	extraBedPrices,
	promotion,
	rateChannel,
	websiteLanguage,
	netRate,
	netRateToPropety,
	offerText,
	customerInfo,
	customerEmail,
	instructionHtml,
}) {
	const isPayOnProperty = !!netRateToPropety;
	return `<html xmlns="http://www.w3.org/1999/xhtml">
<head id="Head1">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title id="titleHotelVoucher">Hotel Voucher : Agoda.com</title>
    <style type="text/css">
        html, body
        {
            font-family: Tahoma, Arial, Helvetica, sans-serif;
        }
        p
        {
            margin: 0px;
            padding: 0px;
        }
        ol
        {
            margin: 0px;
        }
        table {
            border: 0px;
        }
        #payment-box
        {
            margin: 10px 0px 0px 0px;
            padding: 10px;
            position: relative;
            -moz-border-radius: 5px;
            -webkit-border-radius: 5px;
            background-color: #1AAC5B;
        }
        .agoda-logo-01 {
            width: 120px;
            padding-left:5px;
            /*height: 39.8px;*/
        }
        .text1
        {
            font-size: 30px;
            text-decoration: none;
            padding-top: 10px;
            text-align: center;
            /*background-image:url(http://cdn0.agoda.net/content/default/documents/images/line1.jpg);
            background-position:right;
            background-repeat:repeat-y;*/
        }
        .text2
        {
            font-size: 20px;
            text-decoration: none;
            padding-top: 10px;
            text-align: center;
        }
        .text3
        {

            padding-top: 0px;
            text-align: center;
        }
        .text4
        {
            font-size: 30px;
            text-decoration: none;
        }
        .text5
        {
            font-size: 22px;
            text-decoration: none;
        }
        .textPrePaid
        {
            width: 209px;
            height: 25px;
            font-family: Helvetica;
            font-size: 24px;
            font-weight: bold;
            line-height: 1.04;
            text-align: right;
            color: #85c150;
        }
        .textToBePaid
        {
            width: 209px;
            height: 50px;
            font-family: Helvetica;
            font-size: 24px;
            font-weight: bold;
            line-height: 1.04;
            text-align: right;
            color: #e44746;
        }

        .Property-Voucher {
            width: 209px;
            height: 13px;
            font-family: Helvetica;
            font-size: 14px;
            font-weight: 300;
            line-height: 1.29;
            text-align: right;
            color: rgba(0, 0, 0, 0.6);
            padding-top: 5px;
        }
        .PaymentCode {
            width: 100px;
            height: 16px;
            font-family: Helvetica;
            font-size: 13px;
            text-align: left;
            color: rgba(0, 0, 0, 0.6);
        }
        .reser-box1
        {
            font-size: 20px;
            text-decoration: none;
            color: #FFFFFF;
            text-align: center;
        }
        .reser-box2
        {
            font-size: 18px;
            text-decoration: none;
            /*color:#FFFFFF;*/
        }
        .reser-box3
        {
            font-size: 14px;
            font-weight: bold;
            text-decoration: none;
            /*color:#FFFFFF;*/
        }
        .resername
        {
            font-size: 16px;
            font-weight: bold;
            text-decoration: none;
            color: #000000;
        }
        .textall
        {
            font-size: 13px;
            text-decoration: none;
            color: #333333;
        }
        .room-type
        {
            padding: 5px;
            font-size: 13px;
            text-decoration: none;
            text-align: left;
        }
        .room-type2
        {
            font-size: 13px;
            font-weight: bold;
            text-decoration: none;
            color: #000000;
            text-align: left;
            padding: 5px;
            background-color:#E2E2E2;
        }
        .special_re
        {
            font-size: 13px;
            text-decoration: none;
            color: #000000;
        }
        .rate-info
        {
            margin-left: 10px;
            font-size: 13px;
            text-decoration: none;
            /*color:#FFFFFF;*/
        }
        .label_normal
        {
            font-family: Tahoma !important;
            font-weight: normal !important;
        }
        .label_strongk
        {
            font-family: Tahoma !important;
            font-weight: bold !important;
        }
        .room1
        {
            font-size: 14px;
            font-weight: bold;
            text-decoration: none;
        }
        .rates2
        {
            font-size: 13px;
            text-decoration: none;
            color: #333333;
            text-align: left;
            /*vertical-align:top;*/
        }
        .rates
        {
            font-size: 13px;
            text-decoration: none;
            color: #9234D2;
            text-align: right;
            /*vertical-align:top;*/
        }
        .payment
        {
            line-height: 25px;
            font-size: 20px;
            font-weight: bold;
            text-decoration: none;
            color: #000000;
        }
        .card-type
        {
            font-size: 13px;
            font-weight: bold;
            text-decoration: none;
            color: #000000;
        }
        .card-type-detail
        {
            font-size: 13px;
            text-decoration: none;
            color: #000000;
        }
        .recommend
        {
            font-size: 13px;
            text-decoration: none;
            color: #F00;
        }
        .text-recommend
        {
            margin: 0px 0px 0px 30px;
            padding: 0px;
            font-size: 13px;
            text-decoration: none;
            color: #333333;
        }
        .text-recommend2
        {
            margin: 5px 0px 0px 10px;
            padding: 0px;
            font-size: 13px;
            text-decoration: none;
            color: #333333;
        }
        .footer
        {
            font-size: 13px;
            text-decoration: none;
            /*color:#FFFFFF;*/
        }
        .card-type1
        {
            font-size: 14px;
            font-weight: bold;
            text-decoration: none;
            color: #000000;
        }
        .card-type-detail1
        {
            font-size: 13px;
            text-decoration: none;
            color: #333333;
        }
        .white-text-link {
            color: #FFFFFF;
            text-decoration: none;
            font-size: 12px;
            padding: 0px 8px 0px 8px;
        }
        .Reservation-informat {
            width: 197px;
            height: 14px;
            font-family: Helvetica;
            font-size: 12px;
            line-height: 1.17;
            text-align: left;
            color: rgba(0, 0, 0, 0.6);
        }
        .BookingLabel {
            width: 152px;
            height: 17px;
            font-family: Helvetica;
            font-size: 14px;
            text-align: left;
            color: rgba(0, 0, 0, 0.6);
        }
        .BookingId {
            width: 198px;
            height: 22px;
            font-family: Helvetica;
            font-size: 18px;
            font-weight: bold;
            text-align: left;
            color: rgba(0, 0, 0, 0.6);
            padding-top: 2px;
        }
        .auto-style1 {
            height: 70px;
        }
        .tableCenter {
            margin: auto;
        }
        .tableLeft {
            margin-right: auto;
        }
        .tableRight {
            margin-left: auto;
        }
        .tdCenter {
            text-align: center;
        }
        .tdLeft {
            text-align: left;
        }
        .tdRight {
            text-align: right;
        }
    </style>
</head>
<body>
    <table width="670" cellpadding="0" cellspacing="0">
        <tr>
            <td>
                <!-- LEVEL 1 -->

                <table class="tableCenter" width="670" cellpadding="0" cellspacing="0">
                    <tr>
                        <!-- AGODA LOGO & IATA -->
                        <td class="tableLeft" width="300" height="95" valign="top">
                            <table cellpadding="0" cellspacing="0" width="90%">
                                <tr>
                                    <td class="tableLeft auto-style1">
                                        <img id="imgAgodaLogo" class="agoda-logo-01" alt="agoda" src=http://img.agoda.net/content/default/documents/images/ebe/agodaLogoFlat.png>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="tableLeft" style="padding-left:10px" >
                                        <strong><span id="ltrPaymentCode" class="PaymentCode">IATA 96-6 3780 0</span></strong>
                                    </td>
                                </tr>
                            </table>
                        </td>

                        <!-- BOOKING ID & RESERVATION INFO -->
                        <td width="198" >
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <!-- Booking ID -->
                                    <td width="270" class="BookingLabel">
                                        <span id="ltrBookingIDTitle_lblMain"><strong>Booking ID</strong></span>
                                            <br />
                                            <span id="ltrBookingIDTitle_lblSub">Mã số đặt phòng</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="BookingId">
                                        <span id="ltrBookingIDValue">${otaBookingId}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <!-- Reservation Information -->
                                    <td width="270" class="Reservation-informat">
                                        <span id="ltrReservationInfoTitle_lblMain"><strong>Reservation Information</strong></span>
                                            <br />
                                            <span id="ltrReservationInfoTitle_lblSub">THÔNG TIN ĐẶT PHÒNG</span>
                                    </td>
                                </tr>
                            </table>
                        </td>

                        <!-- BOOKING PAID TYPE & CONFIRMATION -->
                        <td width="350">
                            <table width="95%" class="tableRight" cellpadding="0" cellspacing="0">
                                <tr id="trNewBooking">
                                    <td width="350" height="25" class="tdRight" >
                                        <span id="ltrBookingPaidType" class=textPrePaid>${paidType}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td height="30" class="tdRight" class="Property-Voucher" >
                                        <span id="ltrHotelVoucher_lblMain">Booking confirmation</span>
                                            <br />
                                            <span id="ltrHotelVoucher_lblSub">Xác nhận đặt phòng</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                <!-- LEVEL 2 -->

                <table width="670" class="tableCenter">
                    <tbody>
                    <tr>
                        <td class="special_re" style="color: #F00">
                        </td>
                    </tr>
                    </tbody>
                </table>

                <!-- LEVEL 3 -->

                <table width="670" class="tableCenter">
                    <tr>
                        <td height="1" colspan="5" style="background-color: #000000"></td>
                    </tr>
                </table>

                <!-- LEVEL 4 -->

                <table width="670" class="tableCenter" cellpadding="0" cellspacing="0" style="margin-top: 7px; margin-bottom: 7px;">
                    <tr>
                        <td height="80" class="tdCenter" valign="top" style="border-right: 3px dotted #999; margin-right: 2px; width: 35%;">
                            <table width="90%" cellpadding="0" cellspacing="0" class="tableLeft" style="margin-left: 10px">
                                <tr>
                                    <td class="tdLeft">
                                        <span class="resername">
                                        <span id="lblHotelNameData_lblMain"><strong>${propertyName}</strong></span>
                                        <br />
                                        (Property ID
                                        <span id="lblHotelID">${propertyId}</span>)
                                        </span>
                                    </td>
                                </tr>

                                <tr>
                                    <td height="25" class="tdLeft textall">
                                        <span id="ltrCityTitle_lblMain" class="special_re"><strong>City</strong></span>
                                            <span id="ltrCityTitle_lblSub">Thành phố
</span>
                                        <span id="lblHotelCityData">: ${city}</span>
                                    </td>
                                </tr>

                                <tr>
                                    <td height="25" class="tdLeft textall">
                                        <span id="lblMarshaCodeHotelLang_lblMain" class="special_re" style="visibility: hidden;"><strong>Marsha Code :</strong></span>
                                        <span id="lblMarshaCodeData" class="black" style="visibility: hidden;"></span>
                                    </td>
                                </tr>
                            </table>
                        </td>

                        <td valign="top">
                            <table width="425" class="tableCenter textall" style="margin-left: 5px;">
                                <tr>
                                    <td width="260" class="tdLeft" valign="top">
                                        <span id="ltrCustomerFirstName_lblMain" class="special_re"><strong>Customer First Name </strong></span>
                                            <span id="ltrCustomerFirstName_lblSub">Tên Khách Hàng </span>
                                    </td>
                                    <td class="tdLeft" valign="top">
                                        <span id="ltrCustomerFirstNameValue">${customerFirstName}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="tdLeft" valign="top">
                                        <span id="ltrCustomerLastName_lblMain" class="special_re"><strong>Customer Last Name </strong></span>
                                            <span id="ltrCustomerLastName_lblSub">Họ Khách Hàng </span>
                                    </td>
                                    <td class="tdLeft" valign="top">
                                        <span id="ltrCustomerLastNameValue">${customerLastName}</span>
                                    </td>
                                </tr>
                                    <tr>
                                        <td class="tdLeft" valign="top">
                                            <span id="ltrCountryOfPassportTitle_lblMain" class="special_re"><strong>Country of Residence </strong></span>
                                                <span id="ltrCountryOfPassportTitle_lblSub">Quốc gia cư trú </span>
                                        </td>
                                        <td class="tdLeft" valign="top">
                                            <span id="lblGuestCountry">${countryOfResidence}</span>
                                        </td>
                                    </tr>
                                <tr id="trCheckIn">
                                    <td class="tdLeft" valign="top">
                                        <span id="ltrArrivalTitle_lblMain" class="special_re"><strong>Check-in</strong></span>
                                            <span id="ltrArrivalTitle_lblSub">Nhận phòng
</span>
                                    </td>
                                    <td class="tdLeft" valign="top">
                                        <span id="lblCustomerArrival">${from}</span>
                                    </td>
                                </tr>
                                <tr id="trCheckOut">
                                    <td class="tdLeft" valign="top">
                                        <span id="ltrDepartureTitle_lblMain" class="special_re"><strong>Check-out</strong></span>
                                            <span id="ltrDepartureTitle_lblSub">Trả phòng
</span>
                                    </td>
                                    <td class="tdLeft" valign="top">
                                        <span id="lblCustomerDeparture">${to}</span>
                                    </td>
                                </tr>


                                <tr id="trOtherGuests">
                                    <td class="tdLeft" valign="top">
                                        <span id="ltrOtherGuestTitle_lblMain" class="special_re"><strong>Other Guests </strong></span>
                                            <span id="ltrOtherGuestTitle_lblSub">Khách Khác </span>
                                    </td>
                                    <td class="tdLeft" valign="top">
                                        <span id="lbOtherGuestsDetail">${otherGuest}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>

                <!-- LEVEL 5 -->

                <table width="670" class="tableCenter" cellpadding="0" cellspacing="0" style="border-color: #000000; border-style: solid; border-width: 3px;">
                    <tr valign="top">
                        <td height="25" class="room-type" width="160px" style="border-bottom: 2px solid #000000;">
                            <span id="ltrRoomTypeTitle_lblMain"><strong>Room Type </strong></span>
                                <br />
                                <span id="ltrRoomTypeTitle_lblSub">Loại Phòng </span>
                        </td>
                        <td class="room-type" style="border-bottom: 2px solid #000000;">
                            <span id="ltrNoOfRoomTitle_lblMain"><strong>No. of Rooms</strong></span>
                                <br />
                                <span id="ltrNoOfRoomTitle_lblSub">Số phòng
</span>
                        </td>
                        <td class="room-type" id="tdOccupancyTitle" runat="server" style="border-bottom: 2px solid #000000;">
                            <span id="ltrOccupancyTitle_lblMain"><strong>Occupancy</strong></span>
                                <br />
                                <span id="ltrOccupancyTitle_lblSub">Số người
</span>
                        </td>
                        <td class="room-type" style="border-bottom: 2px solid #000000;">
                            <span id="ltrNoOfExtraBedTitle_lblMain"><strong>No. of Extra Bed</strong></span>
                                <br />
                                <span id="ltrNoOfExtraBedTitle_lblSub">Số Giường Thêm :</span>
                        </td>
                    </tr>

                    <tr valign="top" style="background-color:#E2E2E2;">
                        <td class="tdLeft room-type2" >
                            <span id="lblRoomTypeData_lblMain">${roomType}</span>
                        </td>

                        <td  class="room-type2">
                            <span id="lblNumberRoomsData_lblMain">${roomQuantity}</span>
                        </td>

                        <td class="room-type2" id="tdOccupancyValue" runat="server">
                            <span id="ltrOccupancyValue">${occupancy}</span>
                        </td>


                        <td class="room-type2">
                            <span id="lblNumberExtrabedsData_lblMain">${extraBed}</span>
                        </td>
                    </tr>
                </table>

                <!-- LEVEL 6 -->

                <table width="670" class="tableCenter" cellpadding="0">
                    <tr><td height="2"></td></tr>
                </table>

                <!-- LEVEL 7 -->

                <table width="670" class="tableCenter" cellpadding="0" cellspacing="0">
                    <tr>
                        <td class="room-type2" style="border: 3px solid #000000; padding: 5px">
                            <span id="lblOfferText">${offerText}</span>
                        </td>
                    </tr>
                </table>

                <!-- LEVEL 7.5 -->
                 <table width="670" class="tableCenter" cellpadding="0">
                    <tr><td height="2"></td></tr>
                </table>

                <table width="670" border="0" class="tableCenter" cellpadding="0" cellspacing="0">
				</table>

                <!-- LEVEL 8 -->
               <table width="670" border="0" align="center" cellpadding="0">
			<tr><td height="2"></td></tr>
		</table>
 
                <table width="670" class="tableCenter">
                    <tr>
                        <td class="tdLeft" style="padding-left: 8px; border-bottom: 3px dotted #999;">
                            <span class='special_re'>
                                <span id="BenefitsLabelId_lblMain"><strong>Benefits Included</strong></span>
                                    <span id="BenefitsLabelId_lblSub">Bao gồm các quyền lợi</span>
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td class="textall" style="padding-bottom: 5px; padding-left: 8px; border-bottom: 3px dotted #999;">
                            <span id="BenefitsListId_lblMain">${benefitsIncluced}</span>
                        </td>
                    </tr>
                        <tr id="trOtherSpecialNeedsHeader">
                            <td class="tdLeft" style="padding-bottom: 5px; padding-left: 8px; border-bottom: 3px dotted #999;">
                                <span class='special_re'>
                                    <span id="ltrSpecialRequestTitle_lblMain"><strong>Special Requests</strong></span>
                                        <span id="ltrSpecialRequestTitle_lblSub">Yêu cầu đặc biệt
</span>
                                </span>
                                <span class="textall">(
                                    <span id="ltrSpecialRequestDescription_lblMain">${specialRequests}</span>
                                    )
                                </span>
                            </td>
                        </tr>
                        <tr id="trOtherSpecialNeeds">
                            <td class="tdLeft textall" style="padding-bottom: 5px; padding-left: 8px; border-bottom: 3px dotted #999;">
                                <span id="lblSupplierNoteData">${supplierNote}</span>
                            </td>
                        </tr>
                    <tr>
                        <td class="tdLeft" style="padding-left: 8px; border-bottom: 3px dotted #999;">
                            <span class='special_re'>
                                <span id="ltrCancellationPolicyTitle_lblMain"><strong>Cancellation Policy</strong></span>
                                    <span id="ltrCancellationPolicyTitle_lblSub">Chính sách hủy phòng
</span>
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td class="textall" style="padding-bottom: 5px; padding-left: 8px; border-bottom: 3px dotted #999;">
                            <span id="lblCancellationPolicyHotelLangData_lblMain">${cancellationPolicy}</br></span>
                        </td>
                    </tr>
                </table>

                <!-- LEVEL 9 -->

                <table width="670" class="tableCenter">
                    <tr>
                        <td class="tdLeft room1">
                            <span style="padding-left: 10px">
                                <span id="ltrRoomTitle_lblMain">Room</span>
                                    <span style="font-weight: normal;" id="ltrRoomTitle_lblSub">Phòng</span>
                            </span>
                        </td>
                        <td class="room1"></td>
                        <td class="tdLeft room1">
                            <span style="padding-left: 10px">
                                <span id="ltrExtraBedTitle_lblMain">Extra Bed</span>
                                    <span style="font-weight: normal;" id="ltrExtraBedTitle_lblSub">Giường phụ
</span>
                            </span>
                        </td>
                        <td class="room1"></td>
                        <td class="tdLeft room1">
                            <span id="ltrOtherTitle_lblMain">Other</span>
                                <span style="font-weight: normal;" id="ltrOtherTitle_lblSub">Khác
</span>
                        </td>
                    </tr>
                    <tr>
                        <td height="1" colspan="5" style="background-color: #000000"></td>
                    </tr>
                    <tr>
                        <td width="35%" valign="top">
                            <table width="100%">
                                <tr>
                                    <td height="25" bgcolor="#E2E2E2" class="tdLeft special_re" style="padding-left: 3px; width: 60%">
                                        <span id="ltrRoomFromToTitle_lblMain"><strong>From - To</strong></span>
                                            <span id="ltrRoomFromToTitle_lblSub">Đến - Đi</span>
                                    </td>
                                    <td align="center" bgcolor="#E2E2E2" class="special_re" style="padding-left: 3px;">
                                        <span id="ltrRoomRateTitle_lblMain"><strong>Rates</strong></span>
                                            <span id="ltrRoomRateTitle_lblSub">Giá phòng
</span>
                                    </td>
                                </tr>
                                ${_.map(
									roomPrices,
									({ title, price, currency }) => `<tr>
                                    <td align="left" class="rates2" style="padding-left: 3px; width: 60%">
                                    ${title}
                                    </td>
                                    <td align="right" style="padding-right: 3px; width: 100px" class="rates">
                                    <span>${currency}</span>
                                    <span>${price}</span>
                                    </td>
                                </tr> `
								).join('')}
                                <!-- TODO: Add Tax on Commission here -->
                            </table>
                        </td>

                        <td style="border-left: 3px dotted #999999;"><div style="width:0px; overflow:hidden;">&nbsp;</div></td>

                        <td width="35%" valign="top">
                            <table width="100%">

                                <tr>
                                    <td height="25" align="left" bgcolor="#E2E2E2" class="special_re" style="padding-left: 3px; width: 60%">
                                        <span id="ltrRoomFromToTitleExtrabed"><strong>From - To</strong></span>
                                            <span id="ltrRoomFromToTitleExtrabed_lblSub">Đến - Đi</span>
                                    </td>
                                    <td align="center" bgcolor="#E2E2E2" class="special_re" style="padding-left: 3px;">
                                        <span id="ltrRoomRateTitleExtrabed"><strong>Rates</strong></span>
                                            <span id="ltrRoomRateTitleExtrabed_lblSub">Giá phòng
</span>
                                    </td>
                                </tr>
                                ${_.map(
									extraBedPrices,
									({ title, price, currency }) => `<tr>
                                    <td align="left" class="rates2" style="padding-left: 3px; width: 60%">
                                    ${title}
                                    </td>
                                    <td align="right" style="padding-right: 3px; width: 100px" class="rates">
                                    <span>${currency}</span>
                                    <span>${price}</span>
                                    </td>
                                </tr> `
								).join('')}
                            </table>
                        </td>

                        <td style="border-left: 3px dotted #999999;"><div style="width:0px; overflow:hidden;">&nbsp;</div></td>

                        <td valign="top">
                            <table width="200" class="tableCenter">

                                    <tr runat="server" id="trPromotionHeader">
                                        <td align="left" valign="top" class="special_re" style="width: 131px">
                                            <span id="ltrPromotionTitle"><strong>Promotion :</strong></span>
                                                <span id="ltrPromotionTitle_lblSub">Khuyến Mãi :</span>
                                        </td>
                                    </tr>

                                    <tr runat="server" id="trPromotion">
                                        <td align="left" valign="top" class="rates2">
                                            <span id="lblYCSPromotionTextData" class="special_re">${promotion}</span>
                                        </td>
                                    </tr>

                                <tr>
                                    <td align="left" valign="top" class="special_re">
                                        <span id="ltrRatePlanTitle"><strong>Rate Channel</strong></span>
                                            <span id="ltrRatePlanTitle_lblSub">Kênh phân phối giá</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="left" valign="top" class="rates2">
                                        <span id="ltrRatePlanValue" class="special_re" style="font-family: Tahoma !important;">${rateChannel}</span>
                                </tr>


                                    <tr id="trWebsiteLanguage" runat="server">
                                        <td align="left" class="special_re">
                                            <span id="lblWebsiteLanguage"><strong>Website Language  </strong></span>
                                                <span id="lblWebsiteLanguage_lblSub">Ngôn ngữ Website</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td align="left" class="rates2" valign="top">
                                            <span id="lblWebsiteLanguageData">${websiteLanguage}</span>
                                        </td>
                                    </tr>

                            </table>
                        </td>

                    </tr>

                </table>

                <!-- LEVEL 10 -->

                <table width="655" align="center" cellpadding="0" cellspacing="0" style="margin-top: 5px; margin-left: 7px; margin-right: 7px; border-color: #000000; border-style: solid; border-width: 3px;" bgcolor="#E2E2E2">
                    <tr>
                        <td bgcolor="#E2E2E2">
                            <table width="655" align="center" style="margin-top: 5px; margin-left: 7.5px; margin-right: 7.5px;">
                                <tr>
                                    <td width="305" style="border-color: #000000; border-style: solid; border-width: 3px; background-color:#FFFFFF;">
                                            <table width="100%" class="tableCenter" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" id="tr_AmountPayable" runat="server">
                                                <tr>
                                                    <td height="101" bgcolor="#FFFFFF">
                                                    <div style="height:100%">
                                                        ${
															isPayOnProperty
																? ''
																: `
                                                        <div style="height:30%; padding-left:10px;" class="rates2">
                                                            <span id="lblAmountPayableText"><strong>Net rate (incl. taxes & fees)</strong></span>
                                                                <br />
                                                                <span id="lblAmountPayableText_lblSub">Giá thực tế (bao gồm thuế & phí)</span>
                                                        </div>
                                                        `
														}
                                                            <div style="height:70%">
                                                                <p class="payment" style="padding-left:25px; padding-top:10px;">
                                                                    <span id="lblAmountPayableData">${netRate}</span>
                                                                </p>
                                                            ${
																netRateToPropety
																	? `
                                                            <div style="padding-bottom:10px; font-size:14px; ">
                                                                <div style="padding-left:25px;margin-top:10px;font-size:14px">
                                                                    <span id="m_5722951566916261023lblToPropertyText">To Property</span>
                                                                    <br>
                                                                    <span id="m_5722951566916261023lblToPropertyText_lblSub">Gởi Quý Khách Sạn</span>
                                                                    <div><span id="m_5722951566916261023lblToPropertyData">${netRateToPropety}</span> </div>
                                                                </div>
                                                            </div>
                                                            `
																	: ''
															}
                                                        </div>
                                                    </td>
                                                </tr>
                                            </table>
                                    </td>
                                    <td width="10"></td>
                                    <td align="right" style="background-color:#ffffff;border-color: #000000; border-style: solid; border-width: 3px;">
                                        <table width="400" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td>
                                                    <!-- Start ### Normal Hotel Voucher--193x115-->
                                                    <table width="100%" bgcolor="#FFFFFF" align="center" cellpadding="0" cellspacing="0" style="border-color: #FFFFFF; background-color: #FFFFFF;">
                                                        <tr>
                                                                <td id="tdImgSignature" runat="server" width="170" height="101" align="center" bgcolor="#FFFFFF">
                                                                    <img id="imgSignature" class="agoda-logo-01" alt="" src=http://img.agoda.net/images/sign/stamp_2020.jpg style="height: 86px; width: auto; ${
																		!isPayOnProperty || 'visibility: hidden'
																	}">
                                                                </td>
                                                            <td align="left" bgcolor="#FFFFFF" class="textall" style="padding-left:5px">
                                                                <span id="ltrBookedAndPayableTitle" class="special_re"><strong>Booked and Payable by </strong></span>
                                                                    <br />
                                                                    <span id="ltrBookedAndPayableTitle_lblSub">Đã đặt và thanh toán bởi</span>
                                                                <br />
                                                                <br />
                                                                <!-- payed by Quantum 83277,21751 -->
                                                                <span id="lblAmountPayableText" class="min_margin" style="font-family:Tahoma !important;">${paidBy}</span>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    <!-- End ### Normal Hotel Voucher-->
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            <table width="655" align="center" cellpadding="0" cellspacing="0" id="tbAmountPayableNote">
                                <tr>
                                    <td align="left" class="rate-info" style="padding-top: 2px;">
                                    </td>
                                </tr>
                            </table>
                            <table id="tr_CardDetail" width="655" border="0" align="center" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="border-color: #000000; border-style: solid; border-width: 3px;">
                                <tbody>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                                <tbody>
                                                    <tr>
                                                        <td width="100" height="35" align="left" bgcolor="#FFFFFF" class="card-type" style="padding-left: 15px;">
                                                            <span id="ltrCardTypeTitle_lblMain" class="special_re">Card Type </span>
                                                                <br />
                                                                <span id="ltrCardTypeTitle_lblSub" style="font-weight: normal;">Loại Thẻ </span>
                                                        </td>
                                                        <td width="120" align="left" bgcolor="#FFFFFF" class="card-type" style="padding-left: 15px;">
                                                            <span id="ltrCardNoTitle_lblMain" class="special_re">Card Number</span>
                                                                <br />
                                                                <span id="ltrCardNoTitle_lblSub" style="font-weight: normal;">Số Thẻ :</span>
                                                        </td>
                                                        <td width="100" align="left" bgcolor="#FFFFFF" class="card-type" style="padding-left: 15px;">
                                                            <span id="ltrCCVTitle_lblMain" class="special_re">CVV-code</span>
                                                                <br />
                                                                <span id="ltrCCVTitle_lblSub" style="font-weight: normal;">CVV :</span>
                                                        </td>
                                                        <td width="100" align="left" bgcolor="#FFFFFF" class="card-type" style="padding-left: 15px;">
                                                            <span id="ltrExpiryTitle_lblMain" class="special_re">Expiry Date</span>
                                                                <br />
                                                                <span id="ltrExpiryTitle_lblSub" style="font-weight: normal;">Ngày hết hạn :</span>
                                                        </td>
                                                        <td align="left" bgcolor="#FFFFFF" class="card-type" style="padding-left: 15px;">
                                                            <span id="ltrCardHolderTitle_lblMain" class="special_re">Card Holder Name</span>
                                                                <br />
                                                                <span id="ltrCardHolderTitle_lblSub" style="font-weight: normal;">Tên Chủ Thẻ</span>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td bgcolor="#FFFFFF">
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                                <tbody>
                                                    <tr class="card-type-detail">
                                                        <td width="100" height="25" align="left" bgcolor="#FFFFFF" style="padding-left: 15px;" class="card-type-detail1">
                                                            <span id="lblCardTypeData">-</span>
                                                        </td>
                                                        <td width="120" align="left" bgcolor="#FFFFFF" style="padding-left: 15px;" class="card-type-detail1">
                                                            <span id="lblCardNoData">-</span>
                                                        </td>
                                                        <td width="100" align="left" bgcolor="#FFFFFF" style="padding-left: 15px;" class="card-type-detail1">
                                                            <span id="lblCVVData">-</span>
                                                        </td>
                                                        <td width="100" align="left" bgcolor="#FFFFFF" style="padding-left: 15px;" class="card-type-detail1">
                                                            <span id="lblEXPData">-</span>
                                                        </td>
                                                        <td align="left" bgcolor="#FFFFFF" style="padding-left: 15px;" class="card-type-detail1">
                                                            <span id="lblPayableNameData">-</span>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <table width="670" border="0" align="center" cellpadding="5" cellspacing="0">${instructionHtml}</table>

                        </td>
                    </tr>
                </table>

                <!-- LEVEL 11 -->

                <table style="width: 670px;" border="0" align="center">
                        <tr id="tr_CustomerInfoHeader">
                            <td height="25" align="left" style="padding-left: 8px; border-bottom: 3px dotted #999;">
                                <span class="special_re">
                                    <span id="ltrCustomerNoteTitle_lblMain"><strong>Customer Notes</strong></span>
                                        <span id="ltrCustomerNoteTitle_lblSub" style="font-weight: normal;">Ghi chú của khách</span>
                                </span>
                            </td>
                        </tr>
                        <tr id="tr_CustomerInfo">
                            <td style="white-space: nowrap; padding-left: 8px; font-family: Tahoma !important;" class="textall">
                                    <span id="lbl_CustomerInfoName_lblSub">${customerInfo}</span>
                            </td>
                        </tr>
                        <tr id="tr_CustomerEmail">
                            <td style="white-space: nowrap; padding-left: 8px; font-family: Tahoma !important;" class="textall">
                                    <span id="lbl_CustomerEmail_lblSub">Email: </span>
                                <a id="lbl_CustomerEmailInfo" href="mailto:-${customerEmail}" style="text-decoration:none;">${customerEmail}</a>
                            </td>
                        </tr>
                </table>

                <!-- LEVEL 12 -->

                <!-- Start ### Normal Hotel Voucher-->
                <table id="tableAttentionNHA" width="670" border="0" align="center" cellpadding="0" cellspacing="0" style="visibility: collapse; margin-top: 5px; margin-bottom: 5px; margin-left: 20px;">
                    <tr>
                        <td align="left" valign="top">
                            <span class="recommend">
                                <strong>
                                        <span id="ltrAttentionHotelTitle_lblSub">NHÂN VIÊN KHÁCH SẠN CHÚ Ý</span>
                                </strong>
                                <br />
                                <div class="text-recommend" style="margin-left: 10px !important">
                            </div>
                                <span class="text-recommend2" style="margin-left: 10px !important">
                                        <span id="ltrAttentionHotelDescriptionTitle_lblSub">Bạn cần phải bảo đảm những điều sau đây khi khách nhận phòng </span>
                                </span>
                            </span>
                            <div class="text-recommend" style="margin-left: 10px !important">
                                    <span id="ltrAttentionHotelValue1_lblSub">- Khách có xác nhận đặt phòng ghi đúng các chi tiết đặt phòng</span>
                            </div>
                            <div class="text-recommend" style="margin-left: 10px !important; font-family: Tahoma !important;">
                            </div>
                            <div class="text-recommend" style="margin-left: 10px !important">
                                <span id="ltrAttentionHotelValue3_lblSub"></span>
                            </div>
                            <div class="text-recommend" style="margin-left: 10px !important">
                                    <span id="ltrAttentionHotelValue4_lblSub">- Khách có giấy tờ hợp lệ có dán ảnh</span>
                            </div>

                        </td>
                    </tr>
                </table>
                <table id="tableAttentionHotel" width="670" border="0" align="center" cellpadding="0" cellspacing="0" style="visibility: visible; margin-top: 5px; margin-bottom: 5px; margin-left: 20px;">
                    <tr>
                        <td align="left" valign="top">
                            <span class="recommend">
                                <strong>
                                        <span id="ltrAttentionHotelTitle_lblSub">NHÂN VIÊN KHÁCH SẠN CHÚ Ý</span>
                                </strong>
                                <br />
                                <div class="text-recommend" style="margin-left: 10px !important">
                            </div>
                                <span class="text-recommend2" style="margin-left: 10px !important">
                                        <span id="ltrAttentionHotelDescriptionTitle_lblSub">Bạn cần phải bảo đảm những điều sau đây khi khách nhận phòng </span>
                                </span>
                            </span>
                            <div class="text-recommend" style="margin-left: 10px !important">
                                    <span id="ltrAttentionHotelValue1_lblSub">- Khách có xác nhận đặt phòng ghi đúng các chi tiết đặt phòng</span>
                            </div>
                            <div class="text-recommend" style="margin-left: 10px !important; font-family: Tahoma !important;">
                            </div>
                            <div class="text-recommend" style="margin-left: 10px !important">
                                <span id="ltrAttentionHotelValue3_lblSub"></span>
                            </div>
                            <div class="text-recommend" style="margin-left: 10px !important">
                                    <span id="ltrAttentionHotelValue4_lblSub">- Khách có giấy tờ hợp lệ có dán ảnh</span>
                            </div>
                        </td>
                    </tr>
                </table>
                <!-- End ### Normal Hotel Voucher-->

                <!-- LEVEL 13 -->

                <table width="670" border="0" align="center" cellpadding="0" cellspacing="0" class="footer">
                    <tr>
                        <td align="left" style="padding-top: 5px; padding-bottom: 5px; border-color: #000000; border-style: solid; border-width: 3px;">
                            <!-- Start ### Normal Hotel Voucher-->
                            <table width="655" border="0" align="center" cellpadding="0" cellspacing="0" class="footer">
                                <tr>
                                    <td align="left">
                                        <span id="lbl_CallCustomerService_lblSub"><span style=""><span id="lbl_CallCustomerService"><strong>Hotline khách sạn Agoda (Vietnam) :</strong> (84) 28 3861 4310 | <strong>Câu hỏi tổng quát:</strong> biz@agoda.com</span></span></span>
                                        <br />
                                        <span id="lbl_hotline_instruction_lblMain"><strong>Hotline instruction: Please have your property ID</strong></span>
                                            <br />
                                            <span id="lbl_hotline_instruction_lblSub">Hướng dẫn Hotline: Vui lòng chuẩn bị Mã số đặt phòng của bạn</span>
                                    </td>
                                </tr>
                            </table>
                            <!-- End ### Normal Hotel Voucher -->
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

async function getVirtualData(bookingId) {
	const booking = await models.Booking.findById(bookingId)
		.populate('blockId', 'OTAProperties info')
		.populate('guestId', 'name country')
		.populate('guestIds', 'name country')
		.populate('listingId', 'name')
		.lean();

	if (!booking) throw new ThrowReturn().status(404);
	const { blockId: block, listingId: listing, guestId: mainGuest, currency } = booking;
	const property = block.OTAProperties.find(prop => prop.otaName === 'agoda') || {};

	const names = _.split(mainGuest.name, ' ');
	const customerFirstName = names[names.length - 1];
	names.pop();
	const customerLastName = names.join(' ');

	const isPayNow = booking.rateType === RateType.PAY_NOW;
	const paidBy = isPayNow
		? 'Agoda Company Pte, Ltd.30 Cecil Street, Prudential Tower #19-08,Singapore 049712'
		: mainGuest.name;

	let otherGuestRoom = `[RmNo.1] ${mainGuest.name}`;
	booking.guestIds.forEach(guest => {
		otherGuestRoom += `, [RmNo.1] ${guest.name}`;
	});

	const roomPrices = booking.rates.map(rate => ({
		currency,
		price: (rate.price - rate.commission).toLocaleString(),
		title: moment(rate.date).format('LL'),
	}));
	if (isPayNow) {
		roomPrices.push(
			...[
				{
					currency,
					price: booking.roomPrice.toLocaleString(),
					title: '<span><strong>Reference sell rate (incl. taxes &amp; fees)</strong></span>',
				},
				{
					currency,
					price: (-booking.otaFee).toLocaleString(),
					title: '<span><strong>Commission</strong></span>',
				},
			]
		);
	}

	const netRate = isPayNow
		? (booking.roomPrice - booking.otaFee).toLocaleString()
		: booking.roomPrice.toLocaleString();

	const netRateToPropety = isPayNow
		? ''
		: `${booking.currency} ${(booking.roomPrice - booking.otaFee).toLocaleString()}`;

	const occupancy = booking.numberAdults + booking.numberChilden;

	const data = {
		otaBookingId: booking.otaBookingId,
		propertyName: _.get(block, 'info.name', ''),
		propertyId: property.propertyId || '',
		city: _.get(block, 'info.city', ''),
		paidType: isPayNow ? 'TRẢ TRƯỚC' : 'KHÁCH HÀNG THANH TOÁN',
		paidBy,
		customerFirstName,
		customerLastName,
		countryOfResidence: mainGuest.country || '',
		from: moment(booking.from).format('LL'),
		to: moment(booking.to).format('LL'),
		otherGuest: otherGuestRoom,
		roomType: _.get(listing, 'name', ''),
		roomQuantity: _.get(booking, 'reservateRooms.length', 0),
		occupancy: `${occupancy} ${occupancy > 1 ? 'Adults' : 'Adult'}`,
		benefitsIncluced: _.get(booking, 'rateDetail.benefits', ''),
		roomPrices,
		websiteLanguage: 'English',
		netRate: `${booking.currency} ${netRate}`,
		netRateToPropety,
		offerText: _.get(booking, 'rateDetail.name', ''),
		extraBed: 0,
		specialRequests: '',
		supplierNote: '',
		cancellationPolicy: '',
		extraBedPrices: '',
		promotion: '',
		rateChannel: '',
		customerInfo: '',
		customerEmail: '',
		instructionHtml: '',
	};
	return data;
}

module.exports = { getTemplate, getVirtualData };
