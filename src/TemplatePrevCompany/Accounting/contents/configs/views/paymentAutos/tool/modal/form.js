import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import _ from "lodash";
import moment from "moment";
import { Form, Row, Col, Input, Button, Select, Checkbox, Card, Divider, Tooltip } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";

import { PAYOUT_AUTO_TYPES, PAYOUT_AUTO_TIME } from "@settings/const";
import FormItem from "@containers/Accounting/container/FormItem";
import HouseSelect from "@components/uidata/house";
import { Box } from "@components/utility/styles";
import { FormNumber } from "@containers/Reservation/detail/contract/utils";
import PayAccount from "@components/uidata/PayAccount";
import AccountSelect from "@components/uidata/accountConfig";
import RenderTimePicker from "../../components/renderTimePicker";

const { TextArea } = Input;

const isCreateReport = (
  <FormItem
    label="Tạo báo cáo"
    labelCol={{ sm: 14 }}
    wrapperCol={{ sm: 10 }}
    name="isCreateReport"
    valuePropName="checked"
  >
    <Checkbox />
  </FormItem>
);

const isCreatePayRequest = (
  <FormItem
    label="Tạo yêu cầu thanh toán"
    labelCol={{ sm: 14 }}
    wrapperCol={{ sm: 10 }}
    name="isCreatePayRequest"
    valuePropName="checked"
  >
    <Checkbox />
  </FormItem>
);

const ignoreReport = (
  <FormItem
    label="Không trừ vào báo cáo"
    labelCol={{ sm: 14 }}
    wrapperCol={{ sm: 10 }}
    // name="ignoreReport"
    name={["payoutConfig", "ignoreReport"]}
    valuePropName="checked"
  >
    <Checkbox />
  </FormItem>
);

const payoutConfig = (
  <FormItem label="Bên chi" name={["payoutConfig", "isInternal"]}>
    <Select
      options={[
        {
          value: false,
          label: "Chủ nhà chi",
        },
        {
          value: true,
          label: "Cozrum chi",
        },
      ]}
      className="w-100"
      allowClear
    />
  </FormItem>
);

