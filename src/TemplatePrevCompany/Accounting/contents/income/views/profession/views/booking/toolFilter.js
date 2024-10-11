import _ from "lodash";
import { useCallback } from "react";
import moment from "moment";
import { Form, Select, Col, Row, Input, DatePicker } from "antd";
// import { CheckOutlined } from "@ant-design/icons";

import { PAYMENT_CARD_STATUS, PAYMENT_CHARGED_STATUS } from "@settings/const";

import { Box } from "@components/utility/styles";
import HouseSelect from "@components/uidata/houseV2";
import { GUTTER } from "@containers/Accounting/const";
import statusConfigs from "@containers/Reservation/config";

import { getCardStatusClass, getChargedStatusClass } from "./utils";

const FormItem = Form.Item;

const timeCheckbox = {
  all: "Thời gian",
  createdAt: "Ngày đặt",
  canceledAt: "Ngày hủy",
  checkin: "Check in",
  checkout: "Check out",
};

const ranges = {
  "Tháng này": [moment().startOf("month"), moment().endOf("month")],
  "Tuần này": [moment().startOf("isoWeek"), moment().endOf("isoWeek")],
  "hôm nay": [moment(), moment()],
};

const ToolFilter = ({ changeParams, query, refresh }) => {
  const onTypeChange = type => {
    changeParams({
      type,
      page: 1,
    });
  };

  const onRangeChange = ([start, end]) => {
    changeParams({ from: start.format("Y-MM-DD"), to: end.format("Y-MM-DD") });
  };

  const onHouseChange = home => {
    changeParams({
      home,
      page: 1,
    });
  };

  const onChangeCheck = e => {
    changeParams({
      excludeBlockId: e.target.checked,
      page: 1,
    });
  };

  const onStatusChange = status => {
    changeParams({
      status,
      page: 1,
    });
  };

  const onCardStatusChange = cardStatus => {
    changeParams({
      cardStatus,
      page: 1,
    });
  };

  const onChargedStatusChange = chargedStatus => {
    changeParams({
      chargedStatus,
      page: 1,
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onSearchChange = useCallback(
    _.debounce(e => {
      changeParams({ otaBookingId: e.target.value });
    }, 350),
    [changeParams]
  );

  return (
    <Box>
      <Form layout="vertical">
        <Row gutter={GUTTER}>
          <Col xs={24} sm={12} md={8}>
            <FormItem label="Thời gian" labelCol={{ span: 24 }}>
              <Input.Group compact>
                <Select
                  value={query.type}
                  onChange={onTypeChange}
                  style={{ width: "30%" }}
                  options={_.entries(timeCheckbox).map(([value, label]) => ({ value, label }))}
                />
                <DatePicker.RangePicker
                  allowClear={false}
                  ranges={ranges}
                  style={{ width: "70%" }}
                  format="DD/MM/YY"
                  onChange={onRangeChange}
                  value={query.from && query.to ? [moment(query.from), moment(query.to)] : []}
                />
              </Input.Group>
            </FormItem>
          </Col>
          <Col xs={24} md={12} lg={16} xl={8}>
            <FormItem label="Nhà">
              <HouseSelect
                valueHome={query.home}
                onChangeHome={onHouseChange}
                valueChecked={query.excludeBlockId === "true"}
                onChangeCheck={onChangeCheck}
                className="w-100"
              />
            </FormItem>
          </Col>
          <Col xs={24} md={12} lg={16} xl={8}>
            <FormItem label="Trạng thái đặt phòng">
              <Select
                value={query.status}
                onChange={onStatusChange}
                className="w-100"
                options={statusConfigs
                  .filter(s => !s.virtual)
                  .map(s => ({
                    value: s.key,
                    label: s.title,
                  }))}
                allowClear
              />
            </FormItem>
          </Col>

          <Col xs={24} md={12} lg={16} xl={8}>
            <FormItem label="Trạng thái thẻ">
              <Select
                value={query.cardStatus}
                onChange={onCardStatusChange}
                className="w-100"
                options={_.values(PAYMENT_CARD_STATUS).map(i => ({
                  value: i.value,
                  label: <span className={getCardStatusClass(i.value)}>{i.label}</span>,
                }))}
                allowClear
              />
            </FormItem>
          </Col>
          <Col xs={24} md={12} lg={16} xl={8}>
            <FormItem label="Trạng thái thanh toán">
              <Select
                value={query.chargedStatus}
                onChange={onChargedStatusChange}
                className="w-100"
                options={_.values(PAYMENT_CHARGED_STATUS).map(i => ({
                  value: i.value,
                  label: <span className={getChargedStatusClass(i.value)}>{i.label}</span>,
                }))}
                allowClear
              />
            </FormItem>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <FormItem label="Mã đặt phòng" labelCol={{ span: 24 }}>
              <Input.Search
                allowClear
                defaultValue={query.otaBookingId}
                type="search"
                onChange={onSearchChange}
                onSearch={refresh}
              />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Box>
  );
};

export default ToolFilter;
