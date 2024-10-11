import _ from "lodash";
import { Button, Modal, message, Tooltip } from "antd";
import { useState } from "react";
import styled from "styled-components";

import { ExclamationCircleOutlined, SyncOutlined } from "@ant-design/icons";
import client from "@helpers/client";

function getType(type, id) {
  if (type === "delete") {
    return {
      title: "xóa chi phí.",
      tooltipText: "Xóa chi phí",
      btn: "Xác nhận",
      icon: (
        <span>
          <i className="ion-trash-a text-red" />
        </span>
      ),
      api: `payment/config/auto/${id}`,
      method: "delete",
    };
  }

  if (type === "sync") {
    return {
      title: "bắt đầu chạy.",
      tooltipText: "exec",
      btn: "Xác nhận",
      icon: <SyncOutlined />,
      api: `payment/config/auto/exec`,
      body: {
        autoId: id,
      },
      method: "post",
    };
  }
}

const BtnConform = ({ type, id, refresh }) => {
  const [isLoading, setIsLoading] = useState(false);

  const isDanger = type === "delete" || type === "reject";
  const contentAction = getType(type, id);

  if (!contentAction) return null;

  const confirm = () => {
    const okText = _.get(contentAction, "btn");
    const title = `Bạn có muốn ${_.get(contentAction, "title")}`;
    const messageSuccess = _.get(contentAction, "title");
    const api = _.get(contentAction, "api");

    return Modal.confirm({
      title,
      icon: <ExclamationCircleOutlined />,
      okText,
      maskClosable: true,
      onOk: async () => {
        setIsLoading(true);
        try {
          const { error_code } = await client()[contentAction.method](`/${api}`, contentAction.body);
          if (error_code === 0) {
            message.success(`${messageSuccess} thành công`);
            if (refresh) refresh();
          }
        } catch (error) {
          console.log("error🚀🚀🚀", error);
        } finally {
          setIsLoading(false);
        }
      },
      cancelText: "Đóng",
    });
  };

  return (
    <Tooltip placement="top" title={contentAction.tooltipText}>
      <CsButton type="text" danger={isDanger} loading={isLoading} onClick={() => confirm()}>
        {contentAction.icon}
      </CsButton>
    </Tooltip>
  );
};

export const CsButton = styled(Button)`
  padding: 2px !important;
  margin-right: 5px;
  &:last-child {
    margin-right: 0px;
  }
  &.delete {
    .ion-trash-a {
      font-size: 18px !important;
      &:hover {
        transform: scale(1.1);
      }
    }
  }
`;

export default BtnConform;
