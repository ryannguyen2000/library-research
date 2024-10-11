const DOCUMENT = "SMS_LIST_";

const actions = {
  FETCH_START: DOCUMENT + "FETCH_START",
  FETCH_SUCCESS: DOCUMENT + "FETCH_SUCCESS",
  CHANGE_STATUS: DOCUMENT + "CHANGE_STATUS",
  CHANGE_STATUS_DONE: DOCUMENT + "CHANGE_STATUS_DONE",

  fetch: payload => ({
    type: actions.FETCH_START,
    payload
  }),

  changeStatus: payload => ({
    type: actions.CHANGE_STATUS,
    payload
  })
};

export default actions;
