const DOCUMENT = "ACCOUNTING_INCOME_FROM_OTA_";

const actions = {
  FETCH_START: DOCUMENT + "FETCH_START",
  FETCH_SUCCESS: DOCUMENT + "FETCH_SUCCESS",
  UPDATE_START: DOCUMENT + "UPDATE_START",
  DELETE_START: DOCUMENT + "DELETE_START",

  FETCH_START_OTA: DOCUMENT + "FETCH_START_OTA",
  FETCH_SUCCESS_OTA: DOCUMENT + "FETCH_SUCCESS_OTA",

  REFRESH: DOCUMENT + "REFRESH",
  RESET: DOCUMENT + "RESET",
  fetch: data => ({
    type: actions.FETCH_START,
    payload: data,
  }),
  fetchOTA: data => ({
    type: actions.FETCH_START_OTA,
    payload: data,
  }),
  update: data => ({
    type: actions.UPDATE_START,
    payload: data,
  }),
  del: id => ({
    type: actions.DELETE_START,
    id,
  }),
  refresh: () => ({
    type: actions.REFRESH,
  }),
  reset: () => ({
    type: actions.RESET,
  }),
};
export default actions;
