import { useEffect, useState } from "react";
import { Form, Select, Col, Row, Button } from "antd";
import FormItem from "@containers/Accounting/container/FormItem";
// import moment from "moment";
import _ from "lodash";
import { CheckOutlined } from "@ant-design/icons";

// import DateControlPicker from "@components/uielements/dateControlPicker";
import { Box } from "@components/utility/styles";
import HouseSelect from "@components/uidata/house";
import { GUTTER } from "@containers/Accounting/const";
import IntlMessages from "@components/utility/intlMessages";

const generateState = ({ blockId, ota } = {}) => ({
  blockId,
  // status,
  ota,
  // range: [moment(from), moment(to)],
});

const ToolFilter = ({ changeParams, query, dataOTA, ...props }) => {
  const [states, setStates] = useState(generateState);

  const onChange = key => value => {
    if (key === "blockId" && !value) {
      setStates(prev => ({ ...prev, blockId: undefined, roomIds: undefined }));
    } else {
      setStates(prev => ({ ...prev, [key]: value }));
    }
  };

  // const back = () => {
  //   setStates(({ range }) => {
  //     const prevMonth = moment(range[0]).add(-1, "months");
  //     return {
  //       range: [moment(prevMonth).startOf("month"), moment(prevMonth).endOf("month")],
  //     };
  //   });
  // };

  // const next = () => {
  //   setStates(({ range }) => {
  //     const nextMonth = moment(range[1]).add(1, "months");
  //     return {
  //       range: [moment(nextMonth).startOf("month"), moment(nextMonth).endOf("month")],
  //     };
  //   });
  // };

  const onHandleFilter = () => {
    changeParams({
      ...states,
    });
  };

  useEffect(() => {
    setStates(prev => ({ ...prev, ota: _.get(query, "ota"), blockId: _.get(query, "blockId") }));
  }, [query]);

  return (
    <Box>
      <Form layout="vertical" onFinish={onHandleFilter}>
        <Row gutter={GUTTER}>
          <Col xs={24} md={12} lg={16} xl={6}>
            <FormItem label="Nhà">
              <HouseSelect value={states.blockId} onChange={onChange("blockId")} className="w-100" />
            </FormItem>
          </Col>
          <Col xs={24} md={12} lg={16} xl={6}>
            <FormItem label="Nguồn">
              <Select value={states.ota} allowClear options={dataOTA || []} onChange={onChange("ota")} />
            </FormItem>
          </Col>

          {/* <Col xs={24} md={12} lg={16} xl={6}>
            <FormItem label="Thời gian">
              <DateControlPicker
                isRangePicker
                onPrevClick={back}
                onNextClick={next}
                allowClear={false}
                ranges={ranges}
                format="DD/MM/YY"
                disabled
                onChange={onChange("range")}
              />
            </FormItem>
          </Col> */}
          {/* <Col xs={24} md={12} lg={16} xl={6}>
            <FormItem label="Trạng thái">
              <Select
                disabled
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
            </FormItem>
          </Col> */}
          <Col span={24}>
            <Box flex justify="flex-end">
              <Button icon={<CheckOutlined />} type="primary" htmlType="submit">
                <span>
                  <IntlMessages id="apply" />
                </span>
              </Button>
            </Box>
          </Col>
        </Row>
      </Form>
    </Box>
  );
};

export default ToolFilter;
