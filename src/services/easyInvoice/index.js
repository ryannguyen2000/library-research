/* 
<Invoices>
	<Inv>
		<Invoice>
			<Ikey>Giá trị khóa duy nhất của hóa đơn</Ikey>
			<InvNo>Số hoá đơn, kiểu số nguyên dương (chỉ sử dụng trong hoá đơn chờ ký, xem thêm tại phụ lục V.4)</InvNo>
			<CusCode>Mã khách hàng</CusCode>
			<Buyer>Tên người mua hàng</Buyer>
			<CusName>Tên khách hàng</CusName>
			<Email>Email của khách nhận thông báo phát hành hoá đơn</Email>
			<EmailCC>Danh sách email CC (ngăn cách bởi dấu phẩy) nhận thông báo phát hành hoá đơn</EmailCC>
			<CusAddress>Địa chỉ khách hàng</CusAddress>
			<CusBankName>Tên ngân hàng của khách hàng</CusBankName>
			<CusBankNo>Số tài khoản ngân hàng của khách hàng</CusBankNo>
			<CusPhone>Điện thoại khách hàng</CusPhone>
			<CusTaxCode>Mã số thuế (Bắt buộc với KH Doanh nghiệp)</CusTaxCode>
			<PaymentMethod>Hình thức thanh toán (xem phụ lục V.1)</PaymentMethod>
			<ArisingDate>Ngày phát sinh hóa đơn (mặc định là ngày hiện tại, chuỗiđịnh dạng dd/MM/yyyy) </ArisingDate>
			<ExchangeRate>Tỷ giá chuyển đổi</ExchangeRate>
			<CurrencyUnit>Đơn vị tiền tệ (ví dụ VND, USD) </CurrencyUnit>
			<Extra>Thông tin bổ sung (định dạng json có các thuộc tính theo quy ước riêng nếu có phát sinh) </Extra>
			<Products>
				<Product>
					<Code>Mã sản phẩm</Code>
					<No>Số thứ tự</No>
					<Feature>Loại sản phẩm(xem phụ lục V.11)</Feature>
					<ProdName>Tên sản phẩm (xem thêm tại phụ lục V.5) </ProdName>
					<ProdUnit>Đơn vị tính</ProdUnit>
					<ProdQuantity>Số lượng</ProdQuantity>
					<ProdPrice>Đơn giá</ProdPrice>
					<Discount>Tỉ lệ chiết khấu</Discount>
					<DiscountAmount>Tổng tiền chiết khấu</DiscountAmount>
					<Total>Tổng tiền trước thuế</Total>
					<VATRate>Thuế suất (xem phụ lục V.3) </VATRate>
					<VATRateOther>Thuế suất trong trường hợp thuế khác (Khi VATRate = -3)</VATRateOther>
					<VATAmount>Tiền thuế</VATAmount>
					<Amount>Tổng tiền sau thuế</Amount>
					<Extra>
						Thông tin bổ sung (định dạng json có các thuộc tính theo quy ước riêng nếu có phát sinh)
					</Extra>
				</Product>
			</Products>
			<Total>Tổng tiền trước thuế</Total>
			<VATRate>Thuế GTGT (xem phụ lục V.3)</VATRate>
			<VATRateOther>Thuế suất trong trường hợp thuế khác (Khi VATRate = -3)</VATRateOther>
			<VATAmount>Tiền thuế GTGT</VATAmount>
			<Amount>Tổng tiền</Amount>
			<GrossValue>Tổng tiền trước thuế thuế KCT</GrossValue>
			<GrossValue0>Tổng tiền trước thuế thuế 0%</GrossValue0>
			<GrossValue5>Tổng tiền trước thuế thuế 5%</GrossValue5>
			<GrossValue10>Tổng tiền trước thuế thuế 10%</GrossValue10>
			<GrossValueNDeclared>Tổng tiền trước thuế thuế KKKN</GrossValueNDeclared>
			<GrossValueContractor>Tổng tiền trước thuế thuế Khác</GrossValueContractor>
			<VatAmount0>Tổng tiền thuế thuế 0%</VatAmount0>
			<VatAmount5>Tổng tiền thuế thuế 5%</VatAmount5>
			<VatAmount10>Tổng tiền thuế thuế 10%</VatAmount10>
			<VatAmountNDeclared>Tổng tiền thuế thuế KKKN</VatAmountNDeclared>
			<VatAmountContractor>Tổng tiền thuế thuế Khác</VatAmountContractor>
			<Amount0>Tổng tiền sau thuế thuế 0%</Amount0>
			<Amount5>Tổng tiền sau thuế thuế 5%</Amount5>
			<Amount10>Tổng tiền sau thuế thuế 10%</Amount10>
			<AmountNDeclared>Tổng tiền sau thuế thuế KKKN</AmountNDeclared>
			<AmountOther>Tổng tiền sau thuế thuế Khác</AmountOther>
			<GrossValue8>Tổng tiền trước thuế 8%</GrossValue8>
			<VatAmount8>Tổng tiền thuế 8%</VatAmount8>
			<Amount8>Tổng tiền sau thuế 8%</Amount8>
			<AmountInWords>Số tiền viết bằng chữ</AmountInWords>
		</Invoice>
	</Inv>
</Invoices>
*/

const moment = require('moment');
// const _ = require('lodash');
const { customAlphabet } = require('nanoid');

