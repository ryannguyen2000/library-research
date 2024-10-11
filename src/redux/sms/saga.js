import { takeEvery, put, call, all } from "redux-saga/effects";
import client from "@helpers/client";
import actions from "./actions";

function* fetch({ payload }) {
  let { page, pageSize, concatResults, ...query } = payload || {};
  page = parseInt(page) || 1;
  pageSize = parseInt(pageSize) || 10;

  const { data: sms } = yield call(client(true).get, `/sms`, {
    params: {
      start: (page - 1) * pageSize,
      limit: pageSize,
      ...query,
    },
  });
  const dataPayload = {
    data: (sms && sms.data) || [],
    total: (sms && sms.total) || 0,
    concatResults,
  };
  if (query.data === false) {
    dataPayload.unread = dataPayload.total;
    delete dataPayload.data;
  }
  yield put({
    type: actions.FETCH_SUCCESS,
    payload: dataPayload,
  });
}

function* changeStatus({ payload }) {
  const { _id, read = true } = payload || {};
  const { error_code } = yield call(client().post, `/sms/${_id}`, { read });

  if (error_code === 0) {
    yield put({
      type: actions.CHANGE_STATUS_DONE,
      payload,
    });
  }
}

export default function* rootSaga() {
  yield all([takeEvery(actions.FETCH_START, fetch), takeEvery(actions.CHANGE_STATUS, changeStatus)]);
}
