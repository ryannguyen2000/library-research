const _ = require('lodash');
const moment = require('moment');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { RateType, BookingStatus } = require('@utils/const');

const tdStyle =
	'-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; mso-table-lspace: 0; mso-table-rspace: 0;';

function getTemplate({
	otaBookingId,
	status,
	propertyName,
	propertyId,
	city,
	paidType,
	customerFirstName,
	customerLastName,
	roomType,
	occupancy,
	extraBed,
	offerText,
	coupon,
	specialRequests,
	cancellationPolicy,
	cancellationDetails,
	roomPrices,
	promotion,
	rateChannel,
	paymentHTMLs,
	infoHTMLs,
	warningHtml,
}) {
	return `<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Booking Reservation</title>
	<style type="text/css">
		/*Outlook.com / Hotmail*/
		.ExternalClass {
			width: 100%;
		}
		.ExternalClass,
		.ExternalClass p,
		.ExternalClass span,
		.ExternalClass font,
		.ExternalClass td,
		.ExternalClass div {
			line-height: 100%;
		}
		/*Outlook 2007 / 2010 / 2013*/
		#outlook a {
			padding: 0;
		}
		/*Yahoo*/
		.yshortcuts {
			color: #434343
		}
		/* Body text color */
		.yshortcuts a span {
			color: #0d7fcc
		}
		/* Link text color */
	</style>
</head>

<body
	style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; background-color: #ebedef; height: 100% !important; margin: 0; padding: 0; width: 100% !important">
	<table border="0" cellpadding="0" cellspacing="0" width="100%"
		style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; background-color: #ebedef; border-collapse: collapse !important; border-spacing: 0; height: 100% !important; margin: 0; mso-table-lspace: 0; mso-table-rspace: 0; padding: 0; width: 100% !important">
		<tbody>
			<tr>
				<td align="center" valign="top"
					style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; height: 100% !important; margin: 0; mso-table-lspace: 0; mso-table-rspace: 0; padding: 0; width: 100% !important">
					<table border="0" cellpadding="0" cellspacing="0"
						style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; max-width: 600px; mso-table-lspace: 0; mso-table-rspace: 0">
						<tbody>
							<tr>
								<td align="center" valign="top"
									style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; mso-table-lspace: 0; mso-table-rspace: 0">
									<div style="display: block; height: 24px; width: 100%">
										&nbsp;
									</div>
									<table border="0" cellpadding="0" cellspacing="0" width="100%"
										style="-ms-text-size-adjust: 100%; -webkit-box-shadow: 0 1px 3px 0 rgba(27, 27, 27, 0.1); -webkit-text-size-adjust: 100%; background-color: #fff; border-collapse: collapse !important; border-radius: 4px; border-spacing: 0; box-shadow: 0 1px 3px 0 rgba(27, 27, 27, 0.1); mso-table-lspace: 0; mso-table-rspace: 0; overflow: hidden">
										<tbody>
											<tr>
												<td
													style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; mso-table-lspace: 0; mso-table-rspace: 0">
													<table border="0" cellpadding="0" cellspacing="0" width="100%"
														style="${tdStyle} table-layout: fixed">
														<tbody>
															<tr>
																<td valign="middle" width="50%"
																	style="${tdStyle} padding: 24px 24px 16px; position: relative; z-index: 10">
																	<img src="https://d1gnmtcb0vp69g.cloudfront.net/imageResource/2019/01/16/1547626251655-034b0fe3e83ac9a17f7161999a39529a.png?tr=q-75"
																		alt="Traveloka TERA" width="220"
																		style="-ms-interpolation-mode: bicubic; width: 100%;max-width: 200px;">
																</td>
																<td valign="middle" width="50%"
																	style="${tdStyle} padding: 24px 24px 16px; position: relative; z-index: 10; text-align: right;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 500; line-height: 24px; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;color: #03121A; margin-bottom: 0; margin-top: 0;">
																		${status}</p>
																	<div style="vertical-align:middle;">
																		<img src="https://d1gnmtcb0vp69g.cloudfront.net/imageResource/2023/05/02/1682999489393-3a10a3d4cbde63e8256aeecf1fd5527f.png?tr=q-75"
																			alt="Trả trước" width="24"
																			style="-ms-interpolation-mode: bicubic; vertical-align: middle;">
																		<span
																			style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; line-height: 20px;-webkit-text-size-adjust: 100%;vertical-align: middle;padding: 2px 8px;background: #0BC175;border-radius: 99px;color: #FFF;">${paidType}</span>
																	</div>
																</td>
															</tr>
														</tbody>
													</table>
												</td>
											</tr>
											<tr>
												<td
													style="${tdStyle} padding: 0 24px;">
													<hr style="border: .5px solid #F2F3F3;margin: 0;">
													<div style="display: block; height: 16px; width: 100%">
														&nbsp;
													</div>
												</td>
											</tr>
											<tr>
												<td
													style="${tdStyle} padding: 0 24px;">
													<table border="0" cellpadding="0" cellspacing="0" width="100%"
														style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; height: 100% !important; margin: 0; mso-table-lspace: 0; mso-table-rspace: 0; padding: 0; width: 100% !important;border: 1px solid #CDD0D1;">
														<tbody>
															<tr style="background-color:#F7F9FA">
																<td width="33%" valign="top" colspan="2"
																	style="${tdStyle}padding: 12px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 400; line-height: 20px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${propertyName} (${propertyId})</p>
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${city}</p>
																</td>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 12px 16px;text-align: right;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; line-height: 20px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #0194F3;margin: 0;">
																		Itinerary ID</p>
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; line-height: 20px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #0194F3;margin: 0;">
																		${otaBookingId}</p>
																</td>
															</tr>
															<tr>
																<td width="33%" valign="top" colspan="3"
																	style="${tdStyle}">
																	<hr style="border: .5px solid #CDD0D1;margin: 0;">
																</td>
															</tr>
															<tr>
																<td width="33%" valign="top" colspan="3"
																	style="${tdStyle}padding: 12px 16px;">
																	<div
																		style="display: inline-block;margin-right: 48px;">
																		<p
																			style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																			Customer First Name</p>
																		<p
																			style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 500; line-height: 24px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #0194F3;margin: 0;">
																			${customerFirstName}</p>
																	</div>
																	<div style="display: inline-block;">
																		<p
																			style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																			Customer Last Name</p>
																		<p
																			style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 500; line-height: 24px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #0194F3;margin: 0;">
																			${customerLastName}</p>
																	</div>
																</td>
															</tr>

															${_.map(
																infoHTMLs,
																content => `<tr>${content}</tr>
															`
															).join('')}

														</tbody>
													</table>
													<div style="display: block; height: 16px; width: 100%">
														&nbsp;
													</div>
													<table border="0" cellpadding="0" cellspacing="0" width="100%"
														style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; height: 100% !important; margin: 0; mso-table-lspace: 0; mso-table-rspace: 0; padding: 0; width: 100% !important;border: 1px solid #CDD0D1;">
														<tbody>
															<tr>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 16px 16px;border-right: 1px solid #CDD0D1;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		Room Information</p>
																	<div
																		style="display: block; height: 24px; width: 100%">
																		&nbsp;
																	</div>
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${roomType}</p>
																</td>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 16px 16px;border-right: 1px solid #CDD0D1;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		Guest Information</p>
																	<div
																		style="display: block; height: 24px; width: 100%">
																		&nbsp;
																	</div>
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${occupancy} </p>
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${offerText} </p>
																</td>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 16px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		Extra Bed Information</p>
																	<div
																		style="display: block; height: 24px; width: 100%">
																		&nbsp;
																	</div>
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${extraBed}</p>
																</td>
															</tr>
															<tr>
																<td width="33%" colspan="3"
																	style="${tdStyle}">
																	<hr style="border: .5px solid #CDD0D1;margin: 0;">
																</td>
															</tr>
															<!-- EXTRA BENEFIT -->
															<!-- END EXTRA BENEFIT -->
															<!-- PRIORITY BENEFIT -->
															<!-- END PRIORITY BENEFIT -->
															<tr>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 8px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		Special Request</p>
																</td>
																<td width="33%" valign="top" colspan="2"
																	style="${tdStyle}padding: 8px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${specialRequests}</p>
																</td>
															</tr>
															<tr>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 8px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		Cancellation policy (based on your hotel
																		check-in time)</p>
																</td>
																<td width="33%" valign="top" colspan="2"
																	style="${tdStyle}padding: 8px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${cancellationPolicy}</p>
																</td>
															</tr>

															<tr style='visibility: ${_.upperCase(status) === 'CANCELLATION' ? 'visible' : 'hidden'}'>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 8px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		Cancellation Detail</p>
																</td>
																<td width="33%" valign="top" colspan="2"
																	style="${tdStyle}padding: 8px 16px;">
																	<ul style="padding-left: 16px;margin: 0;">
																		${_.map(
																			cancellationDetails,
																			value =>
																				`<li
																			style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 500; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #E7090E;margin: 0;">
																			${value}</li>`
																		).join('')}
																	</ul>
																</td>
															</tr>

														</tbody>
													</table>
													<div style="display: block; height: 16px; width: 100%">
														&nbsp;
													</div>
													<table border="0" cellpadding="0" cellspacing="0" width="100%"
														style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; height: 100% !important; margin: 0; mso-table-lspace: 0; mso-table-rspace: 0; padding: 0; width: 100% !important;border: 1px solid #CDD0D1;">
														<tbody>
															<tr>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 16px 16px;border-right: 1px solid #CDD0D1;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0; margin-bottom: 4px;">
																		Promotion</p>
																	<p
																		style="font-family: MuseoSans-700, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 700; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0; margin-bottom: 4px;">
																		${promotion} </p>
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 400; line-height: 12px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">
																		This promo applies to room rates on the specific
																		date(s).</p>
																</td>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 16px 16px;border-right: 1px solid #CDD0D1;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0; margin-bottom: 4px;">
																		Rate Plan</p>
																	<p
																		style="font-family: MuseoSans-700, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 700; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0; margin-bottom: 4px;">
																		${rateChannel}</p>
																</td>
																<td width="33%" valign="top"
																	style="${tdStyle}padding: 16px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0; margin-bottom: 4px;">
																		Coupon</p>
																	<p
																		style="font-family: MuseoSans-700, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 700; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${coupon}</p>
																</td>
															</tr>
														</tbody>
													</table>
													<div style="display: block; height: 16px; width: 100%">
														&nbsp;
													</div>
													<table border="0" cellpadding="0" cellspacing="0" width="100%"
														style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; height: 100% !important; margin: 0; mso-table-lspace: 0; mso-table-rspace: 0; padding: 0; width: 100% !important;border: 1px solid #CDD0D1;">
														<tbody>
															<tr style="background-color:#F7F9FA">
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px 12px 16px;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 500; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		Date</p>
																</td>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 500; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		Room Rates</p>
																</td>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 500; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		Extra Bed Rates</p>
																</td>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 500; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		Surcharge Rates</p>
																</td>
																<td width="25%" valign="top"
																	style="${tdStyle}padding: 12px 16px 12px 4px;">
																	<p
																		style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 500; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		Subtotal</p>
																</td>
															</tr>
															<tr>
																<td width="33%" colspan="5"
																	style="${tdStyle}">
																	<hr style="border: .5px solid #CDD0D1;margin: 0;">
																</td>
															</tr>
															${_.map(
																roomPrices,
																({
																	title,
																	subTitle,
																	price,
																	extraBed: extraBedPrice,
																	fee,
																	amount,
																}) => `<tr>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px 12px 16px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${title}</p> <span
																		style="font-family: MuseoSans-300, 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 300; line-height: 12px;-webkit-text-size-adjust: 100%;vertical-align: middle;padding: 2px 4px;background: #F2F3F3;border-radius: 99px;color: #687176;">${subTitle}</span>
																</td>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${price} </p>
																</td>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${extraBedPrice} </p>
																</td>
																<td width="18.75%" valign="top"
																	style="${tdStyle}padding: 12px 4px;">
																	<p
																		style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${fee} </p>
																</td>
																<td width="25%" valign="top"
																	style="${tdStyle}padding: 12px 16px 12px 4px;">
																	<p
																		style="font-family: MuseoSans-600, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 600; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">
																		${amount}</p>
																</td>
															</tr> `
															).join('')}
															${_.map(paymentHTMLs, td => `<tr>${td}</tr>`).join('')}
														</tbody>
													</table>
													<!-- MALAYSIA TOURISM TAX -->
													<!-- END OF MALAYSIA TOURISM TAX -->
													<div style="display: block; height: 24px; width: 100%">
														&nbsp;
													</div>
													${
														warningHtml
															? `
													<div style="background-color:#fffad9;padding:12px 16px">${warningHtml}</div>
													<div style="display: block; height: 24px; width: 100%">
														&nbsp;
													</div>
													`
															: ''
													}
												</td>
											</tr>
										</tbody>
									</table>
									<div style="display: block; height: 24px; width: 100%">
										&nbsp;
									</div>
									<table border="0" cellpadding="0" cellspacing="0" width="100%" class="template-help"
										style="-ms-text-size-adjust: 100%; -webkit-box-shadow: 0 1px 3px 0 rgba(27, 27, 27, 0.1); -webkit-text-size-adjust: 100%; background-color: #fff; border-collapse: collapse !important; border-radius: 4px 4px 4px 4px; box-shadow: 0 1px 3px 0 rgba(27, 27, 27, 0.1); mso-table-lspace: 0; mso-table-rspace: 0; overflow: hidden">
										<tbody>
											<tr>
												<td valign="top" class="body-content p-b-0"
													style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; color: #03121A; font-family: sans-serif; font-size: 14px; font-weight: normal; line-height: 150%; mso-table-lspace: 0; mso-table-rspace: 0; padding: 16px 24px; text-align: left">
													<h3 class="h3"
														style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif;font-size:16px;font-weight:700;line-height:20px;-webkit-text-size-adjust: 100%;margin:0;margin-bottom:12px;color:inherit;text-align:center;width: 100%;">
														Have any questions?</h3>
													<p class="h5"
														style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif;font-size:12px;font-weight:400;line-height:16px;-webkit-text-size-adjust: 100%;margin:0;margin-bottom:4px;text-align:center;color:#03121A;">
														For hotel-related questions & queries, kindly contact our Hotel
														Support Team: </p>
													<div style="text-align: center;">
														<img src="https://d1gnmtcb0vp69g.cloudfront.net/imageResource/2023/05/02/1683001545665-fb6c8559aa60e7f746bf0c6bbbe04246.png?tr=q-75"
															width="32"
															style="-ms-interpolation-mode: bicubic; vertical-align: middle;">
														<a href="mailto:hotelops-vn@traveloka.com"
															style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #0194F3;">hotelops-vn@traveloka.com</a>
														<img src="https://d1gnmtcb0vp69g.cloudfront.net/imageResource/2023/05/02/1683001553044-c8666c1098e69a87c2fe32c3e97ea6f4.png?tr=q-75"
															width="32"
															style="-ms-interpolation-mode: bicubic; vertical-align: middle;">
														<a href="tel:+84-28-7302-3737"
															style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;text-decoration: none;">+84-28-7302-3737</a>
													</div>
													<hr style="border: .5px solid #CDD0D1;margin: 12px 0;">
													<p
														style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle;text-align: center;  padding: 0; margin: 12px 0 0">
														If the guests need to contact Traveloka, kindly reach our
														Customer Service:<a
															style="color: #0194F3;text-decoration: none;"
															href="mailto:cs@traveloka.com"> cs@traveloka.com</a> or <a
															style="color: #03121A;text-decoration: none;"
															href="tel:1900-6978">1900-6978</a></p>
												</td>
											</tr>
										</tbody>
									</table>
									<div style="display: block; height: 24px; width: 100%">
										&nbsp;
									</div>
									<table border="0" cellpadding="0" cellspacing="0" width="100%"
										style="-ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; border-collapse: collapse !important; border-spacing: 0; mso-table-lspace: 0; mso-table-rspace: 0">
										<tbody>
											<tr>
												<td valign="top"
													style="${tdStyle} padding-left: 20px; padding-right: 20px; text-align: center">
													<span
														style=" font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;color: #727272;">©2023
														Traveloka. All Rights Reserved.</span>
												</td>
											</tr>
										</tbody>
									</table>
									<div style="display: block; height: 24px; width: 100%">
										&nbsp;
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</td>
			</tr>
		</tbody>
	</table>
	<img style="display:block;font-size:0px;line-height:0em;"
		src="https://messaging-callback-api.msg.traveloka.com/o?id=1776762710060447590" alt="" width="1" height="1"
		border="0">
</body> </html>`;
}

