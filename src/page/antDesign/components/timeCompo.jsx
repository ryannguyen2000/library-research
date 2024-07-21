import { Card, Col, Row, TimePicker } from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

const { RangePicker } = TimePicker;

dayjs.extend(customParseFormat);
const onChange = (time, timeString) => {
  console.log(time, timeString);
};
const TimePickerHMS = () => (
  <TimePicker
    onChange={onChange}
    defaultOpenValue={dayjs("00:00:00", "HH:mm:ss")}
  />
);

const RangePickerHMS = () => {
  return <RangePicker placeholder={["Filled", ""]} />;
};

const TimeCompo = () => {
  return (
    <Card title="Upload images" bordered={false}>
      <Row gutter={[12, 12]}>
        <Col xl={24}>
          <TimePickerHMS />
        </Col>
        <Col xl={24}>
          <RangePickerHMS />
        </Col>
      </Row>
    </Card>
  );
};

export default TimeCompo;
