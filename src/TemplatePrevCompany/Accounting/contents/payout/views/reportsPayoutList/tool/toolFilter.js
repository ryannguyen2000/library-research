import { Component } from "react";
import { connect } from "react-redux";
import { Form, Select, Tag, Input, Row, Col } from "antd";
import moment from "moment";

import userActions from "@redux/categories/users/actions";
import DateControlPicker from "@components/uielements/dateControlPicker";
import { HeaderFilter } from "@components/page/headerComponent";
import DropdownMenu from "@components/uielements/Dropdown/DropdownMenu";
import { Box } from "@components/utility/styles";
import { RadioGroup } from "@containers/Permission/ShiftHandover/styles";
import ButtonSubmitFilter from "@components/utility/btnSumitFilter";
import FormItem from "@containers/Accounting/container/FormItem";

const SelectOption = Select.Option;
const ranges = {
  "hôm nay": [moment(), moment()],
  "Tuần này": [moment().startOf("isoWeek"), moment().endOf("isoWeek")],
  "Tháng này": [moment().startOf("month"), moment().endOf("month")],
};

const renderUserOptions = ({ _id, username, name }) => (
  <SelectOption key={_id} value={_id}>
    {`${name || ""} (${username})`}
  </SelectOption>
);

class ToolFilter extends Component {
  constructor(props) {
    super();
    const { from, to, confirmedBy, confirmed, confirmPaid, name, createdBy, dateKey, sms } = props;
    this.state = {
      visibleFilter: false,
      range: from && to ? [moment(from), moment(to)] : [],
      confirmedBy,
      confirmed,
      createdBy,
      name,
      sms,
      dateKey,
      confirmPaid,
    };
  }

  componentDidMount() {
    const { users, fetch } = this.props;
    if (users.data.length === 0 || users.query) fetch();
  }

  componentDidUpdate(prevProps) {
    const { from, to } = this.props;
    if (from !== prevProps.from || to !== prevProps.to) {
      this.setState({
        range: from && to ? [moment(from), moment(to)] : [],
      });
    }
  }

  back = () => {
    this.setState(({ range }) => {
      const prevMonth = moment(range[0]).add(-1, "months");
      return {
        range: [moment(prevMonth).startOf("month"), moment(prevMonth).endOf("month")],
      };
    });
  };

  next = () => {
    this.setState(({ range }) => {
      const nextMonth = moment(range[1]).add(1, "months");
      return {
        range: [moment(nextMonth).startOf("month"), moment(nextMonth).endOf("month")],
      };
    });
  };

  onVisibleFilterChange = () => {
    this.setState(({ visibleFilter }) => {
      if (visibleFilter) return { visibleFilter: false };
      else {
        const { from, to, confirmedBy, confirmed, confirmPaid, name, createdBy, dateKey } = this.props;
        return {
          visibleFilter: true,
          range: from && to ? [moment(from), moment(to)] : [],
          confirmedBy,
          confirmed,
          confirmPaid,
          createdBy,
          name,
          dateKey,
        };
      }
    });
  };

  onHandleFilter = () => {
    const { visibleFilter, range, confirmedBy, confirmed, confirmPaid, createdBy, name, dateKey, sms } = this.state;

    visibleFilter && this.setState({ visibleFilter: false });
    const [from, to] = range || [];

    this.props.changeParams({
      from: from ? from.format("Y-MM-DD") : undefined,
      to: to ? to.format("Y-MM-DD") : undefined,
      confirmedBy,
      confirmed,
      confirmPaid,
      createdBy,
      name,
      sms,
      page: undefined,
      dateKey,
    });
  };

  updateState = key => value => {
    this.setState({ [key]: value });
  };

  renderTag = type => {
    switch (type) {
      case "name": {
        const { name } = this.props;
        return (
          name && (
            <Tag
              closable
              onClick={this.onVisibleFilterChange}
              color="#18b4c9"
              onClose={e => {
                e.stopPropagation();
                this.setState(
                  {
                    name: "",
                  },
                  this.onHandleFilter
                );
              }}
            >
              Search: <b>{name}</b>
            </Tag>
          )
        );
      }
      case "sms": {
        const { sms } = this.props;
        return (
          sms && (
            <Tag
              closable
              onClick={this.onVisibleFilterChange}
              color="#18b4c9"
              onClose={e => {
                e.stopPropagation();
                this.setState(
                  {
                    sms: "",
                  },
                  this.onHandleFilter
                );
              }}
            >
              SMS: <b>{sms}</b>
            </Tag>
          )
        );
      }
      case "time": {
        const { from, to } = this.props;
        return (
          from && (
            <Tag
              onClick={this.onVisibleFilterChange}
              color="#18b4c9"
              closable
              onClose={e => {
                e.stopPropagation();
                this.setState(
                  {
                    range: [],
                  },
                  this.onHandleFilter
                );
              }}
            >
              {`${moment(from).format("D/M/Y")} - ${moment(to).format("D/M/Y")}`}
            </Tag>
          )
        );
      }
      case "confirmed":
      case "confirmPaid": {
        const keyVal = this.props[type];
        return (
          keyVal && (
            <Tag
              color="#18b4c9"
              closable
              onClick={this.onVisibleFilterChange}
              onClose={e => {
                e.stopPropagation();
                this.setState(
                  {
                    confirmed: undefined,
                  },
                  this.onHandleFilter
                );
              }}
            >
              {`${keyVal === "true" ? "Đã" : "Chưa"} ${type === "confirmed" ? "duyệt" : "chi"}`}
            </Tag>
          )
        );
      }
      case "confirmedBy":
      case "createdBy": {
        const data = this.props[type];
        if (!data) return null;
        const temp = this.props.users.data.find(({ _id }) => _id === data);
        return (
          <Tag
            color="#18b4c9"
            closable
            onClick={this.onVisibleFilterChange}
            onClose={e => {
              e.stopPropagation();
              this.setState(
                {
                  [type]: undefined,
                },
                this.onHandleFilter
              );
            }}
          >
            {temp ? temp.username : temp}
          </Tag>
        );
      }
      default:
        return "";
    }
  };

