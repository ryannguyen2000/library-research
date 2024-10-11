import { useSelector, shallowEqual } from "react-redux";
import { useCallback, useContext, useEffect, useState } from "react";
import _ from "lodash";
import { connect } from "react-redux";
import { Row, Col, Form, Tooltip } from "antd";
import styled from "styled-components";
import moment from "moment";
import { EditOutlined } from "@ant-design/icons";

import { Box as Wrap } from "@components/utility/styles";
import Table from "@components/tables/table.style";
import newExpenseActions from "@redux/accounting/expense/newExpense/actions";
import client from "@helpers/client";
import ModalQr from "@containers/Finance/payout/tool/modalQr";
import { PAYMENT_PRIORITY, pageSizeOptions } from "@settings/const";
import { PriorityTag } from "@containers/Finance/payout/tool/toolFilter";
import { renderPriority } from "@containers/Task/AssetIssue/tool/renderCol";

import { ModalContextNewExpense } from "./tool/modalContext";
import * as dataTable from "./renderCol";
import BtnConform, { CsButton } from "./components/btnConform";
import BtnDownFile from "./components/btnDownFile";
import ModalNewExpense from "./tool/modalNewExpense";

const selector = state => [state.accounting.expense.newExpense.columnsReferences];

const TableNewExpense = ({
  changeParams,
  data,
  totalData,
  loading,
  page,
  pageSize,
  columnReferencesPayout,
  refreshNewExpense,
}) => {
  const [expandedRows, setExpandedRows] = useState([]);

  const { setState } = useContext(ModalContextNewExpense);

  const [columnsReferences] = useSelector(selector, shallowEqual);

  const [statesModalUpdate, setStatesModalUpdate] = useState({
    open: false,
    _id: "",
  });

  const onToggle = _id => {
    setStatesModalUpdate({ open: !statesModalUpdate.open, _id });
    setExpandedRows(prevExpandedRows => {
      if (_id) {
        return [...prevExpandedRows, _id];
      } else {
        return prevExpandedRows.filter(key => key !== _id);
      }
    });
  };

  const columns = [
    {
      title: columnsReferences.columns.no,
      dataIndex: "no",
      width: 90,
      key: "no",
    },
    {
      title: columnsReferences.columns.amount,
      key: "amount",
      render: dataTable.renderAmount,
    },
    {
      title: columnsReferences.columns.status,
      dataIndex: "payouts",
      key: "status",
      width: 110,
      render: payouts =>
        _.uniqBy(payouts, "status").map(p => (
          <span key={p.status} style={{ marginRight: 4 }}>
            {dataTable.renderStatus(p.status)}
          </span>
        )),
    },
    {
      title: columnsReferences.columns.priority,
      dataIndex: "priority",
      key: "priority",
      width: 100,
      render: renderPriority,
    },
    {
      title: columnsReferences.columns.description,
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Nguồn chi",
      key: "debitAccount",
      render: data => {
        return `${_.get(data, "debitAccountId.shortName")} - ${_.get(data, "debitAccountId.accountNos[0]")}`;
      },
    },
    {
      title: columnsReferences.columns.createdAt,
      dataIndex: "createdAt",
      key: "createdAt",
      render: dataTable.renderCreatedAt,
    },
    {
      title: columnsReferences.columns.createdBy,
      key: "createdBy",
      render: dataTable.renderCreatedBy,
    },
    {
      title: columnsReferences.other.action,
      key: "qr",
      width: 130,
      zIndex: 99,
      fixed: "right",
      render: dataRow => {
        const isInfo = _.get(dataRow, "approvedAt");
        const api = `/payment/pay/request/${_.get(dataRow, "_id")}/qr`;

        const switchUI = payMethod => {
          const id = _.get(dataRow, "_id");
          const refresh = refreshNewExpense;
          if (payMethod) {
            switch (payMethod) {
              case "auto_banking":
                return (
                  <>
                    <BtnConform type="approve" id={id} refresh={refresh} key="auto_banking_approve" />
                    <BtnConform type="reject" id={id} refresh={refresh} key="auto_banking_reject" />
                    <BtnConform type="delete" id={id} refresh={refresh} key="auto_banking_delete" />
                  </>
                );
              case "manual_banking":
                return <BtnConform type="delete" id={id} refresh={refresh} key="manual_banking_delete" />;
              case "viet_qr":
                return (
                  <>
                    <ModalQr api={api} />
                    <BtnConform type="delete" id={id} refresh={refresh} key="viet_qr_delete" />
                  </>
                );
              case "file_bulk":
                return (
                  <>
                    <BtnDownFile id={id} key="file_bulk_file" />
                    <BtnConform type="delete" id={id} refresh={refresh} key="file_bulk_delete" />
                  </>
                );
              default:
                break;
            }
          } else if (_.get(dataRow, "status") === "WAITING") {
            const bodyReq = {
              payDebitAccountId: _.get(dataRow, "debitAccountId._id"),
              description: _.get(dataRow, "description") || "",
              payDescription: _.get(dataRow, "payDescription") || "",
              priority: _.get(dataRow, "priority"),
              status: "WAIT_FOR_APPROVE",
            };
            return (
              <>
                <BtnConform type="create" id={id} refresh={refresh} bodyReq={bodyReq} key="waiting_create" />
                <Tooltip placement="top" title="Cập nhật">
                  <CsButton
                    // style={{ fontWeight: 500, textTransform: "uppercase", fontSize: "13px" }}
                    type="text"
                    icon={<EditOutlined width={13} />}
                    onClick={e => {
                      e.stopPropagation();
                      onToggle(id);
                    }}
                  />
                </Tooltip>
                <BtnConform type="delete" id={id} refresh={refresh} key="waiting_delete" />
              </>
            );
          }
        };
        return (
          <>
            {isInfo ? (
              <Wrap flex fontSize="12px">
                {_.get(dataRow, "approvedBy.name")
                  ? `${_.get(dataRow, "approvedBy.name") || _.get(dataRow, "approvedBy.username")} - `
                  : ""}
                {moment(_.get(dataRow, "approvedAt")).format("HH:mm DD/MM")}{" "}
              </Wrap>
            ) : (
              switchUI(_.get(dataRow, "payMethod"))
            )}
          </>
        );
      },
    },
  ];

  const expandedRowRender = row => {
    return (
      <ExpandedRowRender
        columnReferencesPayout={columnReferencesPayout}
        row={row}
        expandedRows={expandedRows}
        setState={setState}
        onToggle={onToggle}
        statesModalUpdate={statesModalUpdate}
      />
    );
  };
  const handleRowExpand = (expanded, record) => {
    setExpandedRows(prevExpandedRows => {
      if (expanded) {
        return [...prevExpandedRows, record._id];
      } else {
        return prevExpandedRows.filter(key => key !== record._id);
      }
    });
  };

  return (
    <Table
      rowKey="_id"
      loading={loading}
      dataSource={data || []}
      rowClassName={"custom-row-class"}
      columns={columns}
      scroll={{
        x: "max-content",
      }}
      expandable={{
        expandedRowRender,
        onExpand: handleRowExpand,
      }}
      expandedRowKeys={expandedRows}
      pagination={{
        pageSize,
        current: page,
        total: Number(totalData) || 0,
        showSizeChanger: true,
        pageSizeOptions,
        showTotal: (total, range) => {
          return `Showing ${range[0]}-${range[1]} of ${total} Results`;
        },
        onChange: (pagination, filters, sorter) => {
          changeParams({
            page: pagination,
            limit: filters,
          });
        },
      }}
    />
  );
};

