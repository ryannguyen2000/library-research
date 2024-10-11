import { Component } from "react";
import _ from "lodash";
import { saveAs } from "file-saver";
import Excel from "exceljs/dist/exceljs";
import { Popover } from "antd";
import moment from "moment";
import { FileExcelOutlined } from "@ant-design/icons";
import { injectIntl } from "react-intl";

import { HeaderButton } from "@components/page/headerComponent";
import { PAYOUT_SOURCES, PAYOUT_TYPES } from "@settings/const";
import { statusExport } from "../tableDetail/rendercol";

const processStyle = cell => {
  cell.style.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
};

class ToolExport extends Component {
  state = {
    visible: false,
    loading: false,
  };

  handleExport = async bookType => {
    const { query, data, mapData, activeColKeys, dataType, title, intl } = this.props;

    const workbook = new Excel.Workbook();
    workbook.properties.date1904 = true;
    const worksheet = workbook.addWorksheet("Sheet1", {
      pageSetup: { showGridLines: true },
    });

    const name = `Quy Trình Dòng Tiền, Công Nợ (${title})`;
    const columns = [
      {
        header: "STT",
        key: "order",
        width: 5,
      },
      {
        header: "Khoản chi",
        key: "category",
        width: 25,
      },
      {
        header: "Nguồn",
        key: "otaName",
        width: 25,
      },
      {
        header: "Booking ID",
        key: "otaBookingId",
        width: 14,
      },
      {
        header: "Phiếu chi",
        key: "exportNo",
        width: 25,
      },
      {
        header: "Số tiền",
        key: "exchangedAmount",
        width: 14,
      },
      {
        header: "Nhà",
        key: "block",
        width: 50,
      },
      {
        header: "Phòng",
        key: "rooms",
        width: 30,
      },
      {
        header: "Trạng thái",
        key: "state",
        width: 30,
      },
      {
        header: "Khoản thu",
        key: "payoutType",
        width: 25,
      },
      {
        header: "Ngày tạo",
        key: "createdAt",
        width: 15,
      },
      {
        header: "Checkin",
        key: "from",
        style: { numFmt: "dd/mm/yyyy" },
        width: 15,
      },
      {
        header: "Checkout",
        key: "to",
        style: { numFmt: "dd/mm/yyyy" },
        width: 15,
      },
      {
        header: "Cách thức chi",
        key: "source",
        width: 25,
      },
      {
        header: "Người tạo",
        key: "createdBy",
        width: 30,
      },
      {
        header: "Người thu",
        key: "collector",
        width: 30,
      },
      {
        header: "Ghi chú",
        key: "description",
        width: 50,
      },
    ];

    const activeColumns = columns.filter(({ key }) => !activeColKeys.includes(key));

    worksheet.columns = activeColumns;
    worksheet.mergeCells("A1:K1");
    worksheet.getCell("A1").value = name;
    worksheet.getCell("A1").font = {
      name: "Times New Roman",
      size: 16,
    };
    worksheet.getRow(1).height = 30;
    worksheet.getCell("A1").alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    let currentRow = 3;
    worksheet.getRow(currentRow).font = { name: "Times New Roman", bold: true };
    worksheet.getRow(currentRow).alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    worksheet.getRow(currentRow).height = 30;
    worksheet.getRow(currentRow).values = activeColumns.map(c => c.header);
    worksheet.getRow(currentRow).eachCell(processStyle);

    data.forEach((item, index) => {
      currentRow++;
      worksheet.addRow({
        order: index + 1,
        otaName: item.otaName,
        block: _.map(_.get(item, "blockIds"), block => _.get(_.get(mapData.blocks, block), "info.name")).join(", "),
        rooms: _.map(_.get(item, "roomIds"), r => _.get(_.get(mapData.rooms, r), "info.roomNo")).join(", "),
        from: moment(_.get(_.get(mapData.bookings, _.get(item, "bookingId")), "from")).format("DD/MM/Y"),
        to: moment(_.get(_.get(mapData.bookings, _.get(item, "bookingId")), "to")).format("DD/MM/Y"),
        otaBookingId: _.get(_.get(mapData.bookings, _.get(item, "bookingId")), "otaBookingId"),
        exportNo: _.get(item, "export.noId"),
        exchangedAmount: _.get(item, "currencyAmount.exchangedAmount"),
        payoutType: intl.messages[_.get(PAYOUT_TYPES, [item.payoutType, "name"])],
        createdAt: _.get(item, "createdAt") && moment(_.get(item, "createdAt")).format("DD/MM/Y"),
        createdBy:
          _.get(_.get(mapData.users, _.get(item, "createdBy")), "name") ||
          _.get(_.get(mapData.users, _.get(item, "createdBy")), "username"),
        collector:
          _.get(_.get(mapData.users, _.get(item, "collector")), "name") ||
          _.get(_.get(mapData.users, _.get(item, "collector")), "username"),
        category: _.get(_.get(mapData.categories, _.get(item, "categoryId")), "name"),
        state: statusExport[_.get(item, "state")],
        source: intl.messages[_.get(_.get(PAYOUT_SOURCES, [item.source]), "name")],
        description: _.get(item, "description"),
      });
      worksheet.getRow(currentRow).eachCell({ includeEmpty: true }, processStyle);
      worksheet.getRow(currentRow).font = { name: "Times New Roman" };
    });

    const formula1 = dataType === "pay" ? `sum(D4:D${currentRow})` : `sum(D4:D${currentRow})`;

    worksheet.getCell(dataType === "pay" ? `D${currentRow + 1}` : `D${currentRow + 1}`).value = {
      formula: formula1,
    };

    currentRow++;
    worksheet.getRow(currentRow).eachCell({ includeEmpty: true }, processStyle);
    worksheet.getRow(currentRow).font = { name: "Times New Roman" };

    this.setState({ loading: true, visible: false });

    const buffer = await workbook[bookType].writeBuffer();
    saveAs(
      new Blob([buffer], { type: "application/octet-stream" }),
      `quy-trinh-dong-tien-cong-no-${query.period}(${title}).${bookType}`
    );

    this.setState({ loading: false });
  };

  onOpenChange = visible => {
    this.setState({ visible });
  };

  render() {
    const {
      state: { visible, loading },
      onOpenChange,
    } = this;

    const content = (
      <div className="text-bold">
        <div style={{ cursor: "pointer", marginBottom: 10 }} onClick={() => this.handleExport("xlsx")}>
          <FileExcelOutlined /> Export to Excel
        </div>
        <div style={{ cursor: "pointer" }} onClick={() => this.handleExport("csv")}>
          <FileExcelOutlined /> Export to CSV
        </div>
      </div>
    );

    return (
      <Popover open={visible} content={content} trigger="click" placement="bottomRight" onOpenChange={onOpenChange}>
        <HeaderButton disabled={loading} loading={loading} style={{ marginRight: 12 }}>
          <i className="ion-printer abs-icon" />
          <span>EXPORT</span>
        </HeaderButton>
      </Popover>
    );
  }
}

export default injectIntl(ToolExport);
