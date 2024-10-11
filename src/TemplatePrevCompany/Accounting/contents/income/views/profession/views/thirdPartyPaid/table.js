import Box from "@components/utility/box";
import Table from "@components/tables/table.style";
import { useSelector, shallowEqual } from "react-redux";
import { Row, Col, Button } from "antd";
import styled from "styled-components";

import { Flex, Label, Text, Box as WrapFlex } from "@components/utility/styles";
import _ from "lodash";
import { GUTTER, formatDateTime } from "@containers/Accounting/const";

const selector = state => [state.accounting.income.profession.thirdPartyPaid.columnsReferences];

const TableThirdPartyPaid = ({ changeParams, query, data, total, limit, page, setPage }) => {
  const [columnsReferences] = useSelector(selector, shallowEqual);

  const handlePaginationChange = (pagination, filters, sorter) => {
    if (setPage) {
      setPage(pagination);
    } else {
      changeParams({
        page: pagination,
      });
    }
  };

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
      title: columnsReferences.columns.date,
      key: "date",
    },
    {
      title: columnsReferences.columns.home,
      key: "home",
    },
    {
      title: columnsReferences.columns.exchangedAmount,
      key: "exchangedAmount",
    },
    {
      title: columnsReferences.columns.description,
      key: "description",
    },
    {
      title: columnsReferences.columns.ota,
      key: "ota",
    },
    {
      title: columnsReferences.columns.receivingBank,
      key: "receivingBank",
    },
    {
      title: columnsReferences.columns.created_at,
      key: "created_at",
    },
    {
      title: columnsReferences.columns.state,
      key: "state",
    },
  ];

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
            // navigate({ pathname: `/asset/assetIssue/${data._id}` });
          },
        })}
        title={() => {
          return (
            <Flex flex justify="flex-end">
              <Button>Tạo đối soát thu</Button>
            </Flex>
          );
        }}
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
      <Detail />
    </Box>
  );
};

const Detail = () => {
  return (
    <WrapFlex mt={50}>
      <Row gutter={GUTTER}>
        <Col md={24}>
          <WrapFlex flex gap={5}>
            <Label>Hình thức đối soát:</Label>
            <Text>Email</Text>
          </WrapFlex>
          <WrapFlex flex gap={5}>
            <Label>Thời điểm nhận đối soát:</Label>
            <Text>{formatDateTime(new Date())}</Text>
          </WrapFlex>
          <WrapFlex flex gap={5}>
            <Label>Danh sách lệnh thu tiền:</Label>
            <Text>Email</Text>
          </WrapFlex>
        </Col>
        <Col md={24}>
          <table style={{ margin: "10px 0px" }} border={1} width="100%">
            <thead>
              <tr>
                <th style={{ width: "15%" }}>STT</th>
                <th>Đối tượng gửi</th>
                <th>Đối tượng nhận</th>
                <th>Số tiền</th>
                <th>Thời điểm thu</th>
                <th>Chi tiết lệnh thu</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="currency" align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center"></td>
              </tr>
            </tbody>
          </table>
        </Col>
      </Row>
    </WrapFlex>
  );
};

export const ColTable = styled.div`
  display: flex;
  flex-direction: column;
  margin: -1px;
  span {
    border-bottom: 1px solid rgba(0, 0, 0, 0.7);
    &:last-child {
      border-bottom: none;
    }
  }
`;

export default TableThirdPartyPaid;
