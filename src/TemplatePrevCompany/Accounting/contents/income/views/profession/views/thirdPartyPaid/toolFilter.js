import { useState } from "react";
import { Form, Select, Col, Row, Button } from "antd";
import moment from "moment";
import _ from "lodash";
import { CheckOutlined } from "@ant-design/icons";

import DateControlPicker from "@components/uielements/dateControlPicker";
import IntlMessages from "@components/utility/intlMessages";
import { Box } from "@components/utility/styles";
import HouseSelect from "@components/uidata/house";
import { GUTTER, ranges } from "@containers/Accounting/const";

const generateState = ({ from, to, blockId, source, status } = {}) => ({
  blockId,
  status,
  source,
  range: [moment(from), moment(to)],
});

const ToolFilter = ({ changeParams, query }) => {
  const [states, setStates] = useState(generateState);

  const onChange = key => value => {
    if (key === "blockId" && !value) {
      setStates(prev => ({ ...prev, blockId: undefined, roomIds: undefined }));
    } else {
      setStates(prev => ({ ...prev, [key]: value }));
    }
  };

  const back = () => {
    setStates(({ range }) => {
      const prevMonth = moment(range[0]).add(-1, "months");
      return {
        range: [moment(prevMonth).startOf("month"), moment(prevMonth).endOf("month")],
      };
    });
  };

  const next = () => {
    setStates(({ range }) => {
      const nextMonth = moment(range[1]).add(1, "months");
      return {
        range: [moment(nextMonth).startOf("month"), moment(nextMonth).endOf("month")],
      };
    });
  };

  const onHandleFilter = () => {
    const newParams = _.omit(states, ["range"]);
    changeParams({
      ...newParams,
      from: states.range ? states.range[0].format("Y-MM-DD") : undefined,
      to: states.range ? states.range[1].format("Y-MM-DD") : undefined,
    });
  };

  return (
    <Box>
      <Form layout="vertical" onFinish={onHandleFilter}>
        <Row gutter={GUTTER}>
          <Col xs={24} md={12} lg={16} xl={6}>
            <Form.Item label="Nguồn">
              <Select options={[]} onChange={onChange("source")} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} lg={16} xl={6}>
            <Form.Item label="Nhà">
              <HouseSelect
                //  value={states.blockId}
                onChange={onChange("blockId")}
                className="w-100"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} lg={16} xl={6}>
            <Form.Item label="Thời gian">
              <DateControlPicker
                isRangePicker
                onPrevClick={back}
                onNextClick={next}
                allowClear={false}
                ranges={ranges}
                format="DD/MM/YY"
                onChange={onChange("range")}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} lg={16} xl={6}>
            <Form.Item label="Trạng thái">
              <Select
                options={[
                  {
                    value: "normal",
                    label: "Bình thường",
                  },
                  {
                    value: "hight",
                    label: "Cao",
                  },
                ]}
                className="w-100"
                onChange={onChange("state")}
                allowClear
              />
            </Form.Item>
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