const FormCreate = ({
  form,
  data,
  // payments,
  // payAccount,
  // fetchDebit,
  // fetchCredit,
  // changeInitDebit,
  // changeInitCredit,
}) => {
  const [renderTime, setRenderTime] = useState([]);
  const [keyExisted, setKeysExisted] = useState(0);
  const [autoType, setAutoType] = useState(_.get(data, "type") || PAYOUT_AUTO_TYPES.custom.value);
  // const [blockIds, setBlockIds] = useState(_.map(_.get(data, "blockIds"), "_id"));

  useEffect(() => {
    if (data) {
      const newRenderTime = _.map(_.get(data, "autos"), (auto, index) => {
        const typeDaily = auto.type === "DAILY";
        const parts = _.split(auto.timeValue, "-");
        return {
          type: auto.type || "",
          time: auto.timeValue ? moment(typeDaily ? auto.timeValue : parts[1], "HH:mm") : "",
          timeFollow: auto.timeValue && !typeDaily ? auto.timeValue.split("-")[0] : "",
          key: index,
        };
      });
      setRenderTime(newRenderTime);
    }
  }, [data]);

  const changeTimePicker = ({ type, keyChange }) => {
    const objectIndex = _.findIndex(renderTime, { key: keyChange });
    if (objectIndex !== -1) {
      setRenderTime(prevRenderTime => {
        return prevRenderTime.map((item, index) => {
          if (index === objectIndex) {
            return {
              ...item,
              type,
              key: keyChange,
            };
          }
          return item;
        });
      });
    }
  };

  const addTimePicker = () => {
    const isEmptyRenderTime = _.isEmpty(renderTime);
    const maxNumber = !isEmptyRenderTime ? _.max([keyExisted, Number(_.last(renderTime).key)]) : keyExisted;
    const newObejct = isEmptyRenderTime
      ? {
          type: PAYOUT_AUTO_TIME.MONTHLY.value,
          // time: moment(new Date()),
          timeFollow: "",
          key: keyExisted === 0 ? 0 : keyExisted + 1,
        }
      : {
          type: PAYOUT_AUTO_TIME.MONTHLY.value,
          // time: moment(new Date()),
          timeFollow: "",
          key: maxNumber + 1,
        };
    setRenderTime(prev => {
      return [...prev, newObejct];
    });
  };

  const removeTimePicker = e => {
    if (e) {
      const setMaxKey = _.max([Number(e), keyExisted]);
      setKeysExisted(setMaxKey);
    }
    setRenderTime(prevRenderTime => {
      return prevRenderTime.filter(item => item.key !== e);
    });
  };

  const onChangeForm = e => {
    if ("type" in e) {
      setAutoType(e.type);
    }
  };

  const isShowBlock =
    autoType !== PAYOUT_AUTO_TYPES.booking_commission.value &&
    autoType !== PAYOUT_AUTO_TYPES.electric.value &&
    autoType !== PAYOUT_AUTO_TYPES.water.value;
  const isUrlImport = autoType === PAYOUT_AUTO_TYPES.payroll.value;
  const showAccountConfig = autoType === PAYOUT_AUTO_TYPES.electric.value || autoType === PAYOUT_AUTO_TYPES.water.value;

  return (
    <Form form={form} layout="vertical" onValuesChange={onChangeForm}>
      <Box>
        <Row gutter={[6]}>
          <Col xs={24} md={12}>
            <FormItem
              label="Tên"
              name="name"
              rules={[
                {
                  required: true,
                  message: "Hãy nhập!",
                },
              ]}
            >
              <Input />
            </FormItem>
          </Col>
          <Col xs={24} md={12}>
            <FormItem label="Loại" name="type">
              <Select options={_.values(PAYOUT_AUTO_TYPES)} allowClear={false} />
            </FormItem>
          </Col>
          {isShowBlock && (
            <Col xs={24} md={12}>
              <FormItem label="Nhà" name="blockIds">
                <HouseSelect mode="multiple" allowClear className="w-100" />
              </FormItem>
            </Col>
          )}
          {showAccountConfig && (
            <Col xs={24} md={12}>
              <FormItem label="Tài khoản" name="configAccountId">
                <AccountSelect allowClear className="w-100" accountType={autoType} />
              </FormItem>
            </Col>
          )}
          <Col xs={24} md={12}>
            {payoutConfig}
          </Col>
          <Col xs={24}>
            <FormItem label="Mô tả" name="description">
              <TextArea
                placeholder="Nhập mô tả.."
                autoSize={{
                  minRows: 2,
                  maxRows: 6,
                }}
              />
            </FormItem>
          </Col>
          {isUrlImport && (
            <Col xs={24}>
              <FormItem
                label="Url import"
                name={["imports", "url"]}
                rules={[
                  {
                    type: "url",
                  },
                  {
                    required: true,
                  },
                ]}
              >
                <Input />
              </FormItem>
            </Col>
          )}
          <Col xs={12} md={8}>
            {isCreateReport}
          </Col>
          <Col xs={12} md={8}>
            {isCreatePayRequest}
          </Col>
          <Col xs={12} md={8}>
            {ignoreReport}
          </Col>
          <Col xs={24} style={{ paddingBottom: "10px" }}>
            <Form.List name="payouts">
              {(fields, { add, remove }) => (
                <Card title="Thông tin chi phí">
                  {fields.map(({ key, ...restField }, index) => (
                    <FormAutoItem
                      key={key}
                      {...restField}
                      data={data}
                      remove={remove}
                      index={index}
                      autoType={autoType}
                    />
                  ))}
                  <Box flex justify="flex-end">
                    <Button
                      style={{ width: "150px" }}
                      type="dashed"
                      onClick={() => add()}
                      block
                      icon={<PlusOutlined />}
                    >
                      Thêm chi phí
                    </Button>
                  </Box>
                </Card>
              )}
            </Form.List>
          </Col>

          <Col xs={24} style={{ paddingBottom: "10px" }}>
            <Form.List name="autos">
              {(fields, { add, remove }) => {
                return (
                  <Card title="Thời gian tự động">
                    {fields.map(({ key, name, ...restField }) => (
                      <Row gutter={[6]} key={key}>
                        <Col xs={24} md={6}>
                          <FormItem
                            {...restField}
                            name={[name, "type"]}
                            label="Loại thời gian"
                            initialValue={_.get(renderTime[name], "type")}
                          >
                            <Select
                              onChange={e => changeTimePicker({ type: e, keyChange: key, name })}
                              optionFilterProp="label"
                              className="w-100"
                              allowClear
                              options={_.values(PAYOUT_AUTO_TIME)}
                            />
                          </FormItem>
                        </Col>
                        <Col xs={20} md={16}>
                          {!_.isEmpty(renderTime) && (
                            <RenderTimePicker
                              type={_.get(renderTime[name], "type")}
                              name={name}
                              restField={restField}
                            />
                          )}
                        </Col>
                        <Col xs={4} md={2} style={{ display: "flex", alignItems: "center" }}>
                          <Tooltip placement="top" title="Xóa">
                            <MinusCircleOutlined
                              style={{ color: "#ff4d4f", marginTop: "12px" }}
                              onClick={() => {
                                removeTimePicker(key);
                                remove(name);
                              }}
                            />
                          </Tooltip>
                        </Col>
                      </Row>
                    ))}
                    <Box flex justify="flex-end">
                      <Button
                        style={{ width: "150px" }}
                        type="dashed"
                        onClick={() => {
                          addTimePicker({ ...fields });
                          add();
                        }}
                        block
                        icon={<PlusOutlined />}
                      >
                        Thêm thời gian
                      </Button>
                    </Box>
                  </Card>
                );
              }}
            </Form.List>
          </Col>
        </Row>
      </Box>
    </Form>
  );
};