const ExpandedRowRender = ({ row, columnReferencesPayout, expandedRows, setState, statesModalUpdate, onToggle }) => {
  const [states, setStates] = useState({
    data: {},
    isLoading: false,
  });
  const [isCalled, setCalled] = useState(false);

  const isAcceptedUpdate = _.get(statesModalUpdate, "open") && _.includes([_.get(row, "_id")], statesModalUpdate._id);

  const getDataDetail = useCallback(async () => {
    setStates(prev => ({ ...prev, isLoading: true }));
    const isExist = _.includes(expandedRows, _.get(row, "_id"));
    if (!isCalled && isExist) {
      const { error_code, data } = await client().get(`/payment/pay/request/${_.get(row, "_id")}`);
      if (error_code === 0) {
        setStates(prev => ({ ...prev, data: data.request }));
        setCalled(true);
      }
    }
    setStates(prev => ({ ...prev, isLoading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRows]);

  const refresh = async () => {
    setStates(prev => ({ ...prev, isLoading: true }));
    const { error_code, data } = await client().get(`/payment/pay/request/${_.get(row, "_id")}`);
    if (error_code === 0) {
      setStates(prev => ({ ...prev, data: data.request }));
    }
    setStates(prev => ({ ...prev, isLoading: false }));
  };

  const onCell = data => {
    return {
      onClick: () => {
        setState({
          open: true,
          data: _.get(data, "payoutId"),
          refresh: refresh,
        });
      },
    };
  };

  const allColumns = [
    {
      title: columnReferencesPayout.other.order,
      key: "order",
      width: 40,
      onCell,
      render: (data, item, i) => i + 1,
    },
    {
      title: columnReferencesPayout.payout.category,
      key: "category",
      dataIndex: "payoutId",
      width: 120,
      onCell,
      render: dataTable.renderCategory,
    },
    {
      title: columnReferencesPayout.payout.currencyAmount,
      key: "currencyAmount",
      dataIndex: "payoutId",
      width: 120,
      align: "right",
      onCell,
      render: dataTable.renderAmount,
    },
    {
      title: columnReferencesPayout.payout.exportNo,
      key: "exportNo",
      dataIndex: "payoutId",
      width: 100,
      render: data => {
        return <>{dataTable.renderExportNo(_.get(data, "export"))}</>;
      },
    },
    {
      title: columnReferencesPayout.payout.blockIds,
      key: "blockIds",
      width: 170,
      dataIndex: "payoutId",
      onCell,
      render: dataTable.renderHome,
    },
    {
      title: "Người nhận",
      key: "creditAccount",
      dataIndex: "creditAccountId",
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
      dataIndex: "payoutId",
      onCell,
      render: dataTable.renderSource,
    },
    {
      title: columnReferencesPayout.payout.createdAt,
      key: "createdAt",
      width: 100,
      dataIndex: "payoutId",
      sorter: true,
      onCell,
      render: data => {
        return dataTable.renderCreatedAt(_.get(data, "createdAt"));
      },
    },
    {
      title: columnReferencesPayout.payout.createdBy,
      dataIndex: "payoutId",
      key: "createdBy",
      width: 140,
      onCell,
      render: dataTable.renderCreatedBy,
    },
    {
      title: "#",
      dataIndex: "payoutId",
      key: "_id",
      width: 90,
      zIndex: 99,
      fixed: "right",
      render: (pId, r) => {
        return (
          <>
            {r.status !== "SUCCESS" && <ModalQr api={`/payment/${_.get(pId, "_id")}/qr`} />}
            {(r.reported || r.status !== "WAITING") && (
              <BtnConform
                id={_.get(row, "_id")}
                refresh={refresh}
                bodyReq={{ payoutId: _.get(pId, "_id"), undo: r.reported }}
                key="report"
                type={r.reported ? "undoReport" : "report"}
              />
            )}
          </>
        );
      },
    },
  ];

  const priorityObj =
    _.find(PAYMENT_PRIORITY, p => p.value === _.toString(_.get(states.data, "priority"))) || PAYMENT_PRIORITY[0];

  useEffect(() => {
    getDataDetail();
  }, [getDataDetail]);

  return (
    <div style={{ display: "block" }}>
      {isAcceptedUpdate && (
        <ModalNewExpense
          type="update"
          data={states.data}
          refresh={refresh}
          openModal={_.get(statesModalUpdate, "open")}
          toggleModal={onToggle}
        />
      )}
      <Table
        title={() => {
          return (
            <Row style={{ margin: 0, justifyContent: "space-between" }}>
              <Col xs={24}>
                <FormItem label="Nguồn chi">{dataTable.debitAccount(_.get(states, "data"))}</FormItem>
              </Col>
              <Col xs={24} md={6}>
                <FormItem label="Cấp độ chi">
                  <PriorityTag className={`bg-${_.get(priorityObj, "value")}`}>
                    {_.get(priorityObj, "label")}
                  </PriorityTag>
                </FormItem>
              </Col>
              <Col xs={24} md={18}>
                <FormItem>
                  <p style={{ color: "#18b4c9" }}>{_.get(states.data, "mergeTransaction") && "Gộp giao dịch"}</p>
                </FormItem>
              </Col>
              <Col xs={24}>
                <FormItem label="Mô tả">{_.get(states.data, "description")}</FormItem>
              </Col>
              <Col xs={24}>
                <FormItem label="Nội dụng chi">{_.get(states.data, "payDescription")}</FormItem>
              </Col>
            </Row>
          );
        }}
        rowKey="_id"
        loading={states.isLoading}
        columns={allColumns}
        dataSource={_.get(states.data, "payouts") || []}
        scroll={{
          x: "max-content",
        }}
        pagination={false}
      />
    </div>
  );
};

const FormItem = styled(Form.Item)`
  &.ant-form-item {
    margin-bottom: 5px;
  }
  .ant-form-item-label > label {
    font-weight: 500;
  }
`;

export default connect(
  ({ payout, Categories: { houses } }) => ({
    columnReferencesPayout: payout.columnReferences,
    houses: houses.data,
  }),
  {
    refreshNewExpense: newExpenseActions.refresh,
  }
)(TableNewExpense);
