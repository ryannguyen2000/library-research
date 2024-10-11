import { all } from "redux-saga/effects";
import payment from "./payment/saga";
import transaction from "./transaction/saga";

export default function* rootSaga() {
  yield all([payment(), transaction()]);
}
