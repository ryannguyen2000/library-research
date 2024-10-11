import { combineReducers } from "redux";
import expenseList from "./expenseList/reducer";
import expenseOrderList from "./expenseOrderList/reducer";
import approvedExpenditure from "./approvedExpenditureList/reducer";
import newExpense from "./newExpense/reducer";

export default combineReducers({
  expenseList,
  expenseOrderList,
  approvedExpenditure,
  newExpense,
});