function getVirutalInfoHtml({ from, to, guestName, phone }) {
	const data = [
		{ title: 'Check-in', value: from },
		{ title: 'Check-out', value: to },
		{ title: 'Booked by', value: guestName || '' },
		{ title: 'Contact no', value: phone || '' },
	];
	return data.map(
		({ title, value }) =>
			`<td width="33%" valign="top" style="${tdStyle}padding: 8px 16px;">
		<p style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #687176;margin: 0;">${title}</p>
	</td>                  
	<td width="33%" valign="top" colspan="2" style="${tdStyle}padding: 8px 16px;">
		<p style="font-family: MuseoSans-700, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 700; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">${value}</p>
	</td>`
	);
}
function getVirtualPaymentHtml({ paidBy, netRate }) {
	return [
		`<td width="33%" colspan="5" style="${tdStyle}"> <hr style="border: .5px solid #CDD0D1;margin: 0;"> </td>`,

		`<td width="18.75%" colspan="2" rowspan="3" valign="middle" style="${tdStyle}padding: 12px 4px 12px 16px;border-right: 1px solid #CDD0D1;">
			<p style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 500; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">Booked and Payable by</p>
			<div style="display: block; height: 16px; width: 100%">&nbsp;</div> 
			<p style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 500; line-height: 24px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #00875a;margin: 0;">${paidBy}</p>
		</td>
		<td width="18.75%" colspan="2" valign="top" style="${tdStyle}padding: 12px 4px;border-bottom: 1px solid #CDD0D1;">
			<p style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 400; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">Subtotal Rates</p>
		</td>
		<td width="25%" valign="top" style="${tdStyle}padding: 12px 16px 12px 4px;border-bottom: 1px solid #CDD0D1;">
			<p style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 500; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">${netRate}</p> 
		</td>`,

		`<td width="18.75%" colspan="2" valign="top" style="${tdStyle}padding: 12px 4px;border-bottom: 1px solid #CDD0D1;">
			<p style="font-family: MuseoSans-400, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 400; line-height: 15px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">Promotion and Rounding Adjustment</p>
		</td>
		<td width="25%" valign="top" style="${tdStyle}padding: 12px 16px 12px 4px;border-bottom: 1px solid #CDD0D1;">
			<p style="font-family: MuseoSans-500, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 500; line-height: 16px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #03121A;margin: 0;">VND 0</p> 
		</td>`,

		`<td width="18.75%" colspan="2" valign="top" style="${tdStyle}padding: 12px 4px;">
			<p style="font-family: MuseoSans-700, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; line-height: 20px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #00875a;margin: 0;">Total Amount</p>
		</td><td width="25%" valign="top" style="${tdStyle}padding: 12px 16px 12px 4px;">
			<p style="font-family: MuseoSans-700, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; line-height: 20px;-webkit-text-size-adjust: 100%;vertical-align: middle; color: #00875a;margin: 0;">${netRate}</p>
		</td>`,
	];
}

