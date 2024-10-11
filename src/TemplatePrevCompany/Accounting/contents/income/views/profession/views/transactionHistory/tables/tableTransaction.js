import _ from "lodash";
import { useState } from "react";
import { Button } from "antd";
import { useSelector } from "react-redux";

import Table from "@components/tables/table.style";

import ModalViewTransaction from "../components/ModalViewTransaction";
import * as dataTable from "./renderCol";

const TableTransaction = ({ changeParams, limit, page, query, ...props }) => {
  const [state, setState] = useState({
    openView: false,
    currentId: {},
  });

  const { data, loading, total, columnReferences, columns } = useSelector(
    state => state.accounting.income.profession.transactionHistory.transaction
  );

  const onOpenView = id => {
    setState(prev => ({ ...prev, openView: true, currentId: id }));
  };

  const onCloseView = () => {
    setState(prev => ({ ...prev, openView: false }));
  };

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

  const allColumns = !_.isEmpty(columnReferences) && [
    {
      title: columnReferences.reservation.reference_no,
      key: "reference_no",
      sorter: true,
      sortOrder: sortOderFc("reference"),
      render: item => {
        const reference_no = _.get(item, "charge.reference");
        return reference_no ? (
          <Button type="link" onClick={() => onOpenView(_.get(item, "id"))}>
            {reference_no}
          </Button>
        ) : (
          <></>
        );
      },
    },
    {
      title: columnReferences.reservation.bk_id,
      key: "bk_id",
      dataIndex: "bk_id",
    },
    {
      title: columnReferences.reservation.card_name,
      key: "card_name",
      dataIndex: "guest_name",
    },
    {
      title: columnReferences.reservation.amount,
      key: "amount",
      dataIndex: "amount",
      sorter: true,
      sortOrder: sortOderFc("amount"),
      render: amount => dataTable.renderAmount(amount),
    },
    {
      title: columnReferences.reservation.transaction_channel,
      key: "transaction_channel",
      dataIndex: "transaction_channel",
    },
    {
      title: columnReferences.reservation.transaction_type,
      key: "transaction_type",
      dataIndex: "transaction_type",
    },
    {
      title: columnReferences.reservation.status,
      key: "status",
      dataIndex: "transaction_status",
    },
    {
      title: columnReferences.reservation.guest_name,
      key: "guest_name",
      dataIndex: "guest_name",
    },
    {
      title: columnReferences.reservation.created_at,
      key: "created_at",
      dataIndex: "created_at",
      sorter: true,
      sortOrder: sortOderFc("created_at"),
      render: c => dataTable.convertDate(c),
    },
    {
      title: columnReferences.reservation.payout_date,
      key: "payout_date",
      dataIndex: "payout_date",
      sorter: true,
      sortOrder: sortOderFc("payout_date"),
      render: p => dataTable.convertDate(p),
    },
    {
      title: columnReferences.other.action,
      key: "action",
      render: item => (
        <Button type="link" onClick={() => onOpenView(_.get(item, "id"))}>
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

  const onTableChange = (paginations, filters, sorters) => {
    changeParams({
      sortBy: sorters.column ? sorters.column.sortKey || sorters.field : undefined,
      order: sorters.order === "descend" ? "desc" : sorters.order === "ascend" ? "asc" : undefined,
    });
  };

  const activeColKeys = _.flatMapDeep(_.values(columns));
  const activeColumns = allColumns.filter(({ key }) => activeColKeys.includes(key));

  console.log("dataaaaaaaaa", data);

  return (
    <>
      {state.openView && <ModalViewTransaction id={state.currentId} onToggle={onCloseView} />}
      <Table
        rowKey="id"
        bordered
        columns={activeColumns}
        loading={loading}
        rowClassName={"custom-row-class"}
        dataSource={data}
        scroll={{ x: "max-content" }}
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

export default TableTransaction;
