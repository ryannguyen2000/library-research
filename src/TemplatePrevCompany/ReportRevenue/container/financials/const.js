import { CommentOutlined, PoundOutlined } from "@ant-design/icons";

import IncomeStatement from "./views/incomeStatement";
import RevenueStream from "./views/revenueStream";
import ArchivalRecords from "./views/archivalRecords";
import ExpensesStream from "./views/expensesStream";

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
    to: "list_of_company_document",
    icon: <PoundOutlined />,
    element: ArchivalRecords,
  },
];