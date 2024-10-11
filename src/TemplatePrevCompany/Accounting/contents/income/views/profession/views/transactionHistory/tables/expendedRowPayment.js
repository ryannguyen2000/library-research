import _ from "lodash";
import { Button } from "antd";
import { useState } from "react";

import Table from "@components/tables/table.style";

import * as dataTable from "./renderCol";
import { convertDate } from "./renderCol";
import ModalViewTransaction from "../components/ModalViewTransaction";

const ExpandedRowRender = ({ row, loading, columnReferences }) => {
  const [state, setState] = useState({
    openView: false,
    currentView: {},
    currentViewChild: {},
  });

  const onOpenView = data => {
    setState(prev => ({ ...prev, openView: true, currentViewChild: data }));
  };

  const onCloseView = () => {
    setState(prev => ({ ...prev, openView: false }));
  };

  const columns = [
    {
      title: columnReferences.reservation.created_on,
      key: "created_on",
      dataIndex: "created_at",
      render: time => convertDate(time, "Y/MM/DD"),
    },
    {
      title: columnReferences.reservation.reference_no,
      key: "reference_no",
      render: item => {
        const reference_no = _.get(item, "reference");
        return reference_no ? (
          <Button type="link" onClick={() => onOpenView({ charge: item })}>
            {reference_no}
          </Button>
        ) : (
          <></>
        );
      },
    },
    {
      title: columnReferences.reservation.guest_name,
      dataIndex: "guest_name",
      key: "guest_name",
    },
    {
      title: columnReferences.reservation.card_name,
      dataIndex: "card_holder",
      key: "card_name",
    },
    {
      title: columnReferences.reservation.channel,
      dataIndex: "transaction_channel",
      key: "channel",
    },
    {
      title: columnReferences.reservation.type,
      dataIndex: "type",
      key: "type",
    },
    {
      title: columnReferences.reservation.status,
      dataIndex: "status",
      key: "status",
    },
    {
      title: columnReferences.reservation.charge_amount,
      dataIndex: "charge_amount",
      key: "charge_amount",
      render: amount => dataTable.formatPrice(parseInt(amount)),
    },
    {
      title: columnReferences.reservation.charge_fee,
      dataIndex: "total_fee",
      key: "charge_fee",
      render: fee => dataTable.formatPrice(parseInt(fee)),
    },
    {
      title: columnReferences.reservation.payout_amount,
      dataIndex: "payout_amount",
      key: "payout_amount",
      render: amount => dataTable.formatPrice(parseInt(amount)),
    },
  ];

  return (
    <>
      {state.openView && <ModalViewTransaction dataModal={state.currentViewChild} onToggle={onCloseView} />}
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={_.get(row, "details")}
        title={() => {
          return <div></div>;
        }}
        scroll={{
          x: "max-content",
        }}
        pagination={false}
      />
    </>
  );
};

export default ExpandedRowRender;
