import { memo, useCallback, useState } from "react";
import { useSelector } from "react-redux";
import _ from "lodash";
import moment from "moment";
import { DollarOutlined, CreditCardOutlined, MoreOutlined, CheckOutlined } from "@ant-design/icons";
import { Modal, Button, Tooltip, Dropdown, message } from "antd";
import { Link } from "react-router-dom";

import client from "@helpers/client";
import { minFormatMoney } from "@helpers/utility";
import { PAYMENT_CARD_STATUS, PAYMENT_CHARGED_STATUS, SYSTEM_NAME } from "@settings/const";
import statusConfig from "@containers/Reservation/config";
import { sendMessageExtension } from "@helpers/extension";

import Table, { TableTitle } from "@components/tables/table.style";
import IntlMessages from "@components/utility/intlMessages";
// import OTAIcon from "@components/utility/otaicon";
import {
  ModalPayment,
  ModalRetrieveCard,
  ModalViewCard,
  ModalCharging,
} from "@components/uidata/payment/ChargeBooking";

import GuestWrapper from "@containers/Reservation/style";
import genius from "@image/genius.png";
// import defaultAvatar from "@image/default-avatar.svg";

import { getCardStatusClass, getChargedStatusClass } from "./utils";

const none = "";

const renderTime = data => (data ? moment(data).format("DD/MM/Y") : none);

const renderRooms = data => {
  if (data && data.length) return data.map(r => <p key={r._id}>{r.info && r.info.roomNo}</p>);
  return none;
};

const renderName = guestId => {
  const guest = guestId || {};
  return (
    <GuestWrapper>
      {/* <img className="avatar" src={guest.avatar || defaultAvatar} alt="" /> */}
      {guest.displayName || guest.fullName || guest.name || none}
      {guest.genius && <img className="genius" src={genius} alt="" />}
    </GuestWrapper>
  );
};

const renderPrice = (data, row) => (data ? minFormatMoney(data, row.currency === "VND" ? null : row.currency) : none);

const renderStatus = status => {
  const statusKey = _.keyBy(statusConfig, "key");

  return _.get(statusKey, [status, "title"]) || status;
};

function getModal(type) {
  if (type === "create_payment") return ModalPayment;
  if (type === "retrieve_card") return ModalRetrieveCard;
  if (type === "view_card") return ModalViewCard;
  if (type === "charge") return ModalCharging;
}

