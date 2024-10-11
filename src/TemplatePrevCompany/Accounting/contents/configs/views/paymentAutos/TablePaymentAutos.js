import { useState } from "react";
import _ from "lodash";
import { connect } from "react-redux";
import { Tag } from "antd";
// import moment from "moment";

import TableWrapper from "@components/tables/table.style";
import { pageSizeOptions, PAYOUT_AUTO_TYPES, PAYOUT_AUTO_TIME } from "@settings/const";
// import { Box } from "@components/utility/styles";

import * as dataTable from "./renderCol";
import ModaPaymentAutos from "./tool/modal/modaPaymentAutos";
import BtnConform from "./components/btnAction";

const renderHome = blocks => {
  return _.map(blocks, block => <Tag key={block._id}>{_.head(block.info.shortName) || block.info.name}</Tag>);
};

const TablePaymentAutos = ({
  data,
  total,
  loading,
  // onUpdate,
  page,
  pageSize,
  changeParams,
  columnsReference,
  refreshPaymentAutos,
}) => {
  const [statesModal, setStatesModal] = useState({
    open: false,
    data: {},
  });

  const onToggleModal = () => {
    setStatesModal(prev => ({
      open: false,
      data: {},
    }));
  };

  const onCell = data => {
    return {
      onClick: () => {
        setStatesModal({
          open: true,
          data,
        });
      },
    };
  };

  const columns = [
    {
      title: columnsReference.other.order,
      key: "STT",
      render: (a, r, i) => (page - 1) * pageSize + i + 1,
    },
    {
      title: "Tên",
      key: "name",
      dataIndex: "name",
      onCell,
    },
    {
      title: "Loại",
      key: "type",
      dataIndex: "type",
      onCell,
      render: type => _.get(PAYOUT_AUTO_TYPES, [type, "label"]),
    },
    {
      title: columnsReference.columns.home,
      key: "blockIds",
      dataIndex: "blockIds",
      render: renderHome,
      onCell,
    },
    {
      title: columnsReference.columns.description,
      dataIndex: "description",
      key: "description",
      onCell,
    },
    {
      title: columnsReference.columns.autos,
      dataIndex: "autos",
      key: "autos",
      onCell,
      render: autos =>
        _.map(autos, (auto, index) => (
          <div key={index}>{`${_.get(PAYOUT_AUTO_TIME, [auto.type, "label"], auto.type)} - ${_.get(
            auto,
            "timeValue"
          )}`}</div>
        )),
    },
    {
      title: columnsReference.columns.createdAt,
      dataIndex: "createdAt",
      key: "createdAt",
      onCell,
      render: dataTable.renderTime,
    },
    {
      title: columnsReference.columns.createdBy,
      key: "createdBy",
      onCell,
      render: dataTable.renderCreatedBy,
    },
    {
      title: columnsReference.other.action,
      key: "actions",
      dataIndex: "_id",
      zIndex: 99,
      width: 50,
      // fixed: "right",
      render: _id => {
        return (
          <>
            <BtnConform type="delete" id={_id} refresh={refreshPaymentAutos} key="delete" />
            <BtnConform type="sync" id={_id} key="sync" />
          </>
        );
      },
    },
  ];

  const handlePaginationChange = (pagination, filters, sorter) => {
    changeParams({
      limit: filters,
      page: pagination,
    });
  };

  return (
    <>
      {statesModal.open && (
        <ModaPaymentAutos data={statesModal.data} onToggleModal={onToggleModal} refresh={refreshPaymentAutos} />
      )}
      <TableWrapper
        rowKey="_id"
        columns={columns}
        loading={loading}
        dataSource={data || []}
        // onRow={record => ({
        //   onClick: () => onUpdate(record),
        // })}
        pagination={{
          hideOnSinglePage: true,
          total: total || 0,
          current: page,
          pageSize,
          pageSizeOptions,
          showTotal: (total, range) => {
            return `Showing ${range[0]}-${range[1]} of ${total} Results`;
          },
          onChange: handlePaginationChange,
        }}
      />
    </>
  );
};

export default connect(
  ({ accounting: { configs } }) => ({
    columnsReference: configs.paymentAutos.columnsReference,
  }),
  {}
)(TablePaymentAutos);
