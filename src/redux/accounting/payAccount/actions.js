const DOCUMENT = "ACCOUNTING_PAY_ACCOUNT_";

const actions = {
  FETCH_START_DEBIT: DOCUMENT + "FETCH_START_DEBIT",
  FETCH_SUCCESS_DEBIT: DOCUMENT + "FETCH_SUCCESS_DEBIT",
  FETCH_START_CREDIT: DOCUMENT + "FETCH_START_CREDIT",
  FETCH_SUCCESS_CREDIT: DOCUMENT + "FETCH_SUCCESS_CREDIT",

  CHANGE_INIT_STATE_DEBIT: DOCUMENT + "CHANGE_INIT_STATE_DEBIT",
  CHANGE_INIT_STATE_CREDIT: DOCUMENT + "CHANGE_INIT_STATE_CREDIT",

  REFRESH: DOCUMENT + "REFRESH",
  RESET: DOCUMENT + "RESET",
  fetchdebit: data => ({
    type: actions.FETCH_START_DEBIT,
    payload: data,
  }),
  fetchcredit: data => ({
    type: actions.FETCH_START_CREDIT,
    payload: data,
  }),
  refresh: () => ({
    type: actions.REFRESH,
  }),
  reset: () => ({
    type: actions.RESET,
  }),
  changeInitDebit: payload => ({
    type: actions.CHANGE_INIT_STATE_DEBIT,
    payload,
  }),
  changeInitCredit: payload => ({
    type: actions.CHANGE_INIT_STATE_CREDIT,
    payload,
  }),
};
export default actions;
