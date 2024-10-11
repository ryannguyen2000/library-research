import { useState, useEffect } from "react";
import { Form, Input, Button, message } from "antd";
import { CloseOutlined, CheckOutlined } from "@ant-design/icons";

import client from "@helpers/client";
import { TitleModal, CzModal } from "@components/feedback/modal";

function FormModal({ data, toggleModal, fetchData }) {
  const [loading, setLoading] = useState(false);
  const [otp, setOTP] = useState();
  const [APIData, setAPIData] = useState();

  const type = data.subscribedNotification ? "unsubscribe" : "subscribe";

  useEffect(() => {
    (async () => {
      setLoading(true);

      const res = await client().post(`/setting/bank/account/${data._id}/${type}/request`);

      if (res.data) setAPIData(res.data.data);
      setLoading(false);
    })();
  }, [type, data._id]);

  const submit = async () => {
    if (!otp) {
      return message.error("Hãy nhập OTP!");
    }

    setLoading(true);

    const { error_code } = await client().post(`/setting/bank/account/${data._id}/${type}/confirm`, {
      otpValue: otp,
      ...APIData,
    });
    if (error_code === 0) {
      message.success("Done!");
      toggleModal();
      fetchData();
    }

    setLoading(false);
  };

  const onChange = e => {
    setOTP(e.target.value);
  };

  return (
    <CzModal
      open={true}
      onClose={toggleModal}
      title={
        <TitleModal>
          <h5>{`Xác nhận ${data.subscribedNotification ? "huỷ" : ""} đăng ký biến động số dư`}</h5>
        </TitleModal>
      }
      onCancel={toggleModal}
      footer={[
        <Button key="closeButton" onClick={toggleModal} icon={<CloseOutlined />}>
          Huỷ
        </Button>,
        <Button
          key="addButton"
          type="primary"
          onClick={submit}
          loading={loading}
          icon={<CheckOutlined />}
          disabled={!APIData}
        >
          Gửi
        </Button>,
      ]}
    >
      <Form.Item label="Nhập OTP">
        <Input value={otp} onChange={onChange} />
      </Form.Item>
    </CzModal>
  );
}

export default FormModal;
