import { useState, useEffect } from "react";
import { Form, Input, Button, Select } from "antd";
import { CloseOutlined, CheckOutlined } from "@ant-design/icons";
import _ from "lodash";

import { useHouse, usePaymentCategory } from "@hooks/categories";
import { BANK_ACCOUNT_SOURCE_TYPES } from "@settings/const";
import { TitleModal, CzModal } from "@components/feedback/modal";
import IntlMessages from "@components/utility/intlMessages";
import BankSelect from "@components/uidata/bank";

function FormModal({ data, toggleModal, handleSubmit }) {
  const [loading, setLoading] = useState(false);
  const [sourceType, setSourceType] = useState(data.sourceType);
  const [formRef] = Form.useForm();
  const [payment] = usePaymentCategory();
  const [houses] = useHouse();

  useEffect(() => {
    formRef.setFieldsValue({
      ...data,
      bankId: _.get(data, "bankId._id"),
      blockIds: _.map(data.blockIds, bl => _.get(bl, "_id")),
      payoutCategoryIds: _.map(data.payoutCategoryIds, p => _.get(p, "_id")),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleUpdate = async () => {
    try {
      setLoading(true);

      const values = await formRef.validateFields();

      const errorCode = await handleSubmit({ ...values, _id: data._id });
      if (errorCode === 0) {
        toggleModal();
      }
      setLoading(false);
    } catch (e) {
      console.log("Validate Failed:", e);
    }
  };

  const onFieldsChange = formFields => {
    // console.log(formFields);
    formFields.forEach(formField => {
      if (formField.name && formField.name[0] === "sourceType") {
        setSourceType(formField.value);
      }
    });
  };

  return (
    <CzModal
      width={700}
      open={true}
      onClose={toggleModal}
      title={
        <TitleModal>
          <h5>{data._id ? `Cập nhật thông tin tài khoản` : "Tạo mới tài khoản"}</h5>
        </TitleModal>
      }
      onCancel={toggleModal}
      footer={[
        <Button key="closeButton" onClick={toggleModal} icon={<CloseOutlined />}>
          Huỷ
        </Button>,
        <Button key="addButton" type="primary" onClick={handleUpdate} loading={loading} icon={<CheckOutlined />}>
          {data._id ? "Cập nhật" : "Tạo"}
        </Button>,
      ]}
    >
      <Form form={formRef} layout="vertical" name="control-ref" onFieldsChange={onFieldsChange}>
        {!!_.get(data, "no") && (
          <Form.Item>
            <h4>No: {data.no}</h4>
          </Form.Item>
        )}
        <Form.Item
          name="name"
          label="Tên"
          rules={[
            {
              required: true,
              message: "Hãy nhập tên!",
            },
          ]}
        >
          <Input placeholder="Tên..." />
        </Form.Item>
        <Form.Item
          name="sourceType"
          label="Loại tài khoản"
          rules={[
            {
              required: true,
              message: "Hãy chọn!",
            },
          ]}
        >
          <Select
            showSearch
            className="w-100"
            allowClear
            options={_.values(BANK_ACCOUNT_SOURCE_TYPES).map(v => ({
              value: v.value,
              label: <IntlMessages id={v.name} />,
            }))}
          />
        </Form.Item>
        {sourceType === BANK_ACCOUNT_SOURCE_TYPES.banking.value && (
          <>
            <Form.Item
              name="bankId"
              label="Tên ngân hàng"
              rules={[
                {
                  required: true,
                  message: "Hãy nhập!",
                },
              ]}
            >
              <BankSelect placeholder="Ngân hàng" className="w-100" />
            </Form.Item>
            <Form.Item
              name={["accountNos", 0]}
              label="Số tài khoản"
              rules={[
                {
                  required: true,
                  message: "Hãy nhập!",
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="accountName" label="Tên tài khoản">
              <Input />
            </Form.Item>
          </>
        )}
        <Form.Item name="blockIds" label="Nhà">
          <Select
            showSearch
            optionFilterProp="label"
            className="w-100"
            allowClear
            mode="multiple"
            options={houses.data.map(h => ({ value: h._id, label: h.info.name }))}
          />
        </Form.Item>
        <Form.Item name="payoutCategoryIds" label="Loại chi phí">
          <Select
            showSearch
            className="w-100"
            allowClear
            mode="multiple"
            optionFilterProp="label"
            options={payment.data.map(p => ({ value: p._id, label: p.name }))}
          />
        </Form.Item>
        <Form.Item name="description" label="Mô tả">
          <Input />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ">
          <Input />
        </Form.Item>
        <Form.Item name="phoneNumber" label="Số điện thoại">
          <Input />
        </Form.Item>
      </Form>
    </CzModal>
  );
}

export default FormModal;
