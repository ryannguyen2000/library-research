import { memo, useEffect, useState } from "react";
import { message, Modal, Form, Button } from "antd";
import _ from "lodash";
// import { connect } from "react-redux";
import moment from "moment";

// import paymentActions from "@redux/categories/payments/actions";
import { PAYOUT_AUTO_TYPES } from "@settings/const";
import client from "@helpers/client";
// import payAccountActions from "@redux/accounting/payAccount/actions";
import FormCreate from "./form";

const initParams = (data = {}) => {
  return {
    ...data,
    blockIds: _.map(_.get(data, "blockIds"), "_id"),
    payouts: _.map(_.get(data, "payouts"), payout => ({
      ...payout,
      payAccountId: _.get(payout, "payAccountId._id"),
      payDebitAccountId: _.get(payout, "payDebitAccountId._id"),
      categoryId: _.get(payout, "categoryId._id"),
    })),
    autos: _.map(_.get(data, "autos"), (auto, index) => {
      const typeDaily = auto.type === "DAILY";
      const parts = _.split(auto.timeValue, "-");
      return {
        type: auto.type,
        time: auto.timeValue ? moment(typeDaily ? auto.timeValue : parts[1], "HH:mm") : "",
        timeFollow: auto.timeValue && !typeDaily ? Number(auto.timeValue.split("-")[0]) : "",
        addTimeForPeriod: auto.addTimeForPeriod,
        key: index,
      };
    }),
    type: _.get(data, "type") || PAYOUT_AUTO_TYPES.custom.value,
  };
};

const ModaPaymentAutos = ({ data, onToggleModal, refresh }) => {
  const [loading, setLoading] = useState(false);
  const [formRef] = Form.useForm();

  const onCreate = async () => {
    setLoading(true);

    await formRef
      .validateFields()
      .then(async values => {
        const bodyReq = {
          ...values,
          autos: _.map(values.autos, auto => {
            const timeValue = auto.timeFollow
              ? `${_.get(auto, "timeFollow")}-${moment(_.get(auto, "time")).format("HH:mm")}`
              : moment(_.get(auto, "time")).format("HH:mm");

            return { type: _.get(auto, "type"), timeValue, addTimeForPeriod: auto.addTimeForPeriod };
          }),
        };

        const { error_code } = await (data && data._id
          ? client().put(`/payment/config/auto/${data._id}`, bodyReq)
          : client().post(`/payment/config/auto`, bodyReq));

        if (error_code === 0) {
          message.success("Cập nhật thành công!");
          // formRef.setFieldsValue(initParams);
          refresh();
          onToggleModal();
        }
      })
      .catch(() => {});

    setLoading(false);
  };

  useEffect(() => {
    formRef.setFieldsValue(initParams(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <Modal
      width={800}
      title={data ? "Cập nhật chi phí tự động" : "Tạo chi phí tự động"}
      open={true}
      onCancel={onToggleModal}
      footer={[
        <Button key="closeButton" onClick={onToggleModal}>
          Đóng
        </Button>,
        <Button loading={loading} key="addButton" type="primary" onClick={onCreate}>
          Lưu
        </Button>,
      ]}
    >
      <FormCreate data={data} form={formRef} />
    </Modal>
  );
};

export default memo(ModaPaymentAutos);
