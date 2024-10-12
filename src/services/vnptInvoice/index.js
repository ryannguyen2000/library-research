// const moment = require('moment');
const _ = require('lodash');
const soap = require('soap');

const { convertNumber2VietnameseWord } = require('@utils/price');
const { logger } = require('@utils/logger');
const { ERROR_CODES } = require('./const');

async function publishInvoices({ config, items }) {
	const invoicesXml = items
		.map(item => {
			const paymentMethod = 'TM/CK';
			// const date = moment().format('DD/MM/YYYY');
			const currency = 'VND';

			const productsXml = item.products
				.map((product, i) => {
					return ` 
						<HHDVu>
							<TChat>1</TChat>
							<STT>${i + 1}</STT>
							<MHHDVu>${product.code}</MHHDVu>
							<THHDVu>${product.name}</THHDVu>
							<DVTinh>${product.unit}</DVTinh>
							<SLuong>${product.quantity}</SLuong>
							<DGia>${product.unitPrice}</DGia>
							<TLCKhau/>
							<STCKhau/>
							<ThTien>${product.priceBeforeTax}</ThTien>
							<TSuat>${product.vatRate}</TSuat>
							<TThue>${product.vatAmount}</TThue>
							<TSThue>${product.price}</TSThue>	
						</HHDVu>`.trim();
				})
				.join('\n');

			return `
				<HDon>
					<key>${item.iKey}</key>
					<DLHDon>
						<TTChung>
							<NLap/>
							<DVTTe>${currency}</DVTTe>
							<TGia/>
							<HTTToan>${paymentMethod}</HTTToan>
						</TTChung>
						<NDHDon>
							<NMua>
								<Ten>${item.company || item.customerName}</Ten>
								<MST>${item.taxNumber}</MST>
								<SDThoai/>
								<CCCDan/>
								<DCTDTu>${item.email}</DCTDTu>
								<DChi>${item.address}</DChi>
							</NMua>
							<DSHHDVu>
								${productsXml}
							</DSHHDVu>
							<TToan>
								<THTTLTSuat>
									<LTSuat>
										<TSuat>${item.vatRate}</TSuat>
										<TThue>${item.totalVatAmount}</TThue>
										<ThTien>${item.totalPriceBeforeTax}</ThTien>
									</LTSuat>
								</THTTLTSuat>
								<TgTCThue>${item.totalPriceBeforeTax}</TgTCThue>
								<TgTThue>${item.totalVatAmount}</TgTThue>
								<TTCKTMai/>
								<TgTTTBSo>${item.totalPrice}</TgTTTBSo>
								<TgTTTBChu>${convertNumber2VietnameseWord(item.totalPrice).replace(/,/g, '')} đồng.</TgTTTBChu>
							</TToan>
						</NDHDon>
					</DLHDon>
				</HDon>`.trim();
		})
		.join('\n');

	const xml = `
		<![CDATA[
			<DSHDon>
				${invoicesXml}
			</DSHDon>
		]]>`.trim();

	const args = {
		Account: config.others.Account,
		ACpass: config.others.ACpass,
		xmlInvData: xml,
		username: config.username,
		password: config.password,
		pattern: config.others.pattern,
		serial: config.others.serial,
		convert: '0',
	};

	const url = `${config.others.url}/PublishService.asmx?wsdl`;

	const client = await soap.createClientAsync(url);
	const result = await client.ImportAndPublishInvMTTAsync(args);

	const parseRes = _.get(result, [0, 'ImportAndPublishInvMTTResult']);

	if (parseRes.startsWith('ERR')) {
		logger.error('vnptInvoice publishInvoices', args, result);
		return Promise.reject(`${parseRes} ${ERROR_CODES[parseRes] || ''}`);
	}

	const parsedResult = parseRes.replace(`OK:${config.others.pattern};${config.others.serial}-`, '');

	return parsedResult.split(',').map(txt => {
		// VNPT1279_9_M1-24-43836-00600000009
		const [Ikey, No, MCCQT] = txt.split('_');

		return {
			Ikey,
			No,
			MCCQT,
		};
	});
}

module.exports = {
	publishInvoices,
};
