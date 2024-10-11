import { minFormatMoney } from "@helpers/utility";
import IntlMessages from "@components/utility/intlMessages";
import moment from "moment";
import _ from "lodash";

import { Link } from "react-router-dom";
import { CheckOutlined } from "@ant-design/icons";

import { PAYOUT_SOURCES, PAYOUT_BUY_TYPES } from "@settings/const";
import { TagStatus } from "@containers/Finance/payout/tool/modalConfirm";

export const formatPrice = (amount = 0, currency = "") => {
  return (
    <div className={`w-100 text-right ${amount >= 0 ? "text-green" : "text-red"}`}>{`${minFormatMoney(amount || "")} ${
      currency === "VND" ? "" : currency
    }`}</div>
  );
};

export const renderAmount = (data, { isChild }) => {
  if (data && !isChild) {
    if (_.get(data, "currencyAmount")) {
      return formatPrice(_.get(data, "currencyAmount.amount"), _.get(data, "currencyAmount.currency"));
    }
    return formatPrice(_.get(data, "amount"), _.get(data, "currency"));
  }
  return "";
};

export const rendertotalAmount = (data, { isChild }) => {
  if (data && !isChild) {
    return formatPrice(data.totalAmount, data.currency);
  }
  return "";
};

export const renderAmountFromOTA = (data, { isChild }) => {
  if (data && !isChild) {
    return formatPrice(data.amountFromOTA, data.currency);
  }
  return "";
};

export const renderAmountToOTA = (data, { isChild }) => {
  if (data && !isChild) {
    return formatPrice(data.amountToOTA, data.currency);
  }
  return "";
};

export const renderAmountToSale = (data, { isChild }) => {
  if (data && !isChild) {
    return formatPrice(data.amountToSale, data.currency);
  }
  return "";
};

export const renderStatus = (id = "waiting") => {
  return (
    <TagStatus className={id}>
      <IntlMessages id={id ? id.toLowerCase() : ""} />
    </TagStatus>
  );
};

export const renderIconOTA = ota => {
  return ota ? <img className="icon-cell" src={`/images/svg/${ota}.svg`} alt={ota} /> : "";
};

export const renderBookingId = data => {
  if (_.get(data, "bookingId")) {
    return (
      <a href={`/reservations/${_.get(data, "bookingId")}`} rel="noopener noreferrer" target="_blank">
        {_.get(data, "otaBookingId")}
      </a>
    );
  }
  return "";
};

// export const renderTime = item => {
//   return <span>{moment(item).utcOffset(0).format("DD/MM/Y HH:mm")}</span>;
// };

// export const renderCreatedAt = data => (data ? moment(data).format("DD/MM/Y") : "");

export const renderBlock = (data, houses) => {
  const result = _.intersectionWith(houses, data, (obj, id) => obj._id === id);
  return _.map(result, (home, index) => <p key={index}>{_.get(home, "info.name")}</p>);
};

export const renderHome = data => {
  return _.map(_.get(data, "blockIds"), home => <p key={_.get(home, "_id")}>{_.get(home, "info.name")}</p>);
};

// export const renderCreatedBy = data => {
//   return <p>{_.get(data, "name")}</p>;
// };

// sadasd

export const status = {
  processing: <span className="text-warn">Chưa duyệt</span>,
  confirmed: <span className="text-blue">Đã duyệt</span>,
  deleted: <span className="text-red">Đã xoá</span>,
};

export const renderCategory = (data, { otherCategory }) => {
  return data ? _.get(data, "categoryId.name") : otherCategory || "";
};

export const sorterAmount = (a, b) => (a && b ? (a.currencyAmount.amount > b.currencyAmount.amount ? 1 : -1) : 0);

export const renderRooms = data => {
  return _.map(data, "info.roomNo").join(", ");
};

export const renderState = data => {
  return data ? status[data] : "";
};

export const renderCreatedAt = data => (data ? moment(data).format("DD/MM/Y HH:mm") : "");

export const sorterCreatedAt = ({ paidAt: a }, { paidAt: b }) => {
  return a && b ? (a > b ? 1 : -1) : 0;
};

export const sorterPaidAt = ({ paidAt: a }, { paidAt: b }) => {
  return a && b ? (a > b ? 1 : -1) : 0;
};

export const renderCreatedBy = data => (data ? _.get(data, "createdBy.name") || _.get(data, "createdBy.username") : "");

export const renderSource = data =>
  PAYOUT_SOURCES[_.get(data, "source")] ? <IntlMessages id={PAYOUT_SOURCES[_.get(data, "source")].name} /> : data;

export const rowClassName = ({ state }) => (state === "deleted" ? "text-through" : "");

export const renderQuantity = data => {
  return data ? data.quantity : "";
};

export const renderUnitPrice = data => {
  return data ? (
    <span className="text-green">{`${minFormatMoney(
      data.unitPrice,
      data.currency !== "VND" ? data.currency : ""
    )}`}</span>
  ) : (
    ""
  );
};

export const renderVAT = data => {
  if (!data.vat) return "";
  return <span className="text-green">{minFormatMoney(data.vat)}</span>;
};

export const renderDistribute = (data, { distributeMonths }) => {
  return data ? `${distributeMonths} tháng` : "";
};

export const sorterDistribute = (a, b) => (a && b ? (a.distributeMonths > b.distributeMonths ? 1 : -1) : 0);

export const renderIsInternal = data => {
  return data ? <CheckOutlined className="text-green" /> : "";
};

export const renderExportNo = data => {
  return data ? <Link to={`/finance/reports-payout/${data._id}`}>{data.noId}</Link> : "";
};

export const renderBuyType = data => {
  return data ? _.get(PAYOUT_BUY_TYPES, [data, "label"], data) : "";
};

export const payConfirmedBy = data => (data ? data.name || data.username : "");

export const payConfirmedDate = data => (data ? moment(data).format("DD/MM/Y") : "");

export const debitAccount = data => {
  if (!data && _.isEmpty(data)) {
    return;
  }
  return `${_.get(data, "debitAccountId.name") || _.get(data, "debitAccountId.accountName")} (${_.get(
    data,
    "debitAccountId.shortName"
  )} - ${_.get(data, "debitAccountId.accountName")} - ${_.get(data, "debitAccountId.accountNos[0]")})`;
};
