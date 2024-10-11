import { minFormatMoney } from "@helpers/utility";
import IntlMessages from "@components/utility/intlMessages";
import StatusTag from "@containers/Task/style";
import moment from "moment";
import _ from "lodash";

export const formatPrice = (amount = 0, currency = "") => {
  return (
    <div className={`w-100 text-right ${amount >= 0 ? "text-green" : "text-red"}`}>{`${minFormatMoney(amount || "")} ${
      currency === "VND" ? "" : currency
    }`}</div>
  );
};

export const renderAmount = (data, { isChild }) => {
  if (data && !isChild) {
    return formatPrice(data.amount, data.currency);
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

export const renderStatus = (id = "waiting") => (
  <StatusTag className={id}>
    <IntlMessages id={id} />
  </StatusTag>
);

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

export const renderTime = item => {
  return <span>{moment(item).utcOffset(0).format("DD/MM/Y HH:mm")}</span>;
};