function FormAutoItem({ data, name, remove, index, autoType, ...restField }) {
  const isShowAmount =
    autoType !== PAYOUT_AUTO_TYPES.booking_commission.value &&
    autoType !== PAYOUT_AUTO_TYPES.expedia_commission.value &&
    autoType !== PAYOUT_AUTO_TYPES.payroll.value &&
    autoType !== PAYOUT_AUTO_TYPES.electric.value;

  const isPayAccount =
    autoType !== PAYOUT_AUTO_TYPES.booking_commission.value &&
    autoType !== PAYOUT_AUTO_TYPES.expedia_commission.value &&
    autoType !== PAYOUT_AUTO_TYPES.payroll.value;

  const isShowDescription =
    autoType !== PAYOUT_AUTO_TYPES.payroll.value && autoType !== PAYOUT_AUTO_TYPES.electric.value;
  const isShowBlock = autoType !== PAYOUT_AUTO_TYPES.payroll.value;
  // autoType !== PAYOUT_AUTO_TYPES.booking_commission.value &&
  // autoType !== PAYOUT_AUTO_TYPES.expedia_commission.value;
  const isShowConfigValue = autoType === PAYOUT_AUTO_TYPES.electric.value || autoType === PAYOUT_AUTO_TYPES.water.value;

  return (
    <Box>
      <Row gutter={[6]}>
        <Col xs={22}>
          <Row gutter={[6]}>
            <Col xs={24} md={12}>
              <FormItem {...restField} name={[name, "categoryId"]} label="Khoản chi">
                <PaymentCategorySelect />
              </FormItem>
            </Col>
            {isShowBlock && (
              <Col xs={24} md={12}>
                <FormItem
                  label="Nhà"
                  name={[name, "blockId"]}
                  // rules={[
                  //   {
                  //     required: true,
                  //   },
                  // ]}
                >
                  <HouseSelect allowClear className="w-100" />
                </FormItem>
              </Col>
            )}
            {isShowAmount && (
              <Col xs={24} md={6}>
                <FormItem {...restField} name={[name, "amount"]} label="Số tiền">
                  <FormNumber className="w-100" />
                </FormItem>
              </Col>
            )}
            {isShowAmount && (
              <Col xs={24} md={6}>
                <FormItem {...restField} name={[name, "vat"]} label="VAT">
                  <FormNumber className="w-100" />
                </FormItem>
              </Col>
            )}
            {isPayAccount && (
              <Col xs={24} md={12}>
                <FormItem {...restField} name={[name, "payAccountId"]} label="Thông tin người nhận">
                  <PayAccount
                    defaultData={_.get(data, ["payouts", index, "payAccountId"])}
                    // blockIds={blockIds}
                    // categoryId={form ? form.getFieldValue(["categoryId"]) : undefined}
                  />
                </FormItem>
              </Col>
            )}
            <Col xs={24} md={12}>
              <FormItem {...restField} name={[name, "payDebitAccountId"]} label="Nguồn chi">
                <PayAccount
                  defaultData={_.get(data, ["payouts", index, "payDebitAccountId"])}
                  transType="debit"
                  // blockIds={blockIds}
                  // categoryId={form ? form.getFieldValue(["categoryId"]) : undefined}
                />
              </FormItem>
            </Col>
            {isShowConfigValue && (
              <Col xs={24} md={12}>
                <FormItem {...restField} label="Mã KH" name={[name, "configValue"]}>
                  <Input />
                </FormItem>
              </Col>
            )}
            {isShowDescription && (
              <Col xs={24} md={12}>
                <FormItem {...restField} label="Mô tả" name={[name, "description"]}>
                  <TextArea
                    autoSize={{
                      minRows: 2,
                      maxRows: 6,
                    }}
                  />
                </FormItem>
              </Col>
            )}
            {isShowDescription && (
              <Col xs={24} md={12}>
                <FormItem {...restField} label="Nội dung chi" name={[name, "payDescription"]}>
                  <TextArea
                    autoSize={{
                      minRows: 2,
                      maxRows: 6,
                    }}
                  />
                </FormItem>
              </Col>
            )}
          </Row>
        </Col>
        <Col xs={2} md={2} style={{ display: "flex", alignItems: "flex-start" }}>
          <Tooltip placement="top" title="Xóa">
            <MinusCircleOutlined style={{ color: "#ff4d4f" }} onClick={() => remove(name)} />
          </Tooltip>
        </Col>
      </Row>
      <Divider style={{ margin: "10px 0" }} />
    </Box>
  );
}

function PaymentCategorySelect(props) {
  const payments = useSelector(state => state.Categories.payments.data);

  return (
    <Select
      showSearch
      optionFilterProp="label"
      className="w-100"
      allowClear
      options={_.map(payments, p => ({ value: p._id, label: p.name }))}
      {...props}
    />
  );
}

export default FormCreate;
