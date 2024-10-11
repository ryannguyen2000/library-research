import { Form, Select, Row, Col, Input } from "antd";
import { useEffect, useState } from "react";
import _ from "lodash";

import { HeaderFilter } from "@components/page/headerComponent";
import { useHouse, usePaymentCategory } from "@hooks/categories";
import ButtonSubmitFilter from "@components/utility/btnSumitFilter";
import FormItem from "@containers/Accounting/container/FormItem";

const covertToArray = data => {
  let result = [];
  if (Array.isArray(data)) {
    result = data;
  } else if (data && !Array.isArray(data)) {
    result = data.split(",");
  }
  return result;
};

const initStates = query => {
  return {
    blockIds: covertToArray(_.get(query, "blockIds")),
    payoutCategoryIds: covertToArray(_.get(query, "payoutCategoryIds")),
    keyword: _.get(query, "keyword") || "",
  };
};

const ToolFilter = ({ changeParams, query, isOpenDr, setIsOpenDr }) => {
  const [houses] = useHouse();
  const [payment] = usePaymentCategory();
  const [states, setStates] = useState(initStates);

  const updateState = key => e => {
    setStates(prev => ({ ...prev, [key]: e && e.target ? e.target.value : e }));
  };

  const onHandleFilter = () => {
    const { visibleFilter } = states;

    visibleFilter && setStates(prev => ({ ...prev, visibleFilter: false }));

    if (changeParams) {
      changeParams({
        blockIds: _.get(states, "blockIds") ? _.get(states, "blockIds").toString() : undefined,
        payoutCategoryIds: _.get(states, "payoutCategoryIds")
          ? _.get(states, "payoutCategoryIds").toString()
          : undefined,
        keyword: _.get(states, "keyword") || undefined,
      });
    }
  };

  useEffect(() => {
    setStates(initStates(query));
  }, [query]);

  return (
    <HeaderFilter>
      <Form onFinish={onHandleFilter} layout="vertical">
        <Row gutter={6}>
          <Col xs={24} md={12} lg={8} xl={6}>
            <FormItem label="Từ khóa">
              <Input
                value={states.keyword}
                className="w-100"
                placeholder="Nhập từ khóa..."
                onChange={updateState("keyword")}
                allowClear
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
                options={houses.data.map(h => ({ value: h._id, label: h.info.name }))}
                value={states.blockIds}
              />
            </FormItem>
          </Col>

          <Col xs={24} md={12} lg={8} xl={6}>
            <FormItem label="Loại chi phí">
              <Select
                showSearch
                optionFilterProp="label"
                onChange={updateState("payoutCategoryIds")}
                className="w-100"
                allowClear
                mode="multiple"
                options={payment.data.map(h => ({ value: h._id, label: h.name }))}
                value={states.payoutCategoryIds}
              />
            </FormItem>
          </Col>

          <Col xs={24} md={12} lg={8} xl={6}>
            <ButtonSubmitFilter />
          </Col>
        </Row>
      </Form>
    </HeaderFilter>
  );
};

export default ToolFilter;
