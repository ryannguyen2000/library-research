import { useContext, useEffect, useState } from "react";
import { Modal, Button, Form, Row, Col, Input, Select, message, Checkbox } from "antd";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import _ from "lodash";
import { EditOutlined } from "@ant-design/icons";

// import houseActions from "@redux/categories/house/actions";
// import paymentActions from "@redux/categories/payments/actions";
import payoutActions from "@redux/payout/actions";
import newExpenseActions from "@redux/accounting/expense/newExpense/actions";
import { minFormatMoney } from "@helpers/utility";
import client from "@helpers/client";

import PayAccount from "@components/uidata/PayAccount";
import { PAYMENT_PRIORITY, pageSizeOptions } from "@settings/const";
import { PriorityTag } from "@containers/Finance/payout/tool/toolFilter";
import Table from "@components/tables/table.style";
import * as dataTablePayout from "@containers/Finance/reportPayout/renderCol";

import { columnsPayout } from "../components/columnsPayout";
import { ModalContextNewExpense } from "./modalContext";
import ModalUpdate from "./modalUpdate";
// import { CsButton } from "../components/btnConform";
import FormItem from "@containers/Accounting/container/FormItem";

const { TextArea } = Input;
const { Option } = Select;

const initParams = data => {
  const stringPriority = priority => {
    switch (priority) {
      case 0:
        return "0";
      case 1:
        return "1";
      case 2:
        return "2";
      default:
        break;
    }
  };

  const selectedPayouts = _.get(data, "payouts") || [];
  const dataPayoutIds = _.map(selectedPayouts, "_id");

  return {
    payoutIds: dataPayoutIds || [],
    selectedPayouts,
    payDebitAccountId: _.get(data, "debitAccountId._id") || "",
    description: _.get(data, "description") || "",
    payDescription: _.get(data, "payDescription") || "",
    priority: stringPriority(_.get(data, "priority")),
    status: _.get(data, "status") ? true : false,
    mergeTransaction: _.get(data, "mergeTransaction"),
  };
};

