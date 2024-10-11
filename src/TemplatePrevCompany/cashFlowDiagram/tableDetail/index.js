import { connect } from "react-redux";
import { useRef, useState } from "react";
import _ from "lodash";
import { Empty, Breadcrumb } from "antd";
import styled from "styled-components";

import Table from "@components/tables/table.style";
import * as dataTable from "@containers/Finance/reportPayin/renderCol";
import { pageSizeOptions } from "@settings/const";
import { Box } from "@components/utility/styles";
import { minFormatMoney } from "@helpers/utility";

import * as dataTableCashFlow from "./rendercol";
import ToolExport from "../tool/toolExport";

function search(
  isGroupValue,
  data,
  { searchBookingId = "", searchOtaName = "", searchExchangedAmount = "", searchLabel = "" },
  mapData
) {
  if (searchBookingId || searchOtaName || searchExchangedAmount || searchLabel) {
    const bookingRegex = new RegExp(searchBookingId, "i");
    const otaNameRegex = new RegExp(searchOtaName, "i");
    const exChangedAmountRegex = new RegExp(searchExchangedAmount, "i");
    const labelRegex = new RegExp(searchLabel, "i");

    function someFilterGroup({ label }) {
      return !searchLabel || (label && label.match(labelRegex));
    }

    function someFilter({ bookingId, otaName = "", currencyAmount }) {
      return (
        (!searchBookingId ||
          (bookingId && _.get(_.get(mapData.bookings, bookingId), "otaBookingId").match(bookingRegex))) &&
        (!searchOtaName || (otaName && otaName.match(otaNameRegex))) &&
        (!searchExchangedAmount ||
          (currencyAmount && _.get(currencyAmount, "exchangedAmount").toString().match(exChangedAmountRegex)))
      );
    }
    return data.filter(item =>
      item.children ? item.children.some(isGroupValue ? someFilter : someFilterGroup) : someFilter(item)
    );
  }
  return data;
}

