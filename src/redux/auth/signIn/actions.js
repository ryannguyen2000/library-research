const DOCUMENT = "AUTH_";

const actions = {
  LOGIN_REQUEST: DOCUMENT + "LOGIN_REQUEST",
  LOGOUT: DOCUMENT + "LOGOUT",
  SET_DATA: DOCUMENT + "SET_DATA",

  setData: (payload) => ({
    type: actions.SET_DATA,
    payload,
  }),
};

export default actions;
