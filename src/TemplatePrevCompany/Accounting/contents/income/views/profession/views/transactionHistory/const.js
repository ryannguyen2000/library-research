import moment from "moment";

export const ranges = {
  "hôm nay": [moment(), moment()],
  "Tuần này": [moment().startOf("isoWeek"), moment().endOf("isoWeek")],
  "Tháng này": [moment().startOf("month"), moment().endOf("month")],
};

export const statusOptions = {
  completed: {
    value: "complete",
    label: "Complete",
  },
  not_paid_out: {
    value: "not_paid_out",
    label: "Not paid out",
  },
  pending: {
    value: "pending",
    label: "Pending",
  },
};

export const channelOptions = {
  direct: {
    value: "direct",
    label: "Direct",
  },
  sync: {
    value: "sync",
    label: "SYNC",
  },
  terminal: {
    value: "terminal",
    label: "Terminal",
  },
};

export const transactionTypeOptions = {
  "3ds": {
    value: "3ds",
    label: "3DS",
  },
  cancel: {
    value: "cancel",
    label: "Cancel",
  },
  capture: {
    value: "capture",
    label: "Capture",
  },
  refund: {
    value: "refund",
    label: "Refund",
  },
  sale: {
    value: "sale",
    label: "Sale",
  },
  wallet: {
    value: "wallet",
    label: "Wallet",
  },
};

export const transactionStatusOptions = {
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
  },
  completed: {
    value: "complete",
    label: "Complete",
  },
  declined: {
    value: "declined",
    label: "Declined",
  },
  failed: {
    value: "failed",
    label: "Failed",
  },
  pending: {
    value: "pending",
    label: "Pending",
  },
  refunded: {
    value: "refunded",
    label: "Refunded",
  },
};

export const dataTypeOptions = {
  checkInDate: {
    value: "checkInDate",
    label: "Check-in Date",
  },
  checkOutDate: {
    value: "checkOutDate",
    label: "Check-out Date",
  },
  paymentDate: {
    value: "paymentDate",
    label: "Paymnent Date",
  },
};