function List({ changeParams, query, total, data, loading, refresh, page, pageSize }) {
  const [state, setState] = useState({ action: null, currentData: null });
  const [selected, setSelected] = useState();

  const columnReferences = useSelector(state => state.Reservations.columnReferences);

  const toggleModal = useCallback(() => {
    setState({
      action: null,
      currentData: null,
    });
  }, []);

  // const onAutoCancelChange = useCallback(
  //   (bookingId, autoCancel) => {
  //     Modal.confirm({
  //       title: `Xác nhận ${autoCancel ? "bật" : "tắt"} tự động huỷ ?`,
  //       maskClosable: true,
  //       onOk: async () => {
  //         const { error_code } = await client(true).post(`/booking/${bookingId}/charge/autoCancel`, {
  //           autoCancel,
  //         });

  //         if (error_code === 0) {
  //           message.success("Cập nhật thành công!");
  //           refresh();
  //         } else {
  //           return Promise.reject(error_code);
  //         }
  //       },
  //     });
  //   },
  //   [refresh]
  // );

  const onTableChange = (pagination, filters, sorters) => {
    changeParams({
      page: pagination.current,
      pageSize: pagination.pageSize,
      sort: sorters.order ? sorters.columnKey : undefined,
      order: sorters.order,
    });
  };

  const renderAction = (_id, row) => {
    const { paymentCardState = {}, extranetUrl } = row;

    const cardStatus = paymentCardState.status;
    const chargedStatus = paymentCardState.chargedStatus;
    const markedInvalid = paymentCardState.markedInvalid;

    const isIgnored = chargedStatus === PAYMENT_CHARGED_STATUS.ignored.value;

    const ACTIONS = [
      {
        key: "create_payment",
        label: "Tạo thanh toán",
        inMenu: false,
        icon: <DollarOutlined />,
      },
      // {
      //   key: "retrieve_card",
      //   label: "Lấy thông tin thẻ tự động",
      //   // inMenu: false,
      //   // icon: <CreditCardOutlined />,
      //   disabled: cardStatus === PAYMENT_CARD_STATUS.valid.value || cardStatus === PAYMENT_CARD_STATUS.unknown.value,
      // },
      {
        key: "charge",
        label: "Charge thẻ tự động",
        inMenu: false,
        icon: <CreditCardOutlined className="text-green" />,
        disabled: cardStatus !== PAYMENT_CARD_STATUS.valid.value && cardStatus !== PAYMENT_CARD_STATUS.unknown.value,
      },
      {
        key: "view_on_extranet",
        label: "Xem thông tin thẻ trên Booking.com",
        inMenu: false,
        icon: <CreditCardOutlined className="text-warn" />,
        disabled: !extranetUrl,
      },
      {
        key: "view_card",
        label: "Xem thông tin thẻ",
      },
      {
        key: "mark_error",
        label: `Báo lỗi thẻ ${
          markedInvalid && paymentCardState.markedAt
            ? ` (Đã báo bởi ${_.get(paymentCardState, "markedBy.name", SYSTEM_NAME.TEXT)} lúc ${moment(
                paymentCardState.markedAt
              ).format("DD/MM/Y HH:mm")})`
            : ""
        }`,
        disabled: cardStatus === PAYMENT_CARD_STATUS.valid.value || !!markedInvalid,
      },
      {
        key: "change_status",
        label: isIgnored ? "Thêm vào danh sách theo dõi" : "Bỏ khỏi danh sách theo dõi",
      },
    ];

    const onActionClicked = async e => {
      const currentAction = ACTIONS.find(a => a.key === e.key);
      if (!currentAction) return;

      if (e.key === "view_on_extranet") {
        let isConnected = false;

        try {
          isConnected = await sendMessageExtension({ type: "server_connection_check" });
        } catch (e) {
          console.log(e);
        }

        if (!isConnected) {
          Modal.confirm({
            title: "Extension chưa được kết nối bạn có muốn tiếp tục không?",
            maskClosable: true,
            onOk: () => {
              window.open(extranetUrl, "_blank", "location=yes,height=670,width=520,scrollbars=yes,status=yes");
            },
          });
        } else {
          window.open(extranetUrl, "_blank", "location=yes,height=670,width=520,scrollbars=yes,status=yes");
        }

        return;
      }

      if (e.key === "mark_error") {
        Modal.confirm({
          title: "Xác nhận thông báo lỗi thẻ ?",
          maskClosable: true,
          onOk: async () => {
            const { error_code } = await client().post(`/finance/booking/charge/${_id}/markInvalidCard`);

            if (error_code === 0) {
              message.success("Báo lỗi thành công!");
              refresh();
            } else {
              return Promise.reject(error_code);
            }
          },
        });
        return;
      }

      if (e.key === "change_status") {
        Modal.confirm({
          title: `Xác nhận ${isIgnored ? "thêm vào" : "Bỏ khỏi"} danh sách theo dõi ?`,
          maskClosable: true,
          onOk: async () => {
            const { error_code } = await client().put(`/booking/${_id}/charge/status`, {
              status: isIgnored ? PAYMENT_CHARGED_STATUS.need_to_charge.value : PAYMENT_CHARGED_STATUS.ignored.value,
            });

            if (error_code === 0) {
              message.success("Thành công!");
              refresh();
            } else {
              return Promise.reject(error_code);
            }
          },
        });
        return;
      }

      setState({
        action: e.key,
        currentData: row,
      });
    };

    return (
      <div>
        {ACTIONS.filter(acc => acc.inMenu === false).map(acc => (
          <Tooltip title={acc.label} key={acc.key}>
            <Button
              type="link"
              icon={acc.icon}
              disabled={acc.disabled}
              onClick={() => {
                onActionClicked({ key: acc.key });
              }}
            />
          </Tooltip>
        ))}
        <Dropdown
          menu={{ items: ACTIONS.filter(acc => acc.inMenu !== false), onClick: onActionClicked }}
          placement="bottomLeft"
          trigger={["click"]}
        >
          <Button type="link" icon={<MoreOutlined />}></Button>
        </Dropdown>
      </div>
    );
  };

  const { sort, order } = query;

  const columns = [
    {
      title: <IntlMessages id={columnReferences.reservations.blockId} />,
      dataIndex: "blockId",
      render: block => _.get(block, "info.shortName[0]") || _.get(block, "info.name"),
    },
    {
      title: <IntlMessages id={columnReferences.reservations.roomIds} />,
      dataIndex: "reservateRooms",
      render: renderRooms,
    },
    {
      title: <IntlMessages id={columnReferences.reservations.otaBookingId} />,
      dataIndex: "otaBookingId",
      render: (otaBookingId, row) => <Link to={`/reservations/${row._id}`}>{otaBookingId}</Link>,
    },
    {
      title: <IntlMessages id={columnReferences.guests.fullName} />,
      key: "fullName",
      dataIndex: "guestId",
      render: renderName,
    },
    {
      title: <IntlMessages id={columnReferences.reservations.price} />,
      dataIndex: "price",
      render: renderPrice,
    },
    {
      title: <IntlMessages id={columnReferences.reservations.status} />,
      dataIndex: "status",
      render: renderStatus,
    },
    {
      title: <IntlMessages id={columnReferences.reservations.checkin} />,
      dataIndex: "from",
      key: "checkin",
      sorter: true,
      sortOrder: sort && sort === "checkin" ? order : false,
      render: renderTime,
    },
    {
      title: <IntlMessages id={columnReferences.reservations.checkout} />,
      dataIndex: "to",
      key: "checkout",
      sorter: true,
      sortOrder: sort && sort === "checkout" ? order : false,
      render: renderTime,
    },
    {
      title: "TT Thẻ",
      dataIndex: ["paymentCardState", "status"],
      render: (status, row) => {
        const description = _.get(row.paymentCardState, "description");

        const className = getCardStatusClass(status);

        return (
          <Tooltip title={description}>
            <span className={className}>{_.get(PAYMENT_CARD_STATUS, [status, "label"], status)}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "TT Charge",
      dataIndex: ["paymentCardState", "chargedStatus"],
      render: chargedStatus => {
        const className = getChargedStatusClass(chargedStatus);

        return (
          <span className={className}>{_.get(PAYMENT_CHARGED_STATUS, [chargedStatus, "label"], chargedStatus)}</span>
        );
      },
    },
    {
      title: "Báo lỗi",
      dataIndex: ["paymentCardState", "markedInvalid"],
      render: markedInvalid => {
        return markedInvalid ? <CheckOutlined /> : null;
      },
    },
    // {
    //   title: "Tự động huỷ",
    //   dataIndex: ["paymentCardState", "autoCancel"],
    //   render: (autoCancel, row) => <Switch checked={!!autoCancel} onChange={e => onAutoCancelChange(row._id, e)} />,
    // },
    {
      width: 70,
      dataIndex: "_id",
      render: renderAction,
    },
  ];

  const pageSizeOptions = ["10", "20", "50", "100"];

  const ModalComponent = getModal(state.action);

  return (
    <>
      {ModalComponent && (
        <ModalComponent
          {...state}
          bookingId={_.get(state, "currentData._id")}
          toggleModal={toggleModal}
          onSuccess={refresh}
        />
      )}
      <TableTitle>
        <span>{total}</span>{" "}
        <span className="text-upper">
          <IntlMessages id="reservations" />
        </span>
      </TableTitle>
      <Table
        rowKey="_id"
        className="cozTable"
        columns={columns}
        loading={loading}
        dataSource={data}
        onChange={onTableChange}
        onRow={record => ({
          onClick: () => {
            setSelected(record._id);
          },
          style:
            selected === record._id
              ? {
                  backgroundColor: "#73ff6b45",
                }
              : {},
        })}
        pagination={{
          current: page,
          pageSize,
          total: total || 0,
          pageSizeOptions,
          showSizeChanger: true,
          showTotal: (t, range) => {
            return `Hiển thị ${range[0]}-${range[1]} trên tổng số ${total} kết quả`;
          },
        }}
      />
    </>
  );
}

export default memo(List);
