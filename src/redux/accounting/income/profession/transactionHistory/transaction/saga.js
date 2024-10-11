import { all, call, put, select, takeLatest } from "redux-saga/effects";
import _ from "lodash";

import client from "@helpers/client";
import apiUrl from "@settings/index";
import actions from "./actions";

function* fetch({ payload }) {
  const { error_code, data } = yield call(client().get, `${apiUrl}/finance/booking/charge/report/transactions`, {
    params: payload,
  });
  if (error_code === 0) {
    yield put({
      type: actions.FETCH_SUCCESS,
      payload: {
        data: _.get(data, "data", []),
        total: _.get(data, "meta.total", 0),
        query: payload ? payload.query : null,
      },
    });
  } else {
    yield put({
      type: actions.FETCH_SUCCESS,
    });
  }
}

function* refresh() {
  const query = yield select(state => state.assetIssues.kind.query);
  yield put(actions.fetch(query));
}

export default function* rootSaga() {
  yield all([takeLatest(actions.FETCH_START, fetch), takeLatest(actions.REFRESH, refresh)]);
}
