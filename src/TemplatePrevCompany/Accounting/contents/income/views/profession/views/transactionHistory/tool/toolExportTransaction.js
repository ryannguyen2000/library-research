import { Component } from "react";
import { injectIntl } from "react-intl";
import moment from "moment";
import { connect } from "react-redux";
import { saveAs } from "file-saver";
import Excel from "exceljs/dist/exceljs";
import { Popover, message } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";

import { minFormatMoney } from "@helpers/utility";
import BoxExport from "@components/utility/boxExport";
import { HeaderButton } from "@components/page/headerComponent";
import { bindActionCreators } from "redux";

import transactionActions from "@redux/accounting/income/profession/transactionHistory/transaction/actions";

const processStyle = cell => {
  cell.style.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
};

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
      reference_no: row.reference,
      amount: minFormatMoney(row.amount.value, row.amount.currency),
      created_on: this.convertDate(row.created_at),
      status: row.transaction_status,
      payout_date: this.convertDate(row.payout_date),
    };
  };

  handleExport = async bookType => {
    const {
      intl: { messages: t },
    } = this.props;

    const { data, columns, columnReferences } = this.props.transaction;

    const colWidths = {
      reference_no: 20,
      merchant_name: 20,
      card_name: 20,
      amount: 20,
      currency: 20,
      channel: 20,
      transaction_type: 20,
      status: 20,
      guest_name: 20,
      created_on: 20,
      payout_date: 20,
    };

    try {
      const workbook = new Excel.Workbook();
      workbook.properties.date1904 = true;
      const worksheet = workbook.addWorksheet("Sheet1", {
        properties: { showGridLines: true },
      });
      const newDate = new Date();
      const name = `KOVENA TRANSACTION ${moment(newDate).format("Y/MM/DD")}`;

      worksheet.columns = [
        { header: "STT", key: "index", width: 5 },
        ...columns.reservation.map(c => ({
          width: colWidths[c],
          key: c,
          header: t[columnReferences.reservation[c]] || columnReferences.reservation[c],
        })),
      ];

      worksheet.getRow(1).values = "";
      worksheet.mergeCells("A2:I2");
      worksheet.getCell("A2").value = name;
      worksheet.getRow(2).font = {
        name: "Times New Roman",
      };
      worksheet.getRow(2).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getRow(4).font = { name: "Times New Roman", bold: true };
      worksheet.getRow(4).alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
      worksheet.getRow(4).height = 30;
      worksheet.getRow(4).values = worksheet.columns.map(c => c.header);
      worksheet.getRow(4).eachCell(processStyle);
      let currentCell = 4;
      data.forEach((row, index) => {
        worksheet.addRow(this.genereData(row, index));
        currentCell++;
        worksheet.getRow(currentCell).eachCell(processStyle);
      });
      const buffer = await workbook[bookType].writeBuffer();
      saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${name}.${bookType}`);
    } catch (e) {
      message.error("Có lỗi xảy ra, vui lòng thử lại sau!");
    }
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

    const onExport = async type => {
      this.setState({ loading: true });
      this.handleExport(type);
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
  fetch: bindActionCreators(transactionActions.fetch, dispatch),
});

function mapStateToProps({ accounting }) {
  return {
    transaction: accounting.income.profession.transactionHistory.transaction,
  };
}
export default connect(mapStateToProps, mapDispatchToProps)(injectIntl(ToolPrint));
