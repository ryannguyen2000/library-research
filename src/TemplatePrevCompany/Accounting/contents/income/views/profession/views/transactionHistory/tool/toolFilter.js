import { useEffect, useState } from "react";
import { Form, Select, Col, Row, Button, Input, ConfigProvider } from "antd";
import moment from "moment";
import _ from "lodash";
import { CheckOutlined } from "@ant-design/icons";
import enUS from "antd/es/locale/en_US";

import DateControlPicker from "@components/uielements/dateControlPicker";
import IntlMessages from "@components/utility/intlMessages";
import { Box } from "@components/utility/styles";
import { GUTTER } from "@containers/Accounting/const";
import FormItem from "@containers/Accounting/container/FormItem";

import * as Constant from "../const";

const customLocale = {
  ...enUS,
  DatePicker: {
    ...enUS.DatePicker,
    lang: {
      ...enUS.DatePicker.lang,
      placeholder: "Select date",
      rangePlaceholder: ["Start date", "End date"],
    },
  },
};

const generateState = ({ from, to, ...props } = {}) => ({
  ...props,
  range: from && to ? [moment(from), moment(to)] : null,
});

const ToolFilter = ({ changeParams, query, type, ...props }) => {
  const [state, setState] = useState(generateState);

  const isKovenaPayment = type === "kovena_payment";
  const isKovenaTransaction = type === "kovena_transaction";

  const back = () => {
    setState(({ range }) => {
      const prevMonth = moment(range[0]).add(-1, "months");
      return {
        range: [moment(prevMonth).startOf("month"), moment(prevMonth).endOf("month")],
      };
    });
  };

  const next = () => {
    setState(({ range }) => {
      const nextMonth = moment(range[1]).add(1, "months");
      return {
        range: [moment(nextMonth).startOf("month"), moment(nextMonth).endOf("month")],
      };
    });
  };

  const onHandleFilter = () => {
    const newParams = _.omit(state, ["range"]);
    changeParams({
      ...newParams,
      from: state.range ? state.range[0].format("Y-MM-DD") : undefined,
      to: state.range ? state.range[1].format("Y-MM-DD") : undefined,
    });
  };

  const updateState = key => e => {
    if (key === "text_search") {
      setState(prev => ({ ...prev, [key]: e.target.value }));
    } else {
      setState(prev => ({ ...prev, [key]: e && e.target ? e.target.value || e.target.checked : e }));
    }
  };

  useEffect(() => {
    setState(generateState(query));
  }, [query]);

  return (
    <Box>
      <Form layout="vertical" onFinish={onHandleFilter}>
        <Row gutter={GUTTER}>
          {/* payout_id */}
          {isKovenaPayment && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Payout ID">
                <Input
                  allowClear
                  value={_.get(state, "payout_id")}
                  className="w-100"
                  onChange={updateState("payout_id")}
                />
              </FormItem>
            </Col>
          )}

          {/* status */}
          {isKovenaPayment && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Status">
                <Select
                  allowClear
                  value={_.get(state, "status")}
                  options={_.values(Constant.statusOptions)}
                  onChange={updateState("status")}
                />
              </FormItem>
            </Col>
          )}

          {/* text search */}
          {isKovenaTransaction && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Text Search">
                <Input
                  value={_.get(state, "text_search", "")}
                  className="w-100"
                  onChange={updateState("text_search")}
                />
              </FormItem>
            </Col>
          )}

          {/* Channel */}
          {isKovenaTransaction && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Channel">
                <Select
                  options={_.values(Constant.channelOptions)}
                  onChange={updateState("transaction_channel")}
                  value={_.get(state, "transaction_channel")}
                  allowClear
                />
              </FormItem>
            </Col>
          )}

          {/* Transaction Type */}
          {isKovenaTransaction && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Transaction Type">
                <Select
                  options={_.values(Constant.transactionTypeOptions)}
                  onChange={updateState("transaction_type")}
                  value={_.get(state, "transaction_type")}
                  allowClear
                />
              </FormItem>
            </Col>
          )}

          {/* Transaction status */}
          {isKovenaTransaction && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Transaction Status">
                <Select
                  options={_.values(Constant.transactionStatusOptions)}
                  onChange={updateState("transaction_status")}
                  value={_.get(state, "transaction_status")}
                  allowClear
                />
              </FormItem>
            </Col>
          )}

          {/* Date Type */}
          {isKovenaTransaction && (
            <Col xs={24} md={12} lg={16} xl={6}>
              <FormItem label="Date Type">
                <Select
                  options={_.values(Constant.dataTypeOptions)}
                  onChange={updateState("date_type")}
                  value={_.get(state, "date_type")}
                  allowClear
                />
              </FormItem>
            </Col>
          )}

          <Col xs={24} md={12} lg={16} xl={6}>
            {/* from - to */}
            <FormItem label="From Date - To Date">
              <ConfigProvider locale={customLocale}>
                <DateControlPicker
                  isRangePicker
                  onPrevClick={back}
                  onNextClick={next}
                  allowClear={true}
                  ranges={Constant.ranges}
                  format="DD/MM/YY"
                  onChange={updateState("range")}
                  value={state.range}
                />
              </ConfigProvider>
            </FormItem>
          </Col>

          <Box flex justify="flex-end">
            <Button icon={<CheckOutlined />} type="primary" htmlType="submit">
              <span>
                <IntlMessages id="apply" />
              </span>
            </Button>
          </Box>
        </Row>
      </Form>
    </Box>
  );
};

export default ToolFilter;
