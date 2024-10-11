import { all, call, put, select, takeLatest } from "redux-saga/effects";
import _ from "lodash";

import client from "@helpers/client";
import apiUrl from "@settings/index";
import actions from "./actions";

function* fetch({ payload }) {
  const { error_code, data } = yield call(client().get, `${apiUrl}/finance/collection/awaiting`, { params: payload });
  if (error_code === 0) {
    yield put({
      type: actions.FETCH_SUCCESS,
      payload: {
        data: data.collections || [],
        total: data.total || 0,
        query: payload ? payload.query : null,
      },
    });
  } else {
    yield put({
      type: actions.FETCH_SUCCESS,
    });
  }
}

function* fetchOTA() {
  const { error_code, data } = yield call(client().get, `${apiUrl}/finance/collection/otas`);
  if (error_code === 0) {
    const newData = _.map(_.get(data, "otas"), item => ({
      value: item,
      label: item,
    }));
    yield put({
      type: actions.FETCH_SUCCESS_OTA,
      payload: {
        dataOTA: newData || [],
      },
    });
  } else {
    yield put({
      type: actions.FETCH_SUCCESS_OTA,
    });
  }
}

function* refresh() {
  const query = yield select(state => state.accounting.income.profession.incomeFromOTA.query);
  yield put(actions.fetch(query));
}

export default function* rootSaga() {
  yield all([
    takeLatest(actions.FETCH_START, fetch),
    takeLatest(actions.REFRESH, refresh),
    takeLatest(actions.FETCH_START_OTA, fetchOTA),
  ]);
}
