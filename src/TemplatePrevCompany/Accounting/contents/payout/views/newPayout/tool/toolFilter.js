import { HeaderFilter } from "@components/page/headerComponent";
import DropdownMenu from "@components/uielements/Dropdown/DropdownMenu";
import { Form, Select, Row, Col } from "antd";
import { connect } from "react-redux";
import _ from "lodash";

import houseActions from "@redux/categories/house/actions";
import paymentActions from "@redux/categories/payments/actions";
import { memo, useEffect, useState } from "react";
import { PAYMENT_PRIORITY, PAY_STATUS } from "@settings/const";
import { PriorityTag } from "@containers/Finance/payout/tool/toolFilter";
import { TagStatus } from "@containers/Finance/payout/tool/modalConfirm";
import IntlMessages from "@components/utility/intlMessages";
import PayAccount from "@components/uidata/PayAccount";
import ButtonSubmitFilter from "@components/utility/btnSumitFilter";
import FormItem from "@containers/Accounting/container/FormItem";

const { Option } = Select;

const initStates = query => {
  let blockIds = [];
  if (Array.isArray(_.get(query, "blockIds"))) {
    blockIds = _.get(query, "blockIds");
  } else if (_.get(query, "blockIds") && !Array.isArray(_.get(query, "blockIds"))) {
    blockIds = _.get(query, "blockIds").split(",");
  }
  return {
    status: _.get(query, "status") || "",
    debitAccountId: _.get(query, "debitAccountId") || "",
    creditAccountId: _.get(query, "creditAccountId") || "",
    priority: _.get(query, "priority") || "",
    blockIds,
    categoryId: _.get(query, "categoryId") || "",
  };
};

const ToolFilter = ({ houses, payments, fetchPayments, fetchHouses, query, changeParams, ...props }) => {
  const [states, setStates] = useState(initStates);

  const onHandleFilter = () => {
    if (changeParams) {
      changeParams({
        ...states,
        blockIds: states.blockIds.length > 0 ? states.blockIds.toString() : undefined,
        page: 1,
      });
    }
  };

  const updateState = key => value => {
    setStates(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (houses.length === 0) fetchHouses();
    if (payments.length === 0) fetchPayments();
    setStates(initStates(query));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <HeaderFilter>
      <DropdownMenu isOpenDr={props.isOpenDr} setIsOpenDr={props.setIsOpenDr}>
        {props.isOpenDr && (
          <>
            <Form onFinish={onHandleFilter} layout="vertical">
              <Row gutter={[6]}>
                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Trạng thái chi" id="status">
                    <Select onChange={updateState("status")} className="w-100" value={states.status} allowClear>
                      {_.map(PAY_STATUS, stt => (
                        <Option key={stt.value} value={stt.value}>
                          <TagStatus className={`${stt.value}`}>
                            <IntlMessages id={stt.label} />
                          </TagStatus>
                        </Option>
                      ))}
                    </Select>
                  </FormItem>
                </Col>

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Nguồn chi">
                    <PayAccount
                      value={states.debitAccountId}
                      onChange={updateState("debitAccountId")}
                      transType="debit"
                      // blockIds={_.get(states, "blockIds")}
                      // categoryId={_.get(states, "categoryId") || undefined}
                    />
                  </FormItem>
                </Col>

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Người nhận">
                    <PayAccount
                      value={states.creditAccountId}
                      onChange={updateState("creditAccountId")}
                      // blockIds={_.get(states, "blockIds") || undefined}
                      // categoryId={_.get(states, "categoryId") || undefined}
                    />
                  </FormItem>
                </Col>

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Nhà">
                    <Select
                      showSearch
                      optionFilterProp="label"
                      onChange={updateState("blockIds")}
                      className="w-100"
                      allowClear
                      mode="multiple"
                      value={states.blockIds}
                      options={houses ? houses.map(h => ({ value: h._id, label: h.info.name })) : []}
                    />
                  </FormItem>
                </Col>

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Cấp độ chi" id="priority">
                    <Select onChange={updateState("priority")} className="w-100" value={states.priority} allowClear>
                      {_.map(PAYMENT_PRIORITY, p => {
                        return (
                          <Option key={p.value} value={p.value}>
                            <PriorityTag className={`bg-${p.value.toString()}`}>{p.label}</PriorityTag>
                          </Option>
                        );
                      })}
                    </Select>
                  </FormItem>
                </Col>

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Khoản chi">
                    <Select
                      showSearch
                      optionFilterProp="label"
                      onChange={updateState("categoryId")}
                      className="w-100"
                      value={states.categoryId}
                      allowClear
                      options={payments.map(p => ({ value: p._id, label: p.name }))}
                    />
                  </FormItem>
                </Col>
                <Col xs={24} md={12} lg={8} xl={6}>
                  <ButtonSubmitFilter />
                </Col>
                <Col xs={0} md={0} lg={0} xl={6} />
              </Row>
            </Form>
          </>
        )}
      </DropdownMenu>
    </HeaderFilter>
  );
};

function mapStateToProps({ Categories }) {
  return {
    houses: Categories.houses.data,
    users: Categories.users,
    payments: Categories.payments.data,
  };
}

export default connect(mapStateToProps, {
  fetchHouses: houseActions.fetch,
  fetchPayments: paymentActions.fetch,
})(memo(ToolFilter));
