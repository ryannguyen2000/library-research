import { all, call, put, select, takeLatest } from "redux-saga/effects";

import client from "@helpers/client";
import apiUrl from "@settings/index";
import actions from "./actions";

function* fetch({ payload }) {
  const { error_code, data } = yield call(client().get, `${apiUrl}/payment/config/auto`, {
    params: payload,
  });
  if (error_code === 0) {
    yield put({
      type: actions.FETCH_SUCCESS,
      payload: {
        data: data.data || [],
        total: data.total || 0,
        query: payload ? payload : null,
      },
    });
  } else {
    yield put({
      type: actions.FETCH_SUCCESS,
    });
  }
}

function* refresh() {
  const query = yield select(state => state.accounting.configs.paymentAutos.query);
  yield put(actions.fetch(query));
}

export default function* rootSaga() {
  yield all([takeLatest(actions.FETCH_START, fetch), takeLatest(actions.REFRESH, refresh)]);
}
