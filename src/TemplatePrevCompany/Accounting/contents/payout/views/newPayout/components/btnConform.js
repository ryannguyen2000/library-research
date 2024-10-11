import _ from "lodash";
import { Button, Modal, message, Tooltip } from "antd";
import { useState } from "react";
import styled from "styled-components";

import { ExclamationCircleOutlined } from "@ant-design/icons";
import client from "@helpers/client";

const BtnConform = ({ type, id, refresh, ...props }) => {
  const [isLoading, setIsLoading] = useState(false);

  const isDanger = type === "delete" || type === "reject";

  const contentAction = {
    create: {
      title: "tạo lệnh chi.",
      tooltipText: "",
      btn: "Tạo lệnh",
      api: `payment/pay/request/${id}`,
    },
    approve: {
      title: "duyệt lệnh chi.",
      tooltipText: "",
      btn: "Duyệt",
      api: `payment/pay/request/${id}/approve`,
    },
    reject: {
      title: "từ chối duyệt lệnh",
      tooltipText: "",
      btn: "Từ chối",
      api: `payment/pay/request/${id}/decline`,
    },
    delete: {
      title: "xóa duyệt lệnh.",
      tooltipText: "Xóa lệnh",
      btn: "Xóa lệnh",
      icon: (
        <span>
          <i className="ion-trash-a text-red" />
        </span>
      ),
      api: `payment/pay/request/${id}`,
    },
    report: {
      title: "báo lỗi giao dịch này ?",
      tooltipText: "",
      btn: "Báo lỗi",
      api: `payment/pay/request/${id}/reportError`,
    },
    undoReport: {
      title: "hoàn tác báo lỗi giao dịch này ?",
      tooltipText: "",
      btn: "Huỷ báo lỗi",
      api: `payment/pay/request/${id}/reportError`,
    },
  };

  const confirm = e => {
    e.stopPropagation();

    const okText = _.get(contentAction[type], "btn");
    const title = `Bạn có muốn ${_.get(contentAction[type], "title")}`;
    const messageSuccess = _.get(contentAction[type], "btn");
    const api = _.get(contentAction[type], "api");
    return Modal.confirm({
      title,
      icon: <ExclamationCircleOutlined />,
      okText,
      maskClosable: true,
      onOk: async () => {
        setIsLoading(true);
        try {
          const { error_code } =
            type === "delete"
              ? await client().delete(`/${api}`)
              : type === "create"
              ? await client().put(`/${api}`, props.bodyReq)
              : await client().post(`/${api}`, props.bodyReq);
          if (error_code === 0) {
            message.success(`${messageSuccess} thành công`);
            refresh();
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
    <Tooltip placement="top" title={contentAction[type].tooltipText}>
      <CsButton type="text" danger={isDanger} loading={isLoading} onClick={confirm}>
        {type === "delete" ? contentAction.delete.icon : contentAction[type].btn}
      </CsButton>
    </Tooltip>
  );
};

export const CsButton = styled(Button)`
  padding: 2px 6px !important;
  /* margin-right: 5px; */
  background: #fff;
  &:last-child {
    margin-right: 0px;
  }
  &.delete {
    &:hover {
      /* background: none; */
    }
    .ion-trash-a {
      font-size: 18px !important;
      &:hover {
        transform: scale(1.1);
      }
    }
  }
`;

export default BtnConform;