const ModalNewExpense = ({ toggleModal, openModal, refresh, type, data }) => {
  const [loading, setLoading] = useState(false);

  const [params, setParams] = useState(initParams);

  const [formRef] = Form.useForm();

  const dispatch = useDispatch();

  const content = {
    create: {
      title: "Tạo lệnh chi",
      btnText: "Tạo lệnh",
      icon: (
        <span>
          <i className="ion-android-add" />
        </span>
      ),
    },
    update: {
      title: "Cập nhật lệnh chi",
      btnText: "",
      icon: <EditOutlined width={13} />,
    },
  };
  const isCreate = type === "create";
  const title = type ? content[type].title : "";

  const onCreate = async () => {
    setLoading(true);

    await formRef
      .validateFields()
      .then(async values => {
        const bodyReq = {
          payoutIds: params.payoutIds,
          payDebitAccountId: _.get(values, "payDebitAccountId"),
          description: _.get(values, "description"),
          payDescription: _.get(values, "payDescription"),
          priority: Number(_.get(values, "priority")),
          mergeTransaction: _.get(values, "mergeTransaction"),
          status: _.get(values, "status") ? "WAITING" : undefined,
        };
        const { error_code } = await client().post(`/payment/pay/request`, bodyReq);
        if (error_code === 0) {
          message.success("Tạo lệnh chi thành công.");
          // props.reFreshNewExpense();
          dispatch(newExpenseActions.refresh());
          formRef.setFieldsValue(initParams());

          onToggle();
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onUpdate = async () => {
    setLoading(true);

    await formRef
      .validateFields()
      .then(async values => {
        const bodyReq = {
          payDebitAccountId: _.get(values, "payDebitAccountId"),
          description: _.get(values, "description"),
          payDescription: _.get(values, "payDescription"),
          priority: Number(_.get(values, "priority")),
          mergeTransaction: _.get(values, "mergeTransaction"),
          status: _.get(values, "status") ? "WAITING" : undefined,
        };
        const { error_code } = await client().put(`/payment/pay/request/${_.get(data, "_id")}`, bodyReq);
        if (error_code === 0) {
          message.success("Cập nhật lệnh chi thành công.");

          if (refresh) {
            refresh();
          }
          // formRef.setFieldsValue(initParams());
          onToggle();
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onChangePayoutIds = payouts => {
    setParams(prev => ({ ...prev, payoutIds: _.map(payouts, "_id"), selectedPayouts: payouts }));
  };

  const onToggle = () => {
    toggleModal();
  };

  // const renderBtn = type && (
  //   <Tooltip placement="top" title="Cập nhật">
  //     <CsButton
  //       style={{ fontWeight: 500, textTransform: "uppercase", fontSize: "13px" }}
  //       type="text"
  //       icon={content[type].icon}
  //       onClick={onToggle}
  //     >
  //       {content[type].btnText}
  //     </CsButton>
  //   </Tooltip>
  // );

  // useEffect(() => {
  //   if (openModal) {
  //     fetchPaypout({
  //       payStatus: "WAITING,ERROR",
  //       start: statePagi.limit * (statePagi.page - 1) || 0,
  //       limit: statePagi.limit || 10,
  //     });
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [statePagi, openModal]);

  useEffect(() => {
    if (data) {
      setParams(initParams(data));
      formRef.setFieldsValue(initParams(data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      {/* {!isCreate && renderBtn} */}
      <Modal
        width={1050}
        open={openModal}
        onCancel={onToggle}
        title={title}
        footer={[
          <Button key="closeButton" onClick={toggleModal}>
            Đóng
          </Button>,
          <Button key="addButton" loading={loading} type="primary" onClick={type === "update" ? onUpdate : onCreate}>
            Lưu
          </Button>,
        ]}
      >
        <FormCreate isCreate={isCreate} data={data} formRef={formRef} params={params} setParams={setParams} />
        {isCreate && (
          <FormPayoutSelect
            type={type}
            openModal={openModal}
            // setState={setState}
            // dataPayout={payouts}
            selectedIds={params.payoutIds}
            selectedPayouts={params.selectedPayouts}
            // totalPayouts={_.get(props, "totalPayouts") || 0}
            // columnReferencesPayout={columnReferencesPayout}
            // fetchPaypout={fetchPaypout}
            // loadingPayouts={loadingPayouts}
            onChangePayoutIds={onChangePayoutIds}
            // statePagi={statePagi}
            // setStatePagi={setStatesPagi}
          />
        )}
      </Modal>
    </>
  );
};

const FormCreate = ({ params, formRef, isCreate }) => {
  return (
    <Form form={formRef} layout="vertical">
      <Row style={{ margin: 0, justifyContent: "space-between" }} gutter={[12]}>
        <Col xs={24} md={12}>
          <FormItem
            rules={[{ required: true, message: "Chọn nguồn chi!" }]}
            label="Nguồn chi"
            name="payDebitAccountId"
            initialValue={params.payDebitAccountId}
          >
            <PayAccount transType="debit" defaultData={params.payDebitAccountId} />
          </FormItem>
        </Col>
        <Col xs={24} md={isCreate ? 12 : 6}>
          <FormItem label="Cấp độ chi" name="priority" initialValue={params.priority}>
            <Select className="w-100" allowClear>
              {_.map(PAYMENT_PRIORITY, (p, index) => {
                return (
                  <Option key={index} value={p.value}>
                    <PriorityTag className={`bg-${p.value.toString()}`}>{p.label}</PriorityTag>
                  </Option>
                );
              })}
            </Select>
          </FormItem>
        </Col>
        <Col xs={24} md={6}>
          <FormItem
            label="Gộp giao dịch"
            labelCol={{ sm: 14 }}
            wrapperCol={{ sm: 10 }}
            name="mergeTransaction"
            valuePropName="checked"
            initialValue={params.mergeTransaction}
          >
            <Checkbox />
          </FormItem>
        </Col>
        {isCreate && (
          <Col xs={24} md={18}>
            <FormItem
              label="Lệnh nháp"
              labelCol={{ sm: 14 }}
              wrapperCol={{ sm: 10 }}
              name="status"
              valuePropName="checked"
              initialValue={params.status}
            >
              <Checkbox />
            </FormItem>
          </Col>
        )}

        <Col xs={24} md={12}>
          <FormItem label="Mô tả" name="description" initialValue={params.description}>
            <TextArea
              placeholder="Nhập mô tả.."
              autoSize={{
                minRows: 2,
                maxRows: 6,
              }}
            />
          </FormItem>
        </Col>
        <Col xs={24} md={12}>
          <FormItem label="Nội dụng chi" name="payDescription" initialValue={params.payDescription}>
            <TextArea
              placeholder="Nhập nội dung chi.."
              autoSize={{
                minRows: 2,
                maxRows: 6,
              }}
            />
          </FormItem>
        </Col>
      </Row>
    </Form>
  );
};

const FormPayoutSelect = ({ onChangePayoutIds, selectedIds, openModal, selectedPayouts, ...props }) => {
  const [statePagi, setStatePagi] = useState({
    page: 1,
    limit: 10,
  });

  const { setState } = useContext(ModalContextNewExpense);

  const [dataPayout, totalPayouts, loadingPayouts, columnReferencesPayout] = useSelector(
    state => [state.payout.data, state.payout.totalRevenues, state.payout.isLoading, state.payout.columnReferences],
    shallowEqual
  );

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(
      payoutActions.fetch({
        payStatus: "WAITING,ERROR",
        start: statePagi.limit * (statePagi.page - 1) || 0,
        limit: statePagi.limit || 10,
      })
    );
  }, [dispatch, statePagi]);

  const onCell = data => {
    return {
      onClick: () => {
        setState({
          open: true,
          data,
          refresh: () =>
            dispatch(
              payoutActions.fetch({
                payStatus: "WAITING,ERROR",
                start: statePagi.limit * (statePagi.page - 1) || 1,
                limit: statePagi.limit || 10,
              })
            ),
        });
      },
    };
  };

  const getCheckboxProps = record => {
    if (props.type === "update") {
      return {
        disabled: [],
      };
    }
  };

  const rowSelection = {
    onChange: (selectedRowKeys, selectedRows) => {
      const currentPageNotSelected = _.map(dataPayout, "_id").filter(id => !selectedRowKeys.includes(id));

      const newRowKeys = selectedPayouts.filter(item => !currentPageNotSelected.includes(item._id));

      onChangePayoutIds(_.uniqBy([...newRowKeys, ...selectedRows], "_id"));
    },

    getCheckboxProps,
  };

  return (
    <>
      <ModalUpdate {...props} />
      <div>Tổng số tiền: {minFormatMoney(_.sumBy(selectedPayouts, "currencyAmount.exchangedAmount"))}</div>
      <Table
        rowKey="_id"
        loading={loadingPayouts}
        columns={columnsPayout({ columnReferencesPayout, renderCols: dataTablePayout, onCell })}
        rowClassName={"custom-row-class"}
        dataSource={dataPayout || []}
        rowSelection={{
          type: "checkbox",
          selectedRowKeys: selectedIds || [],
          fixed: true,
          ...rowSelection,
        }}
        scroll={{
          x: "max-content",
        }}
        pagination={{
          pageSize: statePagi.limit || 10,
          current: statePagi.page || 1,
          total: Number(totalPayouts),
          showSizeChanger: true,
          pageSizeOptions,
          showTotal: (total, range) => {
            return `Showing ${range[0]}-${range[1]} of ${total} Results`;
          },
          onChange: (pagination, filters, sorter) => {
            setStatePagi(prev => ({ ...prev, page: pagination, limit: filters }));
          },
        }}
      />
    </>
  );
};

export default ModalNewExpense;