const { md5 } = require('@utils/crypto');
const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const { convertNumber2VietnameseWord } = require('@utils/price');

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 32);

function generateHeaders({ method = 'POST', username, password }) {
	const nonce = nanoid();
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = Buffer.from(md5(`${method}${timestamp}${nonce}`), 'hex').toString('base64');

	return {
		Authentication: `${signature}:${nonce}:${timestamp}:${username}:${password}`,
		'Content-Type': 'application/json',
	};
}

async function publishInvoices({ config, items }) {
	const invoicesXml = items
		.map(item => {
			// const invNo = `${moment().format('YYMMDD')}${index + 1}`;
			const invNo = '';

			const paymentMethod = 'Tiền mặt/Chuyển khoản';
			const date = moment().format('DD/MM/YYYY');
			const currency = 'VND';

			const productXml = item.products
				.map((product, i) => {
					return ` 
				<Product>
					<Code>${product.code}</Code>
					<No>${i + 1}</No>
					<Feature>${1}</Feature>
					<ProdName>${product.name}</ProdName>
					<ProdUnit>${product.unit}</ProdUnit>
					<ProdQuantity>${product.quantity}</ProdQuantity>
					<ProdPrice>${product.unitPrice}</ProdPrice>
					<Discount>${0}</Discount>
					<DiscountAmount>${0}</DiscountAmount>
					<Total>${product.priceBeforeTax}</Total>
					<VATRate>${product.vatRate}</VATRate>
					<VATRateOther></VATRateOther>
					<VATAmount>${product.vatAmount}</VATAmount>
					<Amount>${product.price}</Amount>
					<Extra></Extra>
				</Product>`.trim();
				})
				.join('\n');

			return `
			<Inv>
				<Invoice>
					<Ikey>${item.iKey}</Ikey>
					<InvNo>${invNo}</InvNo>
					<CusCode>${item.customerCode}</CusCode>
					<Buyer></Buyer>
					<CusName>${item.company}</CusName>
					<Email>${item.email}</Email>
					<EmailCC>${config.others.emailCC || ''}</EmailCC>
					<CusAddress>${item.address}</CusAddress>
					<CusBankName></CusBankName>
					<CusBankNo></CusBankNo>
					<CusPhone>${item.phone}</CusPhone>
					<CusTaxCode>${item.taxNumber}</CusTaxCode>
					<PaymentMethod>${paymentMethod}</PaymentMethod>
					<ArisingDate>${date}</ArisingDate>
					<ExchangeRate>${1}</ExchangeRate>
					<CurrencyUnit>${currency}</CurrencyUnit>
					<Extra></Extra>
					<Products>
						${productXml}       
					</Products>
					<Total>${item.totalPriceBeforeTax}</Total>
					<VATRate>${item.vatRate}</VATRate>
					<VATRateOther></VATRateOther>
					<VATAmount>${item.totalVatAmount}</VATAmount>
					<Amount>${item.totalPrice}</Amount>
					<GrossValue></GrossValue>
					<GrossValue0></GrossValue0>
					<GrossValue5></GrossValue5>
					<GrossValue10></GrossValue10>
					<GrossValueNDeclared></GrossValueNDeclared>
					<GrossValueContractor></GrossValueContractor>
					<VatAmount0></VatAmount0>
					<VatAmount5></VatAmount5>
					<VatAmount10></VatAmount10>
					<VatAmountNDeclared></VatAmountNDeclared>
					<VatAmountContractor></VatAmountContractor>
					<Amount0></Amount0>
					<Amount5></Amount5>
					<Amount10></Amount10>
					<AmountNDeclared></AmountNDeclared>
					<AmountOther></AmountOther>
					<GrossValue8>${item.totalPriceBeforeTax}</GrossValue8>
					<VatAmount8>${item.totalVatAmount}</VatAmount8>
					<Amount8>${item.totalPrice}</Amount8>
					<AmountInWords>${convertNumber2VietnameseWord(item.totalPrice).replace(/,/g, '')} đồng.</AmountInWords>
				</Invoice>
			</Inv>
        `.trim();
		})
		.join('\n');

	const xml = `
		<Invoices>
			${invoicesXml}
		</Invoices>
    `.trim();

	const uri = `${config.others.url}/api/publish/importAndIssueInvoice`;

	const headers = generateHeaders({
		username: config.username,
		password: config.password,
	});
	const body = JSON.stringify({
		XmlData: xml,
		Pattern: config.others.gtgt,
		Serial: '',
	});

	const res = await fetch(uri, {
		method: 'POST',
		headers,
		body,
	});

	const json = await res.json();

	if (json.Status !== 2) {
		logger.error('publishInvoices', body, JSON.stringify(json, '', 4));
		return Promise.reject(json.Message);
	}

	return json.Data.Invoices;
}

async function deleteInvoice({ config, iKey }) {
	const uri = `${config.others.url}/api/business/cancelInvoice`;

	const headers = generateHeaders({
		username: config.username,
		password: config.password,
	});
	const body = JSON.stringify({
		Ikey: iKey,
		Pattern: config.others.gtgt,
		Serial: '',
	});

	const res = await fetch(uri, {
		method: 'POST',
		headers,
		body,
	});

	const json = await res.json();

	if (json.Status !== 2) {
		logger.error('deleteInvoice', body, JSON.stringify(json, '', 4));
		return Promise.reject(json.Message);
	}

	return json;
}

module.exports = {
	publishInvoices,
	deleteInvoice,
};
