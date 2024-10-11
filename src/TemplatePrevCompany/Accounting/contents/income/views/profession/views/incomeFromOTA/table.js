import { useSelector, shallowEqual } from "react-redux";
import { useState } from "react";
import { Button } from "antd";
import _ from "lodash";

import Table from "@components/tables/table.style";
import { Box as WrapFlex } from "@components/utility/styles";
import { limit } from "@containers/Accounting/const";
import client from "@helpers/client";
import AntModal from "@components/feedback/modal";
import IntlMessages from "@components/utility/intlMessages";
import { minFormatMoney } from "@helpers/utility";

import * as dataTable from "./renderCol";
import ExpandedRowReportRender from "./tableReported";
import CsTooltip from "./Tooltip";

const selector = state => [state.accounting.income.profession.incomeFromOTA.columnsReferences];

const TableIncomeProfession = ({ changeParams, data, loading, total, page, setPage, pageSize }) => {
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
        const start = pageSize * (page - 1);
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
      dataIndex: "date",
      key: "date",
    },
    {
      title: columnsReferences.columns.home,
      dataIndex: "propertyName",
      key: "home",
    },
    {
      title: columnsReferences.columns.exchangedAmount,
      key: "totalAmount",
      render: dataTable.rendertotalAmount,
    },
    {
      title: columnsReferences.columns.ota,
      dataIndex: "otaName",
      key: "otaName",
      render: dataTable.renderIconOTA,
    },
    {
      title: columnsReferences.columns.paymentMethodName,
      key: "paymentMethodName",
      render: data => {
        const isBankAccountInfo = _.get(data, "bankAccountInfo");
        const renderInfo = () => {
          return Object.entries(isBankAccountInfo).map(([key, value]) => (
            <div key={key}>
              <span>
                <IntlMessages id={key} />: &nbsp;
                {value}
              </span>
            </div>
          ));
        };
        return isBankAccountInfo ? (
          <CsTooltip placement="top" title={renderInfo}>
            <>{_.get(data, "paymentMethodName")}</>
          </CsTooltip>
        ) : (
          <>{_.get(data, "paymentMethodName")}</>
        );
      },
    },
    {
      title: columnsReferences.columns.status,
      dataIndex: "status",
      key: "status",
      render: dataTable.renderStatus,
    },
  ];

  const expandedRowRender = row => {
    return <ExpandedRowRender row={row} loading={loading} />;
  };

  return (
    <Table
      rowKey="propertyId"
      loading={loading}
      columns={allColumns}
      rowClassName={"custom-row-class"}
      dataSource={data || []}
      scroll={{
        x: "max-content",
      }}
      expandable={{
        expandedRowRender,
      }}
      pagination={
        Number(total) > Number(limit) && {
          pageSize: limit,
          current: Number(page) || 1,
          total: Number(total),
          hiddenOnSingPage: true,
          showSizeChanger: false,
          onChange: handlePaginationChange,
        }
      }
    />
  );
};

const titleColumns = {
  guest: "Khách",
  source: "Nguồn",
  booking_id: "Booking ID",
  amount: "Số tiền thu",
  amount_VND: "Số tiền thu (VND)",
  amountToSale: "Doanh thu bán hàng",
  amountFromOTA: "Doanh thu từ OTA",
  amountToOTA: "Chi phí cho OTA",
  status: "Trạng thái",
  booked: "Ngày đặt phòng",
  checkIn: "Check in",
  checkOut: "Check out",
};

const ExpandedRowRender = ({ row, loading }) => {
  const [selected, setSelected] = useState(_.get(row, "transactions"));
  const [states, setStates] = useState({
    dataReport: {},
    isLoadingPosted: false,
  });

  const handleReport = async () => {
    AntModal.confirm({
      title: "Bạn có muốn tạo thu từ OTA?",
      maskClose: true,
      onOk: async () => {
        setStates(prev => ({ ...prev, isLoadingPosted: true }));
        const newRow = _.omit(row, ["transactions", "blockId"]);
        const newDataReq = _.assign({}, newRow, { transactions: selected });
        const { data, error_code } = await client().post(`/finance/collection/awaiting`, newDataReq);
        if (error_code === 0) {
          setStates(prev => ({ ...prev, dataReport: data }));
        }
        setStates(prev => ({ ...prev, isLoadingPosted: false }));
      },
    });
  };

  const columns = [
    {
      title: "STT",
      key: "stt",
      width: 50,
      render: (data, row, index) => index + 1,
    },
    {
      title: titleColumns.guest,
      dataIndex: "guestName",
      key: "guest",
      width: 200,
    },
    {
      title: titleColumns.source,
      dataIndex: "otaName",
      key: "otaName",
      width: 73,
      render: dataTable.renderIconOTA,
    },
    {
      title: titleColumns.booking_id,
      key: "booking_id",
      width: 128,
      render: dataTable.renderBookingId,
    },
    {
      title: titleColumns.amountToSale,
      key: "amountToSale",
      render: dataTable.renderAmountToSale,
    },
    {
      title: titleColumns.amountFromOTA,
      key: "amountFromOTA",
      render: dataTable.renderAmountFromOTA,
    },
    {
      title: titleColumns.amountToOTA,
      key: "amountToOTA",
      render: dataTable.renderAmountToOTA,
    },
    {
      title: titleColumns.amount,
      key: "amount",
      render: dataTable.renderAmount,
    },
    {
      title: titleColumns.status,
      dataIndex: "status",
      key: "status",
    },
    {
      title: titleColumns.booked,
      dataIndex: "booked",
      key: "booked",
    },
    {
      title: titleColumns.checkIn,
      dataIndex: "checkIn",
      key: "checkIn",
    },
    {
      title: titleColumns.checkOut,
      dataIndex: "checkOut",
      key: "checkOut",
    },
  ];

  const newArrAjuct = _.filter(_.get(row, "transactions"), item => _.get(item, "adjustment"));

  const getCheckboxProps = record => {
    return {
      disabled: newArrAjuct.some(f => f.id === record.id),
    };
  };

  const rowSelection = {
    onChange: (selectedRowKeys, selectedRows) => {
      setSelected(selectedRows);
    },
    getCheckboxProps,
  };

  const isReported = !_.isEmpty(states.dataReport);

  return (
    <div style={{ display: "block" }}>
      {isReported ? (
        <ExpandedRowReportRender dataRes={states} dataReq={selected} columns={columns} />
      ) : (
        <>
          <WrapFlex flex gap={15} style={{ justifyContent: "flex-start" }}>
            <Button
              disabled={_.isEmpty(selected)}
              type="primary"
              onClick={handleReport}
              loading={states.isLoadingPosted}
            >
              Tạo thu
            </Button>
          </WrapFlex>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={_.get(row, "transactions")}
            title={() => {
              const total_amount = _.sumBy(selected, "amount");
              return (
                <div>
                  <b>Tổng tiền:</b>&nbsp;
                  <span
                    className={`w-100 text-right ${total_amount >= 0 ? "text-green" : "text-red"}`}
                  >{`${minFormatMoney(total_amount)}`}</span>
                </div>
              );
            }}
            rowSelection={{
              type: "checkbox",
              selectedRowKeys: _.map(selected, item => _.get(item, "id")),
              // checkStrictly
              ...rowSelection,
            }}
            scroll={{
              x: "max-content",
            }}
            pagination={false}
          />
        </>
      )}
    </div>
  );
};

export default TableIncomeProfession;
