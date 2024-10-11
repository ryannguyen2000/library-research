import { TimePicker, Select, Row, Col, InputNumber } from "antd";
import moment from "moment";
import _ from "lodash";

import { DAYS_OF_WEEK, PAYOUT_AUTO_TIME } from "@settings/const";
// import IntlMessages from "@components/utility/intlMessages";
import FormItem from "@containers/Accounting/container/FormItem";

function generateArrayOfObjects() {
  const array = [];
  for (let i = 1; i <= 31; i++) {
    const object = {
      key: i,
      value: i,
    };
    array.push(object);
  }
  return array;
}

const RenderTimePicker = ({ type = "MONTHLY", name, restField }) => {
  const MonthPickerComponent = type === PAYOUT_AUTO_TIME.MONTHLY.value && (
    <Col span={8}>
      <FormItem {...restField} name={[name, "timeFollow"]} label="Ngày trong tháng" initialValue={1}>
        <Select allowClear options={generateArrayOfObjects()} />
      </FormItem>
    </Col>
  );

  const WeekPickerComponent = type === PAYOUT_AUTO_TIME.WEEKLY.value && (
    <Col span={12}>
      <FormItem {...restField} name={[name, "timeFollow"]} label="Ngày trong tuần" initialValue={0}>
        <Select allowClear options={_.values(DAYS_OF_WEEK)} />
      </FormItem>
    </Col>
  );

  const TimePickerComponent = (
    <Col span={8}>
      <FormItem {...restField} name={[name, "time"]} label="Giờ chạy" initialValue={moment("07:00", "HH:mm")}>
        <TimePicker format="HH:mm" minuteStep={10} />
      </FormItem>
    </Col>
  );

  const diffPeriod = type === PAYOUT_AUTO_TIME.MONTHLY.value && (
    <Col span={8}>
      <FormItem {...restField} name={[name, "addTimeForPeriod"]} label="(+/-) Kì thanh toán">
        <InputNumber />
      </FormItem>
    </Col>
  );

  return (
    <Row gutter={6}>
      {MonthPickerComponent}
      {WeekPickerComponent}
      {TimePickerComponent}
      {diffPeriod}
    </Row>
  );
};

export default RenderTimePicker;
