import { all } from "redux-saga/effects";
import signInSagas from "./auth/signIn/sagas";

export default function* rootSaga() {
  yield all([signInSagas()]);
}
