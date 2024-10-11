import { Form, Select, Row, Col, Input } from "antd";
import { useEffect, useState } from "react";
import _ from "lodash";

import { HeaderFilter } from "@components/page/headerComponent";
import DropdownMenu from "@components/uielements/Dropdown/DropdownMenu";
import { Box } from "@containers/Permission/ShiftHandover/styles";
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
    blockId: covertToArray(_.get(query, "blockId")),
    categoryId: covertToArray(_.get(query, "categoryId")),
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
        blockId: _.get(states, "blockId") ? _.get(states, "blockId").toString() : undefined,
        categoryId: _.get(states, "categoryId") ? _.get(states, "categoryId").toString() : undefined,
        keyword: _.get(states, "keyword") || undefined,
      });
    }
  };

  useEffect(() => {
    setStates(initStates(query));
  }, [query]);

  return (
    <HeaderFilter>
      <DropdownMenu isOpenDr={isOpenDr} setIsOpenDr={setIsOpenDr}>
        <Box>
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
                    onChange={updateState("blockId")}
                    className="w-100"
                    allowClear
                    mode="multiple"
                    options={houses.data.map(h => ({ value: h._id, label: h.info.name }))}
                    value={states.blockId}
                  />
                </FormItem>
              </Col>

              <Col xs={24} md={12} lg={8} xl={6}>
                <FormItem label="Loại chi phí">
                  <Select
                    showSearch
                    optionFilterProp="label"
                    onChange={updateState("categoryId")}
                    className="w-100"
                    allowClear
                    options={payment.data.map(h => ({ value: h._id, label: h.name }))}
                    value={states.categoryId}
                  />
                </FormItem>
              </Col>

              <Col xs={24} md={12} lg={8} xl={6}>
                <ButtonSubmitFilter />
              </Col>
            </Row>
          </Form>
        </Box>
      </DropdownMenu>
    </HeaderFilter>
  );
};

export default ToolFilter;
