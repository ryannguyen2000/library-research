import { Component } from "react";
import { injectIntl } from "react-intl";
import _ from "lodash";
import moment from "moment";
import { connect } from "react-redux";
import { message, Popover } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";

import { minFormatMoney } from "@helpers/utility";
import BoxExport from "@components/utility/boxExport";
import { HeaderButton } from "@components/page/headerComponent";
import { bindActionCreators } from "redux";

import paymentActions from "@redux/accounting/income/profession/transactionHistory/payment/actions";
import client from "@helpers/client";

class ToolPrint extends Component {
  state = {
    visible: false,
    loading: false,
    openModalVAT: false,
  };

  convertDate = value => {
    const date = new Date(value * 1000);
    return moment(date).format("Y/MM/DD HH:mm");
  };

  genereData = (row, index) => {
    return {
      ...row,
      index: index + 1,
      payout_date: this.convertDate(_.get(row, "payout_date")),
      charge_amount: _.map(row.charge_amount, item =>
        minFormatMoney(_.get(item, "amount"), _.get(item, "currency"))
      ).toString(),
      charge_fee: _.map(_.get(row, "fee"), f => minFormatMoney(_.get(f, "amount"), _.get(f, "currency"))).toString(),
      payout_amount: minFormatMoney(row.payout_amount),
    };
  };

  handleExport = (blobData, filename) => {
    const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([blobData], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename); // Use the extracted filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  onOpenChange = visible => {
    this.setState({ visible });
  };

  onToggleModalVAT = () => {
    this.setState({ openModalVAT: !this.state.openModalVAT, visible: false });
  };

  render() {
    const {
      state: { visible, loading },
      onOpenChange,
      // props,
    } = this;

    const { query } = this.props.payment;

    const onExport = async type => {
      this.setState({ loading: true });
      const respon = await client().get(`/finance/booking/charge/report/payouts`, {
        params: {
          ...query,
          download: type === "xlsx" ? "excel" : "csv",
          limit: undefined,
          page: undefined,
        },
        responseType: "blob",
      });
      if (respon.status === 200) {
        const contentDisposition = respon.headers["content-disposition"];
        const filename = contentDisposition.split("filename=")[1].split('"')[1];
        this.handleExport(respon.data, filename);
      } else {
        message.error(_.get(respon, "data.message"));
      }
      this.setState({ loading: false, visible: false });
    };

    const content = (
      <BoxExport>
        <div className="export-item" onClick={() => onExport("xlsx")}>
          <FileExcelOutlined /> Export to Excel
        </div>
        <div className="export-item" onClick={() => onExport("csv")}>
          <FileExcelOutlined /> Export to CSV
        </div>
        {/* <div
          className="export-item"
          // style={!isVAT ? { pointerEvents: "none", opacity: 0.5 } : {}}
          onClick={this.onToggleModalVAT}
        >
          <FileExcelOutlined /> VAT
        </div>
        <Printer {...props} genereData={this.genereData} /> */}
      </BoxExport>
    );

    return (
      <>
        <Popover
          content={content}
          trigger="click"
          placement="bottomRight"
          open={loading ? false : visible}
          onOpenChange={onOpenChange}
        >
          <HeaderButton style={{ marginRight: 12 }} disabled={loading} loading={loading}>
            <i className="ion-printer abs-icon" />
            <span>EXPORT</span>
          </HeaderButton>
        </Popover>
      </>
    );
  }
}

const mapDispatchToProps = dispatch => ({
  fetch: bindActionCreators(paymentActions.fetch, dispatch),
});

function mapStateToProps({ accounting }) {
  return {
    payment: accounting.income.profession.transactionHistory.payment,
  };
}
export default connect(mapStateToProps, mapDispatchToProps)(injectIntl(ToolPrint));
