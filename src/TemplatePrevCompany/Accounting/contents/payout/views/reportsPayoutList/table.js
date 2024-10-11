import { useSelector, shallowEqual } from "react-redux";

import Table from "@components/tables/table.style";
import Box from "@components/utility/box";
import { Box as WrapFlex } from "@components/utility/styles";
import _ from "lodash";

const selector = state => [state.accounting.expense.approvedExpenditure.columnsReferences];

const TablePayoutApproveList = ({ changeParams, query, data, total, limit, page, setPage }) => {
  const [columnsReferences] = useSelector(selector, shallowEqual);

  const allColumns = [
    {
      title: (
        <WrapFlex flex justify="start" pl={10}>
          {columnsReferences.other.order}
        </WrapFlex>
      ),
      key: "order",
      dataIndex: "order",
      width: 56,
      render: (data, item, i) => {
        const start = parseInt(_.get(query, "limit")) * parseInt(_.get(query, "page") - 1);
        const stt = start + (i + 1);
        return (
          <WrapFlex flex justify="start" pl={10}>
            {stt}
          </WrapFlex>
        );
      },
    },
    {
      title: columnsReferences.columns.noId,
      key: "noId",
    },
    {
      title: columnsReferences.columns.name,
      key: "name",
    },
    {
      title: columnsReferences.columns.amount,
      key: "amount",
    },
    {
      title: columnsReferences.columns.created_by,
      key: "created_by",
    },
    {
      title: columnsReferences.columns.confirmed,
      key: "confirmed",
    },
    {
      title: columnsReferences.columns.approved,
      key: "approved",
    },
    {
      title: columnsReferences.columns.created_at,
      key: "created_at",
    },
    {
      title: columnsReferences.columns.note,
      key: "note",
    },
  ];

  const handlePaginationChange = (pagination, filters, sorter) => {
    if (setPage) {
      setPage(pagination);
    } else {
      changeParams({
        page: pagination,
      });
    }
  };

  return (
    <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
      <Table
        rowKey="_id"
        bordered
        columns={allColumns}
        loading={false}
        rowClassName={"custom-row-class"}
        dataSource={[]}
        onRow={data => ({
          onClick: () => {
            changeParams(
              {
                id: data._id,
              },
              {
                replace: true,
              }
            );
          },
        })}
        scroll={{
          // y: 700,
          x: "max-content",
        }}
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
    </Box>
  );
};

export default TablePayoutApproveList;
