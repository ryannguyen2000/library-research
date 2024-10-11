import { useDispatch } from "react-redux";
import { Col, Form, Row, Select, DatePicker, Checkbox, Input } from "antd";
import { useEffect, useState } from "react";
import moment from "moment";
import _ from "lodash";
import { HeaderFilter } from "@components/page/headerComponent";
import { Box } from "@components/utility/styles";
import { FormItem } from "@containers/Permission/ShiftHandover/styles";
import HouseSelectV2 from "@components/uidata/houseV2";
import cashFlowActions from "@redux/cashFlow/actions";

const initialState = query => {
  return {
    home: query.home ? (typeof query.home === "string" ? query.home.split(",") : query.home) : undefined,
    viewType: _.get(query, "viewType") || null,
    flow: _.get(query, "flow") || null,
    node: _.get(query, "node") || null,
    diagramType: _.get(query, "diagramType") || null,
    period: _.get(query, "period"),
    onlyLine: _.get(query, "onlyLine") === "true" ? true : false,
    onlyNode: _.get(query, "onlyNode") === "true" ? true : false,
    excludeBlockId: _.get(query, "excludeBlockId") === "true" ? true : false,
    otaBookingId: _.get(query, "otaBookingId"),
  };
};

const ToolFilter = ({ changeParams, listLine, listNode, query }) => {
  const [states, setStates] = useState(initialState(query));
  const sortListLine = listLine ? listLine.sort((a, b) => a.value - b.value) : [];
  const newListLine =
    _.get(query, "onlyNode") && _.get(query, "node")
      ? _.filter(sortListLine, item => item.from === query.node || item.to === query.node)
      : sortListLine;
  const nameSelectedLine = listLine ? _.find(listLine, { line: parseInt(states.flow) }) : "";
  const nameSelectedNode = listNode ? _.find(listNode, { id: states.node }) : "";

  const dispatch = useDispatch();

  const resetParamsAndReduxFilter = () => {
    dispatch(
      cashFlowActions.selectNodeFlow({
        flow: null,
        node: null,
        typeSelected: null,
        typeFlow: null,
        typeNode: null,
        listFlowForOnlyNode: [],
      })
    );
    return {
      typeFlow: undefined,
      typeNode: undefined,
      flow: undefined,
      node: undefined,
      onlyNode: undefined,
      onlyLine: undefined,
    };
  };

  const updateParams = ({ key, value }) => {
    let updateObj = {
      ...query,
      [key]: value,
      page: 1,
    };
    const isOnlyNode = _.get(query, "onlyNode");
    switch (key) {
      case "flow":
        updateObj = {
          ...updateObj,
          node: isOnlyNode ? _.get(query, "node") : undefined,
          typeFlow: value ? "customEdge" : undefined,
        };
        dispatch(cashFlowActions.selectNodeFlow({ [key]: value }));
        break;
      case "node":
        updateObj = {
          ...updateObj,
          flow: undefined,
          onlyLine: undefined,
          typeNode: "CustomNodes",
          typeFlow: undefined,
        };
        dispatch(cashFlowActions.selectNodeFlow({ [key]: value }));
        break;
      case "diagramType":
        updateObj = {
          ...updateObj,
          // typeSelected: undefined,
          typeFlow: undefined,
          typeNode: undefined,
          flow: undefined,
          node: undefined,
        };
        break;
      default:
        break;
    }
    changeParams(updateObj);
  };

  const updateState = key => e => {
    const val = e && e.target ? e.target.value : e;
    setStates({ ...states, [key]: val });
    updateParams({ key, value: val });
  };

  const updateCheckbox = key => e => {
    if (e.target.checked) {
      if (key === "onlyNode") {
        changeParams({
          ...query,
          onlyLine: undefined,
          flow: undefined,
          [key]: "true",
        });
        dispatch(cashFlowActions.selectNodeFlow({ onlyNode: "true", node: _.get(query, "node") }));
      } else {
        changeParams({
          ...query,
          [key]: "true",
        });
      }
    } else {
      if (key === "onlyNode") {
        dispatch(cashFlowActions.selectNodeFlow({ onlyNode: undefined, node: _.get(query, "node") }));
      }
      changeParams({
        ...query,
        [key]: undefined,
      });
    }
  };

  const filterOption = (inputValue, option) => {
    return option.label.toLowerCase().indexOf(inputValue.toLowerCase()) !== -1;
  };

  useEffect(() => setStates(initialState(query)), [query]);

  return (
    <HeaderFilter>
      <Form layout="vertical">
        <Row gutter={6}>
          <Col xs={24} lg={8} xl={6}>
            <FormItem label="Chọn kì">
              <DatePicker
                style={{ width: "100%" }}
                onChange={value => {
                  setStates({ ...states, period: value.format("Y-MM") });
                  changeParams({
                    ...query,
                    ...resetParamsAndReduxFilter(),
                    period: value.format("Y-MM"),
                  });
                }}
                picker="month"
                format="MM/Y"
                value={states.period ? moment(states.period, "Y-MM") : undefined}
                allowClear={false}
              />
            </FormItem>
          </Col>
          <Col xs={24} lg={16} xl={12}>
            <FormItem label="Xem theo nhà">
              <HouseSelectV2
                valueHome={states.home}
                valueChecked={states.excludeBlockId}
                onChangeHome={updateState("home")}
                onChangeCheck={updateCheckbox("excludeBlockId")}
                mode="multiple"
              />
            </FormItem>
          </Col>
          <Col xs={24} lg={8} xl={6}>
            <FormItem label="Chọn quy trình dòng tiền">
              <Select
                onChange={updateState("diagramType")}
                className="w-100"
                value={states.diagramType}
                options={[
                  {
                    value: "revenue",
                    label: "Dòng tiền doanh thu",
                  },
                  {
                    value: "revenueExpenditure",
                    label: "Dòng tiền thu và chi",
                  },
                ]}
              />
            </FormItem>
          </Col>
          <Col xs={24} lg={8} xl={6}>
            <FormItem label="Xem công nợ theo">
              <Box flex={1}>
                <Select
                  onChange={updateState("viewType")}
                  className="w-100"
                  value={states.viewType}
                  options={[
                    {
                      value: "remaining",
                      label: "Số dư hiện tại",
                    },
                    {
                      value: "total",
                      label: "Số dư tổng",
                    },
                  ]}
                />
              </Box>
            </FormItem>
          </Col>
          <Col xs={24} lg={8} xl={6}>
            <FormItem
              label={
                <Box flex justify="start">
                  <Checkbox checked={states.onlyLine} onChange={updateCheckbox("onlyLine")}>
                    Xem theo line duy nhất
                  </Checkbox>
                </Box>
              }
            >
              <Box flex={1}>
                <Select
                  onChange={updateState("flow")}
                  className="w-100"
                  value={nameSelectedLine}
                  allowClear
                  options={newListLine}
                  placeholder="Xem luồng tiền theo line"
                  showSearch
                  filterOption={filterOption}
                />
              </Box>
            </FormItem>
          </Col>
          <Col xs={24} lg={8} xl={6}>
            <FormItem
              label={
                <Box flex justify="start">
                  <Checkbox checked={states.onlyNode} onChange={updateCheckbox("onlyNode")}>
                    Xem theo bảng duy nhất
                  </Checkbox>
                </Box>
              }
            >
              <Box flex={1}>
                <Select
                  onChange={updateState("node")}
                  className="w-100"
                  value={nameSelectedNode}
                  allowClear
                  options={listNode}
                  placeholder="Xem luồng tiền theo bảng"
                  showSearch
                  filterOption={filterOption}
                />
              </Box>
            </FormItem>
          </Col>
          <Col xs={24} lg={8} xl={6}>
            <FormItem label="Mã đặt phòng">
              <Input onChange={updateState("otaBookingId")} className="w-100" value={states.otaBookingId} allowClear />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </HeaderFilter>
  );
};

export default ToolFilter;
