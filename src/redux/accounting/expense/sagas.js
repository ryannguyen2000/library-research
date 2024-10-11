import { all } from "redux-saga/effects";
import expenseOrderList from "./expenseOrderList/saga";
import newExpense from "./newExpense/saga";

export default function* rootSaga() {
  yield all([expenseOrderList(), newExpense()]);
}
