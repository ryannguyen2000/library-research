import moment from "moment";

import { CommentOutlined, PoundOutlined } from "@ant-design/icons";

import IncomeStatement from "./container/incomeStatement";
import RevenueStream from "./container/revenueStream";
import ArchivalRecords from "./container/archivalRecords";
import ExpensesStream from "./container/expensesStream";

export const routes = [
  {
    to: "incomeStatement",
    icon: <CommentOutlined />,
    element: IncomeStatement,
  },
  {
    to: "revenueStream",
    icon: <PoundOutlined />,
    element: RevenueStream,
  },
  {
    to: "expensesStream",
    icon: <PoundOutlined />,
    element: ExpensesStream,
  },
  {
    to: "archival_records",
    icon: <PoundOutlined />,
    element: ArchivalRecords,
    disabled: true,
  },
];

export const pickTimeForToFrom = timelineType => {
  let from = undefined;
  let to = undefined;

  if (timelineType) {
    from = moment().startOf("month").format("Y-MM-DD");
    to = moment().endOf("month").format("Y-MM-DD");

    switch (timelineType) {
      case "WEEKLY":
        to = moment().endOf("month").format("Y-MM-DD");
        break;
      case "MONTHLY":
        from = moment().startOf("year").format("Y-MM-DD")
        to = moment().endOf("months").format("Y-MM-DD")
        break;
      case "QUARTERLY":
        from = moment().subtract(2, "Q").startOf("Q").format("Y-MM-DD")
        to = moment().endOf('Q').format("Y-MM-DD")
        break;
      case "YEARLY":
        from = moment().subtract(1, "years").startOf("year").format("Y-MM-DD");
        to = moment().endOf("year").format("Y-MM-DD");
        break;
      default:
        break;
    }
  }
  return { from, to };
};

export const FOOTER_SIZE_BAR_CHART = {
  "DAILY": 10,
  "WEEKLY": 40,
  "MONTHLY": 15,
  "QUARTERLY": 15,
  "YEARLY": 10
}

export const LEFT_SIZE_BAR_CHART = {
  "DAILY": 20,
  "WEEKLY": 40,
  "MONTHLY": 40,
  "QUARTERLY": 45,
  "YEARLY": 45
}