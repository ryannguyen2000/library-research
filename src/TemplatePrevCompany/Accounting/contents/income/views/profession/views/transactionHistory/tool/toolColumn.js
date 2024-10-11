import React from "react";
import { connect } from "react-redux";
import transactionActions from "@redux/accounting/income/profession/transactionHistory/transaction/actions";
import ToolColumn from "@components/page/toolColumn";

const { changeColumn } = transactionActions;

const columns_unpaid = {};

const ToolBar = ({ type, ...props }) => {
  return <ToolColumn {...props} disabledCb={key => type === "unpaid" && !columns_unpaid[key]} />;
};

export default connect(
  ({ accounting: { income } }) => ({
    columns: income.profession.transactionHistory.transaction.columns,
    columnReferences: income.profession.transactionHistory.transaction.columnReferences,
  }),
  { changeColumn }
)(ToolBar);
