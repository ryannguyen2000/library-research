import _ from "lodash";
import moment from "moment";
import { minFormatMoney } from "@helpers/utility";

export const formatPrice = (amount = 0, currency = "") => {
  return (
    <div className={`w-100 text-left ${amount >= 0 ? "text-green" : "text-red"}`}>{`${minFormatMoney(
      amount || ""
    )} ${currency}`}</div>
  );
};

export const renderAmount = data => {
  if (data) {
    return formatPrice(_.get(data, "amount") || _.get(data, "value"), _.get(data, "currency"));
  }
  return "";
};

export const convertDate = (value, format) => {
  const date = value ? new Date(value * 1000) : undefined;
  if (format) {
    return date ? moment(date).format(format) : "";
  }
  return date ? moment(date).format("Y/MM/DD HH:mm") : "";
};
