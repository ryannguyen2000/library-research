const DOCUMENT = "CHAT_";

const actions = {
  CHAT_INIT: DOCUMENT + "CHAT_INIT",
  CHAT_INIT_DONE: DOCUMENT + "CHAT_INIT_DONE",
  SEND_MESSAGE: DOCUMENT + "SEND_MESSAGE",
  NEW_MESSAGE_SUCCESFULL: DOCUMENT + "NEW_MESSAGE_SUCCESFULL",
  NEW_MESSAGE_FAIL: DOCUMENT + "NEW_MESSAGE_FAIL",
  CHAT_REFRESH: DOCUMENT + "CHAT_REFRESH",
  UPDATE: DOCUMENT + "UPDATE",
  CHANGE_OTT: DOCUMENT + "CHANGE_OTT",
  CHANGE_OTT_SUCCESS: DOCUMENT + "CHANGE_OTT_SUCCESS",
  GET_MESSAGE_OTT: DOCUMENT + "GET_MESSAGE_OTT",
  GET_MESSAGE_OTT_SUCCESS: DOCUMENT + "GET_MESSAGE_OTT_SUCCESS",
  ADD_FRIEND: DOCUMENT + "ADD_FRIEND",
  RESET: DOCUMENT + "RESET",
  READ_INBOX: DOCUMENT + "READ_INBOX",
  READ_SUCCESS: DOCUMENT + "READ_SUCCESS",
  CHANGE_ATTITUDE: DOCUMENT + "CHANGE_ATTITUDE",
  CHANGE_ATTITUDE_SUCCESS: DOCUMENT + "CHANGE_ATTITUDE_SUCCESS",
  UPDATE_GROUP_INFO: DOCUMENT + "UPDATE_GROUP_INFO",
  UPDATE_GROUP_AUTO: DOCUMENT + "UPDATE_GROUP_AUTO",
  UPDATE_OTHER: DOCUMENT + "UPDATE_OTHER",
  SET_TYPING: DOCUMENT + "SET_TYPING",
  SELECT_MESSAGE: DOCUMENT + "SELECT_MESSAGE",
  QUOTE_MESSAGE: DOCUMENT + "QUOTE_MESSAGE",
  CHAT_TIMELINES: DOCUMENT + "CHAT_TIMELINES",
  CHAT_TIMELINES_SUCCESS: DOCUMENT + "CHAT_TIMELINES_SUCCESS",
  CHAT_TIMELINES_REPLY: DOCUMENT + "CHAT_TIMELINES_REPLY",
  CHAT_TIMELINES_REPLY_SUCCESS: DOCUMENT + "CHAT_TIMELINES_REPLY_SUCCESS",
  CHAT_TIMELINES_REPLY_ERROR: DOCUMENT + "CHAT_TIMELINES_REPLY_ERROR",

  chatInit: (messageId, isSync, noAuto, ott) => ({
    type: actions.CHAT_INIT,
    payload: { messageId, isSync, noAuto, ott },
  }),
  sendMessage: data => ({
    type: actions.SEND_MESSAGE,
    payload: data,
  }),
  updateChat: data => ({
    type: actions.UPDATE,
    payload: data,
  }),
  refreshChat: payload => ({
    type: actions.CHAT_REFRESH,
    payload,
  }),
  changeOtt: data => ({
    type: actions.CHANGE_OTT,
    payload: data || {},
  }),
  getMessageOtt: data => ({
    type: actions.GET_MESSAGE_OTT,
    payload: data,
  }),
  addFriend: data => ({
    type: actions.ADD_FRIEND,
    payload: data,
  }),
  readInbox: (messageId, read = true) => ({
    type: actions.READ_INBOX,
    payload: { messageId, read },
  }),
  changeAttitude: (messageId, attitude) => ({
    type: actions.CHANGE_ATTITUDE,
    payload: { messageId, attitude },
  }),
  updateGroupInfo: payload => ({
    type: actions.UPDATE_GROUP_INFO,
    payload,
  }),
  updateGroupAuto: payload => ({
    type: actions.UPDATE_GROUP_AUTO,
    payload,
  }),
  setTyping: payload => ({
    type: actions.SET_TYPING,
    payload,
  }),
  selectMessage: payload => ({
    type: actions.SELECT_MESSAGE,
    payload,
  }),
  quoteMessage: payload => ({
    type: actions.QUOTE_MESSAGE,
    payload,
  }),
  getChatTimelines: payload => ({
    type: actions.CHAT_TIMELINES,
    payload,
  }),
  replyChatTimelines: data => ({
    type: actions.CHAT_TIMELINES_REPLY,
    payload: data,
  }),
};

export default actions;
