import _ from "lodash";

import * as dataTable from "../renderCol";

export const columnsPayout = ({ columnReferencesPayout, renderCols, onCell }) => {
  const newColumns = [
    {
      title: columnReferencesPayout.payout.category,
      key: "category",
      dataIndex: "categoryId",
      width: 120,
      onCell,
      render: renderCols.renderCategory,
      fixed: true,
    },
    {
      title: columnReferencesPayout.payout.currencyAmount,
      key: "currencyAmount",
      dataIndex: "currencyAmount",
      width: 120,
      align: "right",
      render: renderCols.renderAmount,
      sorter: true,
      onCell,
    },
    {
      title: columnReferencesPayout.payout.exportNo,
      key: "exportNo",
      dataIndex: "export",
      width: 100,
      onCell,
      render: renderCols.renderExportNo,
    },
    {
      title: columnReferencesPayout.payout.blockIds,
      key: "blockIds",
      width: 170,
      onCell,
      render: dataTable.renderHome,
    },
    {
      title: columnReferencesPayout.payout.isInternal,
      key: "isInternal",
      dataIndex: "isInternal",
      width: 100,
      render: dataTable.renderIsInternal,
    },
    {
      title: "Người nhận",
      key: "payAccountId",
      dataIndex: "payAccountId",
      onCell,
      render: data => {
        const creditAccount = `${_.get(data, "name") || _.get(data, "accountName")} (${_.get(
          data,
          "shortName"
        )} - ${_.get(data, "accountName")} - ${_.get(data, "accountNos[0]")})`;
        return <div style={{ maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis" }}>{creditAccount}</div>;
      },
    },
    {
      title: columnReferencesPayout.payout.state,
      key: "status",
      width: 115,
      dataIndex: "status",
      onCell,
      render: dataTable.renderStatus,
    },
    {
      title: columnReferencesPayout.payout.source,
      key: "source",
      width: 100,
      dataIndex: "source",
      onCell,
      render: renderCols.renderSource,
    },
    {
      title: columnReferencesPayout.payout.createdAt,
      key: "createdAt",
      width: 100,
      sorter: true,
      onCell,
      render: data => {
        return dataTable.renderCreatedAt(_.get(data, "createdAt"));
      },
    },
    {
      title: columnReferencesPayout.payout.createdBy,
      dataIndex: "createdBy",
      key: "createdBy",
      width: 140,
      onCell,
      render: renderCols.renderCreatedBy,
    },
  ];
  return newColumns;
};
