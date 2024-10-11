import { all, call, put, select, takeLatest } from "redux-saga/effects";
import _ from "lodash";

import client from "@helpers/client";
import apiUrl from "@settings/index";
import actions from "./actions";

function* fetchDebit({ payload }) {
  const prevData = yield select(state => state.payAccount.debit.data);
  const { error_code, data } = yield call(client().get, `${apiUrl}/payment/pay/account`, {
    params: {
      ...payload,
      transType: "debit",
      showNull: true,
    },
  });
  if (error_code === 0) {
    yield put({
      type: actions.FETCH_SUCCESS_DEBIT,
      payload: {
        data: _.unionBy(prevData, data.accounts, "_id") || [],
        total: data.total || 0,
        query: payload ? payload.query : null,
      },
    });
  } else {
    yield put({
      type: actions.FETCH_SUCCESS_DEBIT,
    });
  }
}

function* fetchCredit({ payload }) {
  const prevData = yield select(state => state.payAccount.credit.data);
  const { error_code, data } = yield call(client().get, `${apiUrl}/payment/pay/account`, {
    params: {
      ...payload,
      showNull: true,
    },
  });
  if (error_code === 0) {
    yield put({
      type: actions.FETCH_SUCCESS_CREDIT,
      payload: {
        data: _.unionBy(prevData, data.accounts, "_id") || [],
        total: data.total || 0,
        query: payload ? payload.query : null,
      },
    });
  } else {
    yield put({
      type: actions.FETCH_SUCCESS_CREDIT,
    });
  }
}

export default function* rootSaga() {
  yield all([takeLatest(actions.FETCH_START_DEBIT, fetchDebit), takeLatest(actions.FETCH_START_CREDIT, fetchCredit)]);
}