async function getVirtualData(bookingId) {
	const booking = await models.Booking.findById(bookingId)
		.populate('blockId', 'OTAProperties info')
		.populate('guestId', 'name country phone')
		.populate('guestIds', 'name country')
		.populate('listingId', 'name OTAs')
		.lean();
	if (!booking) throw new ThrowReturn().status(404);
	const { blockId: block, listingId: listing, guestId: mainGuest, from, to, currency, reservateRooms } = booking;
	const property = block.OTAProperties.find(prop => prop.otaName === 'traveloka') || {};

	const names = _.split(mainGuest.name, ' ');
	const customerFirstName = names[names.length - 1];
	names.pop();
	const customerLastName = names.join(' ');

	const occupancy = booking.numberAdults + booking.numberChilden;

	const isPayNow = booking.rateType === RateType.PAY_NOW;
	const paidBy = isPayNow ? 'Traveloka' : mainGuest.name;
	const paidType = isPayNow ? 'Prepaid' : 'Pay upon Check-in';
	const status = booking.status === BookingStatus.CANCELED ? 'CANCELLATION' : booking.status.toUpperCase();
	return {
		otaBookingId: booking.otaBookingId,
		status,
		propertyName: _.get(block, 'info.name', ''),
		propertyId: property.propertyId || '',
		city: `City: ${_.get(block, 'info.city', '')}`,
		paidType,
		customerFirstName,
		customerLastName,
		roomType: `(${reservateRooms.length}x) ${_.get(listing, 'name', '')}`,
		occupancy,
		coupon: '—',
		specialRequests: '-',
		cancellationPolicy: '-',
		roomPrices: [],
		paymentHTMLs: getVirtualPaymentHtml({ paidBy, netRate: `${currency} ${booking.roomPrice.toLocaleString()}` }),
		infoHTMLs: getVirutalInfoHtml({
			from: moment(from).format('LL'),
			to: moment(to).format('LL'),
			guestName: mainGuest.name,
			phone: mainGuest.phone || '',
		}),
		extraBed: 0,
		offerText: '',
		cancellationDetails: booking.canceledBy ? [_.get(booking, 'canceledBy.reason', '')] : undefined,
		promotion: '',
		rateChannel: _.get(booking, 'rateDetail.name', ''),
	};
}

module.exports = { getTemplate, getVirtualData };
