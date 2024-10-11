import _ from "lodash";
import { useSelector } from "react-redux";
import { Button, Tooltip } from "antd";
import { useState } from "react";

import Table from "@components/tables/table.style";
import { InfoCircleOutlined } from "@ant-design/icons";
import { Box } from "@components/utility/styles";

import ModalViewPayment from "../components/ModalViewPayment";
import ExpandedRowRender from "./expendedRowPayment";
import * as Constant from "../const";
import * as dataTable from "./renderCol";

const TablePayment = ({ changeParams, limit, page, query, ...props }) => {
  const [state, setState] = useState({
    openView: false,
    currentView: {},
  });

  const { data, loading, total, columnReferences } = useSelector(
    state => state.accounting.income.profession.transactionHistory.payment
  );

  const onOpenView = value => {
    setState(prev => ({ ...prev, openView: true, currentView: value }));
  };

  const onCloseView = () => {
    setState(prev => ({ ...prev, openView: false }));
  };

  const titlePayoutAmount = (
    <Tooltip title="The amount receivable on this particular payout date." placement="top">
      <Box flex justify="flex-start" alignItem="center" gap={5}>
        {columnReferences.reservation.payout_amount}
        <InfoCircleOutlined />
      </Box>
    </Tooltip>
  );

  const titleReceivableAmount = (
    <Tooltip
      title="This number represents the cumulative sum of all payments owed to you up to the current date. 
      It includes any outstanding payments from previous payout cycles that have been carried over and combined with the latest payout date."
      placement="top"
    >
      <Box flex justify="flex-start" alignItem="center" gap={5}>
        {columnReferences.reservation.receivable_amount}
        <InfoCircleOutlined />
      </Box>
    </Tooltip>
  );

  const sortOderFc = name => {
    const { sortBy, order } = query;
    if (sortBy === name) {
      if (order === "asc") {
        return "ascend";
      }
      if (order === "desc") {
        return "descend";
      }
    }
  };

  const columns = !_.isEmpty(columnReferences) && [
    {
      title: columnReferences.reservation.payout_date,
      key: "payout_date",
      dataIndex: "payout_date",
      sorter: true,
      sortOrder: sortOderFc("payout_date"),
      render: p => dataTable.convertDate(p),
    },
    {
      title: columnReferences.reservation.charge_amount,
      key: "charge_amount",
      dataIndex: "charge_amount",
      sorter: true,
      sortOrder: sortOderFc("charge_amount"),
      render: charge_amount =>
        _.map(charge_amount, (item, index) => <div key={index}>{dataTable.renderAmount(item)}</div>),
    },
    {
      title: columnReferences.reservation.charge_fee,
      key: "fee",
      dataIndex: "fee",
      sorter: true,
      sortOrder: sortOderFc("fee"),
      render: fee => _.map(fee, (f, index) => <div key={index}>{dataTable.renderAmount(f)}</div>),
    },
    {
      title: titlePayoutAmount,
      key: "payout_amount",
      dataIndex: "payout_amount",
      render: payout_amount => dataTable.formatPrice(parseInt(payout_amount)),
    },
    {
      title: titleReceivableAmount,
      key: "receivable_amount",
      dataIndex: "payable_payout_amount",
      render: payable_payout_amount => dataTable.formatPrice(parseInt(payable_payout_amount)),
    },
    {
      title: columnReferences.reservation.status,
      key: "status",
      dataIndex: "status",
      render: status => Constant.statusOptions[status].label,
    },
    {
      title: columnReferences.other.action,
      key: "action",
      render: item => (
        <Button type="link" onClick={() => onOpenView(item)}>
          View On
        </Button>
      ),
    },
  ];

  const handlePaginationChange = (pagination, filters, sorter) => {
    changeParams({
      page: pagination,
    });
  };

  const expandedRowRender = row => {
    return <ExpandedRowRender row={row} loading={loading} columnReferences={columnReferences} />;
  };

  const onTableChange = (paginations, filters, sorters) => {
    changeParams({
      sortBy: sorters.column ? sorters.column.sortKey || sorters.field : undefined,
      order: sorters.order === "descend" ? "desc" : sorters.order === "ascend" ? "asc" : undefined,
    });
  };

  return (
    <>
      {state.openView && <ModalViewPayment data={state.currentView} onToggle={onCloseView} />}
      <Table
        rowKey="id"
        bordered
        columns={columns || []}
        loading={loading}
        rowClassName={"custom-row-class"}
        dataSource={data}
        scroll={{ x: "max-content" }}
        expandable={{
          expandedRowRender,
        }}
        onChange={onTableChange}
        pagination={
          Number(total) > Number(limit) && {
            pageSize: limit,
            current: page || 1,
            total,
            hiddenOnSingPage: true,
            showSizeChanger: false,
            onChange: handlePaginationChange,
          }
        }
      />
    </>
  );
};

export default TablePayment;
