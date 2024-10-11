import moment from "moment";
import _ from "lodash";
import { Col, Form, Row, Select } from "antd";

import FormItem from "@containers/Accounting/container/FormItem";
import DateControlPicker from "@components/uielements/dateControlPicker";
import StreamProjects from "@components/uidata/streamProjects";
import { useHouse } from "@hooks/categories";
import { COST_STREAM_TYPE, DATE_PICKER_TYPE, REVENUE_TIME_TYPE } from "@settings/const";
import { pickTimeForToFrom } from "@containers/ReportRevenue/const";

const ranges = {
  "This week": [moment().startOf("isoWeek"), moment().endOf("isoWeek")],
  "This month": [moment().startOf("month"), moment().endOf("month")],
};

const ToolFilter = ({ query, changeSearchParams, ...props }) => {
  const [houses] = useHouse();

  const mdate = _.get(query, "from") ? [moment(query.from), moment(query.to)] : undefined;

  const timelineType = _.get(query, "timelineType");
  const datePickerType = DATE_PICKER_TYPE[timelineType];

  const updateState = key => e => {
    changeSearchParams({
      [key]: e,
    });
  };

  const onTimeType = e => {
    const { to, from } = pickTimeForToFrom(e);
    changeSearchParams({
      timelineType: e,
      to,
      from,
    });
  };

  const onDateChange = date => {
    let to = undefined;
    let from = undefined;
    if (date) {
      switch (timelineType) {
        case "DAILY" || "WEEKLY":
          from = date[0];
          to = date[1];
          break;
        case "WEEKLY":
          from = moment(date[0]).startOf("week");
          to = moment(date[1]).endOf("week");
          break;
        default:
          from = moment(date[0]).startOf("month");
          to = moment(date[1]).endOf("month");
          break;
      }
    }

    if (changeSearchParams) {
      changeSearchParams({
        to: to ? moment(to).format("Y-MM-DD") : undefined,
        from: from ? moment(from).format("Y-MM-DD") : undefined,
      });
    }
  };

  const onArrowClick = (date, typeAction) => () => {
    const typeNext = _.get(datePickerType, "typeMoment")

    let queryFrom = _.get(query, "from")
    let queryTo = _.get(query, "to")

    const startOf = _.get(datePickerType, "startOf")
    const acc = datePickerType[typeAction]

    queryFrom = moment(date[0]).add(_.get(acc, "from"), startOf);
    queryTo = moment(date[1]).add(_.get(acc, "to"), startOf);
    onDateChange([moment(queryFrom).startOf(typeNext), moment(queryTo).endOf(typeNext)]);
  };

  const isWeek = _.get(datePickerType, "picker") === "week"
  const customFormat = (value) => {

    // week's config
    const currentWeek = moment(value).week();
    const startOfMonth = moment(value).startOf('month');
    const startWeek = startOfMonth.week();

    const weekNumberInMonth = currentWeek - startWeek + 1;
    const monthYear = moment(value).format('MM/YYYY');

    const adjustedWeekNumber = moment(value).date() >= 22 ? 4 : weekNumberInMonth;

    return isWeek ? `Week ${adjustedWeekNumber}, ${monthYear}` : moment(value).format(_.get(datePickerType, "format", "Y-MM-DD"))
  };

  return (
    <Form layout="vertical">
      <Row gutter={6}>
        <Col xs={24} lg={5}>
          <FormItem label="Timeline">
            <DateControlPicker
              onPrevClick={onArrowClick(mdate, "prev")}
              onNextClick={onArrowClick(mdate, "next")}
              ranges={ranges}
              format={(value) => customFormat(value)}
              isRangePicker
              picker={_.get(datePickerType, "picker", "date")}
              onChange={e => onDateChange(e)}
              value={mdate}
              allowClear={false}
            />
          </FormItem>
        </Col>
        <Col xs={24} lg={4}>
          <FormItem label="Timeline type">
            <Select options={_.values(REVENUE_TIME_TYPE)} onChange={onTimeType} value={_.get(query, "timelineType")} />
          </FormItem>
        </Col>
        <Col xs={24} lg={5}>
          <FormItem label="Source">
            <Select onChange={updateState("source")} options={_.values(COST_STREAM_TYPE)} value={Number(_.get(query, "source")) || undefined} allowClear />
          </FormItem>
        </Col>
        <Col xs={24} lg={5}>
          <FormItem label="Project">
            <StreamProjects
              value={_.get(query, "projectId")}
              onChange={updateState("projectId")}
              isGetData={true}
              type="revenue"
            />
          </FormItem>
        </Col>
        <Col xs={24} lg={5}>
          <FormItem label="Home">
            <Select
              showSearch
              optionFilterProp="label"
              onChange={updateState("blockId")}
              className="w-100"
              allowClear
              options={houses.data.map(h => ({ value: h._id, label: h.info.name }))}
              value={_.get(query, "blockId")}
            />
          </FormItem>
        </Col>
      </Row>
    </Form>
  );
};

export default ToolFilter;
