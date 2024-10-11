import { all } from "redux-saga/effects";
import incomeFromOTA from "./incomFromOTA/saga";
import transactionHistory from "./transactionHistory/sagas";

export default function* rootSaga() {
  yield all([incomeFromOTA(), transactionHistory()]);
}
