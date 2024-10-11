const DOCUMENT = "ACCOUNTING_APPROVED_EXPENDITURE_";

const actions = {
  FETCH_START: DOCUMENT + "FETCH_START",
  FETCH_SUCCESS: DOCUMENT + "FETCH_SUCCESS",
  UPDATE_START: DOCUMENT + "UPDATE_START",
  DELETE_START: DOCUMENT + "DELETE_START",

  REFRESH: DOCUMENT + "REFRESH",
  RESET: DOCUMENT + "RESET",
  fetch: data => ({
    type: actions.FETCH_START,
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