  onNameChange = e => {
    this.setState({ name: e.target.value });
  };

  onSMSChange = e => {
    this.setState({ sms: e.target.value });
  };

  render() {
    const { users, payin } = this.props;
    const { range, confirmed, confirmPaid, confirmedBy, createdBy, name, dateKey, sms } = this.state;

    return (
      <HeaderFilter>
        <DropdownMenu isOpenDr={this.props.isOpenDr} setIsOpenDr={this.props.setIsOpenDr}>
          <Box>
            <Form onFinish={this.onHandleFilter} layout="vertical">
              <Row style={{ margin: 0, marginTop: "10px", justifyContent: "space-between" }} gutter={6}>
                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Tìm kiếm">
                    <Input
                      value={name}
                      placeholder={payin ? "Nhập tên, Booking code, Ghi chú" : "Nhập tên"}
                      onChange={this.onNameChange}
                      allowClear
                    />
                  </FormItem>
                </Col>

                {payin && (
                  <Col xs={24} md={12} lg={8} xl={6}>
                    <FormItem label="SMS">
                      <Input value={sms} placeholder="Nhập nội dung sms" onChange={this.onSMSChange} allowClear />
                    </FormItem>
                  </Col>
                )}

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Trạng thái duyệt">
                    <Select onChange={this.updateState("confirmed")} className="w-100" value={confirmed} allowClear>
                      <SelectOption value={"true"}>Đã duyệt</SelectOption>
                      <SelectOption value={"false"}>Chưa duyệt</SelectOption>
                    </Select>
                  </FormItem>
                </Col>

                {!payin && (
                  <Col xs={24} md={12} lg={8} xl={6}>
                    <FormItem label="Trạng thái chi">
                      <Select
                        onChange={this.updateState("confirmPaid")}
                        className="w-100"
                        value={confirmPaid}
                        allowClear
                      >
                        <SelectOption value={"true"}>Đã chi</SelectOption>
                        <SelectOption value={"false"}>Chưa chi</SelectOption>
                      </Select>
                    </FormItem>
                  </Col>
                )}

                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Người tạo">
                    <Select
                      showSearch
                      optionFilterProp="children"
                      onChange={this.updateState("createdBy")}
                      className="w-100"
                      value={createdBy}
                      allowClear
                      placeholder="Chọn người tạo..."
                    >
                      {users.data.map(renderUserOptions)}
                    </Select>
                  </FormItem>
                </Col>
                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem label="Người xác nhận">
                    <Select
                      showSearch
                      optionFilterProp="children"
                      onChange={this.updateState("confirmedBy")}
                      className="w-100"
                      value={confirmedBy}
                      allowClear
                      placeholder="Chọn người thu..."
                    >
                      {users.data.map(renderUserOptions)}
                    </Select>
                  </FormItem>
                </Col>
                <Col xs={24} md={12} lg={8} xl={6}>
                  <FormItem>
                    <RadioGroup
                      value={dateKey}
                      onChange={e => this.setState({ dateKey: e.target.value })}
                      options={[
                        { label: "Ngày tạo", value: "createdAt" },
                        { label: "Ngày xác nhận", value: "confirmedDate" },
                      ]}
                    />
                    <DateControlPicker
                      isRangePicker
                      onPrevClick={this.back}
                      onNextClick={this.next}
                      ranges={ranges}
                      format="DD/MM/YY"
                      onChange={this.updateState("range")}
                      value={range}
                    />
                  </FormItem>
                </Col>
                <Col xs={24} md={12} lg={8} xl={6}>
                  <ButtonSubmitFilter />
                </Col>
                <Col xs={24} md={12} lg={8} xl={6} />
              </Row>
            </Form>
          </Box>
        </DropdownMenu>
        {this.renderTag("name")}
        {this.renderTag("sms")}
        {this.renderTag("time")}
        {this.renderTag("confirmed")}
        {this.renderTag("confirmPaid")}
        {this.renderTag("confirmedBy")}
        {this.renderTag("createdBy")}
      </HeaderFilter>
    );
  }
}

function mapStateToProps(state) {
  return {
    users: state.Categories.users,
  };
}

export default connect(mapStateToProps, { fetch: userActions.fetch })(ToolFilter);
