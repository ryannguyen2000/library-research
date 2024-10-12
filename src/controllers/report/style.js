const INTRO_PAGE_STYLE = `.logo{height:100px;}.h-100{height:100% !important;}.intro-page{background:#fff;height:calc(100% - 40px);justify-content:center;display:flex;flex-direction:column;align-items:center;z-index:40;}.report-name{font-size:45px;margin:40px 0px;}.title{color:#00597b;}.date{font-size:38px;}.category-item{font-size:40px;margin:40px 0px;break-inside:avoid;align-items:center;}.devider{height:30px;width:8px;background:#00597b;margin:0 20px;}`;

const GLOBAL_STYLE = `.d-flex{display:flex!important;}.text-bold{font-weight:bold;}.table-wrapper{width:100%;font-family:'Roboto',sans-serif;font-style:normal;}.page{position:relative;font-family:'Roboto',sans-serif;font-style:normal;page-break-after:always;page-break-inside:avoid;}.break-page{page-break-before:always;page-break-inside:avoid;}.header{position:fixed;top:10px;left:12px;width:98%;display:flex;align-items:center;height:30px;background:#fff;z-index:10;font-family:'Roboto',sans-serif;font-style:normal;}.header-space{height:35px;z-index:10;}.footer{position:fixed;bottom:10px;display:grid;grid-template-columns:30% 45% 20% 5%;width:98%;font-size:10px;height:30px;margin-right:30px;z-index:10;font-family:'Roboto',sans-serif;font-style:normal;}.footer-space{height:35px;}.footer-item{color:#fff;display:flex;align-items:center;padding:0 18px;}.text-primary{color:#004e75;}.category-name{position:absolute;top:-30px;right:10px;color:#000;font-weight:bold;z-index:20;}`;

const PERFORMANCE_STYLE = `
	.chart-wrapper {
		gap: 30px 0px;
		height: 650px;
	}
	.table-performance {
		height: 280px;
		width: 500px;
	}
	.chart-title {
		font-size: 13px;
		color: #00000080;
		height: 30px;
		margin-bottom: 10px;
		padding: 0px 10px;
	}
	.revenue-chart-value {
		color: #5aae66;
		font-weight: bold;
	}
	.flex-wrap {
		flex-wrap: wrap;
	}
	.justify-between {
		justify-content: space-between;
	}
`;

const TABLE_REPORT_STYLE = `.table-report{width:100%;font-size:10px;border-spacing:0px!important;border-top:1px solid #f0f0f0;font-family:'Roboto',sans-serif;font-style:normal;}.table-report-header:first-child{border-left:1px solid #f0f0f0!important;}.table-report-row{height:25px!important;}.table-report-cell{padding:2px 4px!important;border-bottom:1px solid #f0f0f0;border-right:1px solid #f0f0f0;}.table-report-cell:first-child{border-left:1px solid #f0f0f0;}.table-category-name{margin:20px 1px 2px 1px;font-size:16px;background:#004e75;color:#fff;font-weight:bold;padding:4px 5px;height:30px;line-height:30px;}.table-report-name{margin-top:1px;margin-left:1px;margin-right:1px;background:#004e75;color:#fff;font-weight:bold;font-size:12px;padding:4px 5px;height:30px;line-height:30px;}.signature{width:100%;justify-content:space-around;}.bg-grey{background:#dadada;}`;

const QUALITY_CONTROL_STYLE = `.table-quality-control{width:100%;}.table-quality-control-header{height:10px;}.box{width:155px;height:200px;overflow:hidden;padding-bottom:5px;background:#f0f4f5;font-size:10px;margin-bottom:20px;}.box-header{height:100px;background:#f0f4f5;}.box-header-img{position:relative;overflow:hidden;width:100%;height:100%;}.box-header-img img{position:absolute;width:100%;height:auto;left:50%;top:50%;transform:translate(-50%,-50%);}.box-header-placeholder{display:flex;justify-content:center;align-items:center;height:80px;opacity:0.4;width:100%;height:100%;}.box-body{overflow:hidden;padding:10px 5px;height:80px;display:flex;flex-direction:column;justify-content:space-between;}.description{font-size:10px;}.justify-between{justify-content:space-between;}.text-secondary{color:#f47920!important;}`;

const TASK_STATISTIC_STYLE = `.statistic-chart-row{margin-bottom:10px;page-break-inside: avoid;}.xAxis{border-radius:5px;overflow:hidden;width:100%;height:20px}.yAxis{font-size:12px;color:#000000B3}.fill{border-radius:5px;background:#f47920;position:relative}.label-value{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px}`;

const TAG_STYLE = `.tag{padding:0 5px;height:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:2px;font-size:10px;color:#ffffff;text-transform:capitalize;}.tag-waiting{background:#8c8c8c;}.tag-confirmed{background:#18b4c9;}.tag-checked{background:#00b16a;}.tag-done{background:#00b16a;}`;

const INVOICE_STYLE = `.invoice-attachment{position:relative;overflow:hidden;width:450px;height:600px;margin-right:15px;}.invoice-attachment img{position:absolute;width:100%;height:auto;left:50%;top:50%;transform:translate(-50%,-50%);}.invoice-image{page-break-inside:avoid;}.justify-center{justify-content:center;}`;

const CUSTOMER_REVIEW_STYLE = `.w-100{width:100%!important;}.table-wrapper{width:100%;font-family:'Roboto',sans-serif;font-style:normal;}.table-rating{border-spacing:0px!important;}.table-rating .table-report-cell{font-size:10.5px;}.table-rating .table-report-cell:first-child{border-left:1px solid #f0f0f0;}.table-rating .table-report-header{color:#000000d9;background:#f0f0f0!important;font-size:10px;}.text-primary{color:#004e75;}.text-secondary{color:#f47920!important;}.text-center{text-align:center;}`;

module.exports = {
	TASK_STATISTIC_STYLE,
	GLOBAL_STYLE,
	PERFORMANCE_STYLE,
	TABLE_REPORT_STYLE,
	QUALITY_CONTROL_STYLE,
	INTRO_PAGE_STYLE,
	TAG_STYLE,
	INVOICE_STYLE,
	CUSTOMER_REVIEW_STYLE,
};