const TableDetail = ({
  CashFlow: { isLoading, data, dataGroup, dataType, mapData, columnReferences, columnsExcludeOf, totalRevenues },
  query,
  changeParams,
  dataCashFlow,
  dataGroups,
  listLineCashFlow,
  ...props
}) => {
  const [states, setStates] = useState({
    searchBookingId: "",
    searchOtaName: "",
    searchExchangedAmount: "",
    searchLabel: "",
  });

  const isGroupValue = Boolean(_.get(query, "groupValue"));

  const searchInput = useRef(null);

  const nameCashFlowSelected = query.node
    ? _.find(dataCashFlow, { objectKey: query.node })
    : query.flow
    ? _.find(listLineCashFlow, { line: parseInt(query.flow) })
    : "";

  const allColumnsGroup = [
    {
      title: (
        <Box flex justify="start" pl={10}>
          {columnReferences.other.order}
        </Box>
      ),
      key: "order",
      dataIndex: "order",
      width: 56,
      render: (data, item, i) => {
        const start = parseInt(_.get(query, "limit")) * parseInt(_.get(query, "page") - 1);
        const stt = start + (i + 1);
        return (
          <Box flex justify="start" pl={10}>
            {stt}
          </Box>
        );
      },
    },
    {
      title: <Box pr={10}>{columnReferences.commonColumns.otaName}</Box>,
      key: "label",
      dataIndex: "label",
      align: "center",
      width: 73,
      render: item => <div>{item}</div>,
      // ...dataTableCashFlow.getColumnSearchProps("searchLabel", setStates, states, searchInput),
    },
    {
      title: columnReferences.commonColumns.exchangedAmount,
      key: "amount",
      width: 125,
      sorter: dataTableCashFlow.sortAmount,
      render: data => {
        const renderAmount = dataTable.renderAmount(data);
        return <Box pr={10}>{renderAmount}</Box>;
      },
    },
  ];

  const allColumnsGroupDetail = [
    {
      title: (
        <Box flex justify="start" pl={10}>
          {columnReferences.other.order}
        </Box>
      ),
      key: "order",
      dataIndex: "order",
      width: 56,
      render: (data, item, i) => {
        const start = parseInt(_.get(query, "limit")) * parseInt(_.get(query, "page") - 1);
        const stt = start + (i + 1);
        return (
          <Box flex justify="start" pl={10}>
            {stt}
          </Box>
        );
      },
    },
    {
      title: columnReferences.commonColumns.category,
      key: "category",
      dataIndex: "categoryId",
      width: 120,
      render: categoryId => {
        const category = _.get(mapData.categories, categoryId);
        return _.get(category, "name");
      },
    },
    {
      title: columnReferences.commonColumns.otaName,
      key: "otaName",
      dataIndex: "otaName",
      align: "center",
      width: 73,
      render: dataTable.renderIconOTA,
      ...dataTableCashFlow.getColumnSearchProps("searchOtaName", setStates, states, searchInput),
    },
    {
      title: columnReferences.commonColumns.otaBookingId,
      key: "otaBookingId",
      dataIndex: "bookingId",
      render: bookingId => {
        const booking = _.get(_.get(mapData.bookings, bookingId), "otaBookingId");
        return (
          <a href={`/reservations/${bookingId}/pricing`} rel="noopener noreferrer" target="_blank">
            {booking}
          </a>
        );
      },
      align: "center",
      width: 128,
      ...dataTableCashFlow.getColumnSearchProps("searchBookingId", setStates, states, searchInput),
    },
    {
      title: columnReferences.commonColumns.exportNo,
      key: "exportNo",
      dataIndex: "export",
      width: 100,
      render: dataTableCashFlow.renderExportNo,
    },
    {
      title: columnReferences.commonColumns.exchangedAmount,
      key: "exchangedAmount",
      width: 125,
      dataIndex: "currencyAmount",
      sorter: dataTableCashFlow.sortExchangedAmount,
      render: dataTable.renderExchangedAmount,
      ...dataTableCashFlow.getColumnSearchProps("searchExchangedAmount", setStates, states, searchInput),
    },
    {
      title: columnReferences.commonColumns.rooms,
      key: "rooms",
      width: 110,
      dataIndex: "roomIds",
      render: roomIds => {
        const rooms = _.map(roomIds, roomId => _.get(mapData.rooms, roomId));
        return <span>{_.map(rooms, room => _.get(room, "info.roomNo")).join(", ")}</span>;
      },
    },
    {
      title: columnReferences.commonColumns.block,
      key: "block",
      width: 120,
      dataIndex: "blockIds",
      render: blockIds => {
        return <>{_.map(blockIds, block => _.get(_.get(mapData.blocks, block), "info.name")).join(", ")}</>;
      },
    },
    {
      title: columnReferences.commonColumns.state,
      key: "state",
      width: 115,
      dataIndex: "state",
      render: dataTableCashFlow.renderState,
    },
    {
      title: columnReferences.commonColumns.createdAt,
      key: "createdAt",
      width: 100,
      dataIndex: "createdAt",
      sorter: dataTableCashFlow.sorterCreatedAt,
      render: dataTable.renderCreatedAt,
    },
    {
      title: columnReferences.commonColumns.payoutType,
      key: "payoutType",
      width: 120,
      dataIndex: "payoutType",
      render: dataTable.renderPayoutType,
    },
    {
      title: columnReferences.commonColumns.checkin,
      key: "checkin",
      width: 120,
      sorter: ({ bookingId: a }, { bookingId: b }) => dataTableCashFlow.sorterCheckin({ a, b }, mapData),
      render: ({ bookingId }) => dataTableCashFlow.renderCheckin(bookingId, mapData),
    },
    {
      title: columnReferences.commonColumns.checkout,
      key: "checkout",
      width: 120,
      sorter: ({ bookingId: a }, { bookingId: b }) => dataTableCashFlow.sorterCheckout({ a, b }, mapData),
      render: ({ bookingId }) => dataTableCashFlow.renderCheckout(bookingId, mapData),
    },
    {
      title: columnReferences.commonColumns.source,
      key: "source",
      width: 100,
      dataIndex: "source",
      render: dataTable.renderSource,
    },
    {
      title: columnReferences.commonColumns.createdBy,
      dataIndex: "createdBy",
      key: "createdBy",
      width: 140,
      render: createdBy => {
        const createdByInfo = _.get(mapData.users, createdBy);
        return <>{_.get(createdByInfo, "name") || _.get(createdByInfo, "username")}</>;
      },
    },
    {
      title: columnReferences.commonColumns.collector,
      dataIndex: "collector",
      key: "collector",
      width: 155,
      render: collector => {
        const collectorInfo = _.get(mapData.users, collector);
        return <>{_.get(collectorInfo, "name") || _.get(collectorInfo, "username")}</>;
      },
    },
    {
      title: columnReferences.commonColumns.description,
      dataIndex: "description",
      key: "description",
      width: 155,
      render: description => description,
    },
  ];

  const activeColKeys = dataType === "pay" ? columnsExcludeOf.pay : columnsExcludeOf.reservation;
  const activeColumns = allColumnsGroupDetail.filter(({ key }) => !activeColKeys.includes(key));

  const dataSource = search(isGroupValue, isGroupValue ? data : dataGroup, states, mapData);

  const handlePaginationChange = (pagination, filters, sorter) => {
    changeParams({
      limit: filters,
      page: pagination,
    });
  };

  if (_.get(query, "page") * _.get(query, "limit") - data.length === _.get(query, "limit")) {
    return <Empty />;
  }

  const totalAmount = _.sumBy(isGroupValue ? data : dataGroup, isGroupValue ? "currencyAmount.amount" : "amount") || 0;

  return (
    <CsTable
      rowKey={isGroupValue ? "_id" : "groupValue"}
      bordered
      columns={isGroupValue ? activeColumns : allColumnsGroup}
      loading={isLoading}
      dataSource={dataSource || []}
      onRow={row =>
        !isGroupValue && {
          onClick: () =>
            changeParams({
              groupValue: _.get(row, "groupValue"),
            }),
        }
      }
      title={
        nameCashFlowSelected
          ? () => {
              const nameTable = _.get(query, "node")
                ? nameCashFlowSelected.objectName
                : _.get(query, "flow")
                ? nameCashFlowSelected.label
                : "";
              const nameGroup = _.find(dataGroup, group => _.get(group, "groupValue") === _.get(query, "groupValue"));
              return (
                <Box flex>
                  <Box flex justify="start">
                    <Breadcrumb>
                      <Breadcrumb.Item>
                        <Text onClick={() => changeParams({ groupValue: undefined })}>{nameTable}</Text>
                      </Breadcrumb.Item>
                      {isGroupValue && (
                        <Breadcrumb.Item>
                          <Text>{_.get(nameGroup, "label")}</Text>
                        </Breadcrumb.Item>
                      )}
                    </Breadcrumb>
                  </Box>
                  <Box flex alignItem="center" gap={15} justify="end">
                    <div className="text-right">
                      <b>Tổng tiền:</b> <span className="text-green">{`${minFormatMoney(totalAmount)} VND`}</span>
                    </div>
                    {isGroupValue && (
                      <ToolExport
                        data={data}
                        query={query}
                        title={nameTable}
                        mapData={mapData}
                        activeColKeys={activeColKeys}
                        dataType={dataType}
                      />
                    )}
                  </Box>
                </Box>
              );
            }
          : false
      }
      scroll={{
        x: (isGroupValue ? allColumnsGroupDetail : allColumnsGroup).reduce((acc, { width }) => acc + width, 0),
      }}
      rowClassName={dataTable.rowClassName}
      pagination={{
        pageSize: parseInt(_.get(query, "limit")),
        current: parseInt(_.get(query, "page")),
        total: totalRevenues,
        showSizeChanger: true,
        pageSizeOptions,
        showTotal: (total, range) => {
          return `Showing ${range[0]}-${range[1]} of ${total} Results`;
        },
        onChange: handlePaginationChange,
      }}
    />
  );
};

const CsTable = styled(Table)``;

const Text = styled.span`
  cursor: pointer;
  &:hover {
    color: rgb(24, 180, 201);
  }
`;

export default connect(({ CashFlow, App, Categories: { houses } }) => ({
  CashFlow: CashFlow.cashFlowDetail,
  houses: houses.data,
  App,
}))(TableDetail);
