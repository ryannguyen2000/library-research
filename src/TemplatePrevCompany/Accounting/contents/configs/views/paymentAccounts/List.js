import { memo } from "react";
import { Tag, Modal } from "antd";
import { DeleteOutlined, MessageOutlined } from "@ant-design/icons";

import TableWrapper, { ActionWrapper } from "@components/tables/table.style";
import _ from "lodash";
import { pageSizeOptions } from "@settings/const";

const renderHome = data => {
  return <>{!_.isEmpty(data) && _.map(_.map(data, "info.name"), (h, index) => <p key={index}>{h}</p>)}</>;
};

function List({ data, total, loading, handleDelete, onUpdate, onRequest, changeParams, page, pageSize }) {
  const onDelete = row => {
    Modal.confirm({
      title: "Xác nhận xoá tài khoản này ?",
      maskClosable: true,
      onOk: async () => {
        const errorCode = await handleDelete(row);
        if (errorCode) {
          return Promise.reject(errorCode);
        }
      },
    });
  };

  const onRequestClick = row => {
    Modal.confirm({
      title: `Xác nhận ${row.subscribedNotification ? "huỷ" : ""} đăng ký nhận biến động số dư?`,
      maskClosable: true,
      onOk: () => {
        onRequest(row);
      },
    });
  };

  const columns = [
    {
      title: "No",
      key: "no",
      dataIndex: "no",
    },
    {
      title: "Tên",
      key: "name",
      dataIndex: "name",
    },
    {
      title: "Ngân hàng",
      key: "bank",
      dataIndex: "bankId",
      render: bank => _.get(bank, "shortName"),
    },
    {
      title: "Tên tài khoản",
      key: "accountName",
      dataIndex: "accountName",
    },
    {
      title: "Số tài khoản",
      dataIndex: "accountNos",
      render: accountNos => {
        return _.map(accountNos, no => (
          <Tag title={no || ""} key={no}>
            {no}
          </Tag>
        ));
      },
    },
    {
      title: "Nhà mặc định",
      key: "blockIds",
      dataIndex: "blockIds",
      render: renderHome,
    },
    {
      title: "Khoản chi mặc định",
      key: "payoutCategoryIds",
      dataIndex: "payoutCategoryIds",
      render: item => _.map(item, "name").toString(),
    },
    {
      title: "#",
      width: 50,
      dataIndex: "_id",
      render: (_id, row) => (
        <ActionWrapper>
          <DeleteOutlined
            onClick={e => {
              e.stopPropagation();
              onDelete(row);
            }}
            className="text-red"
          />
          {row.serviceAccountId && (
            <MessageOutlined
              onClick={e => {
                e.stopPropagation();
                onRequestClick(row);
              }}
            />
          )}
        </ActionWrapper>
      ),
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
      <TableWrapper
        rowKey="_id"
        columns={columns}
        loading={loading}
        dataSource={data || []}
        onRow={record => ({
          onClick: () => onUpdate(record),
        })}
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
}

export default memo(List);
