import _ from "lodash";
import { all, takeEvery, takeLatest, put, call, select } from "redux-saga/effects";

import client from "@helpers/client";
import { OTT } from "@settings/const";
import actions from "./actions";
import inboxActions from "../inbox/actions";

const hashUrl = newHash => {
  window.location.hash = newHash;
};

const LIMIT = 20;

function hasOTT(ott) {
  return OTT.some(ot => ot.name === ott);
}

function getSender() {
  const [ottName, sender, guestId] = window.location.hash.replace("#", "").split("-");
  return {
    ottName,
    sender,
    guestId,
  };
}

function* chatInit({ payload }) {
  const { error_code, data } = yield call(
    client(true).get,
    `/messages/${payload.messageId}${payload.isSync ? "/syn" : ""}`
  );

  if (error_code || !data) {
    return yield put({
      type: actions.RESET,
    });
  }

  let { guestId, guestIds, messages, _id, read, reservateRooms, senders, inbox, booking, ...other } = data || {};
  booking = booking || {};
  booking.guestIds = _.compact([guestId, ...(guestIds || [])]);
  const info = getSender();
  const defaultGuest = info.guestId || _.get(inbox, "guestId");
  const guest = (defaultGuest && _.find(booking.guestIds, g => g._id === defaultGuest)) || guestId || {};
  const blockInbox = _.get(inbox, "blockId");
  const roomsInbox = _.get(inbox, "roomIds");

  const ott = OTT.find(o => o.name === inbox.ottSource);
  yield put({
    type: actions.CHAT_INIT_DONE,
    payload: {
      currentOtt: payload.ott,
      guest,
      booking,
      read,
      blockInbox,
      rooms: reservateRooms || roomsInbox || [],
      messages: _.reverse(messages),
      attitude: _.get(data, "attitude"),
      senders,
      sender: ott && ott.addAccount ? inbox.ottPhone : "",
      replace: payload.isSync,
      other,
      _id,
    },
  });
  if (payload.noAuto) return;

  const phone = guest.phone || _.get(guest.ottIds, _.get(inbox, "ottSource")) || _.get(guest.ottIds, other.otaName);
  if (inbox && inbox.ottSource && !payload.isSync && phone) {
    return yield put(
      actions.changeOtt({
        ott: inbox.ottSource,
        sender: ott && ott.addAccount ? inbox.ottPhone : "",
        phone,
      })
    );
  }
  if ((hasOTT(info.ottName) || hasOTT(other.otaName)) && phone) {
    return yield put(
      actions.changeOtt({
        ott: info.ottName || other.otaName,
        sender: info.sender,
        phone,
      })
    );
  }
  if (!other.supportOTA) {
    const ottIds = _.keys(guest.ottIds);
    if (guest.phone || ottIds.length) {
      return yield put(
        actions.changeOtt({
          ott: ottIds[0] || OTT[0].name,
          phone: _.get(guest.ottIds, ottIds[0]) || guest.phone,
          nextOtt: ottIds[1] || OTT[1].name,
        })
      );
    }
  }

  yield put({
    type: actions.UPDATE,
    payload: { support: false },
  });
}

function* sendMessage({ payload: { data } }) {
  const [chat, user] = yield select(state => [state.Chat, state.Auth.user]);

  const currentOtt = chat.currentOtt;
  const ottIdOrPhone = _.get(chat.guest, ["ottIds", currentOtt]) || _.get(chat.guest, "phone");
  const messageId = chat._id;
  const blockId = _.get(chat.booking, "blockId._id");
  const { sender } = getSender();

  let body = {
    msg: data.message,
  };

  if (currentOtt) {
    body = new FormData();
    body.append("msg", data.message);
    if (data.mentions) body.append("mentions", JSON.stringify(data.mentions));

    _.forEach(data.attachments, file => {
      body.append("attachments", file);
    });
  }
  if (chat.quote) {
    body.append("qmsgId", chat.quote);
  }

  const { error_code, data: respone } = yield call(
    client().post,
    currentOtt ? `/messages/ott/${currentOtt}/${ottIdOrPhone}` : `/messages/${messageId}`,
    body,
    {
      params: {
        messageId,
        blockId,
        sender,
      },
    }
  );

  if (error_code === 0) {
    yield put({
      type: actions.NEW_MESSAGE_SUCCESFULL,
      payload: {
        newMessage: _.get(respone, "message") || null,
        data,
        user,
      },
    });
  } else {
    yield put({
      type: actions.NEW_MESSAGE_FAIL,
      payload: { data, user },
    });
  }
}

function value(val) {
  if (!val) return "";
  return val;
}

function* refreshChat({ payload }) {
  const { currentOtt, _id, support } = yield select(state => state.Chat);
  if (payload && value(payload.ottSource) !== value(currentOtt)) return;

  if (currentOtt) {
    if (!support) return;
    yield put(actions.getMessageOtt({ ott: currentOtt, loading: false, refresh: true }));
  } else {
    const { error_code, data } = yield call(client(true).get, `/messages/${_id}`);
    if (error_code === 0 && data) {
      const { guestId, messages, _id, booking, reservateRooms, senders, ...other } = data;
      yield put({
        type: actions.CHAT_INIT_DONE,
        payload: {
          guest: guestId,
          messages: messages.reverse(),
          attitude: data.attitude,
          booking,
          rooms: reservateRooms || [],
          senders,
          other,
          _id,
        },
      });
    }
  }
}

function* changeOtt({ payload: { ott, phone, nextOtt, check: recheck, sender } }) {
  const chat = yield select(state => state.Chat);
  const messageId = chat._id;
  if (ott === undefined) ott = chat.currentOtt;
  if (phone === undefined) phone = chat.guest.phone;
  if (sender === undefined) {
    const ottConfig = OTT.find(o => o.name === ott);
    sender = (ottConfig && ottConfig.addAccount && chat.sender) || "";
  }

  const id = _.get(chat.guest, ["ottIds", ott]) || phone;
  const newHash = ott ? `${ott}-${sender}-${chat.guest._id}` : "";

  if (!nextOtt) hashUrl(newHash);

  if (ott && id && ott !== "message") {
    const blockId = _.get(chat.booking, "blockId._id");
    const { data } = yield call(client(true).get, `/messages/ott/${ott}/${id}/check`, {
      params: {
        blockId,
        sender,
        recheck,
        messageId,
      },
    });

    if (_.get(data, "data.exists")) {
      if (nextOtt) hashUrl(newHash);
      return yield put(actions.getMessageOtt({ ott, sender, start: 0, from: null, to: null }));
    }

    if (nextOtt) {
      const index = OTT.findIndex(o => o.name === nextOtt);
      return yield put(
        actions.changeOtt({
          ott: nextOtt,
          phone,
          sender,
          nextOtt: index !== -1 ? _.get(OTT[index + 1], "name") : null,
        })
      );
    }

    return yield put({
      type: actions.UPDATE,
      payload: {
        support: false,
        loading: false,
      },
    });
  }

  if (chat._id) {
    yield put(actions.chatInit(chat._id, false, true, ott));
  }
}

function* getMessageOtt({ payload: { isGetMore, ott, sender, start, from, to, refresh } }) {
  const chat = yield select(state => state.Chat);
  const messageId = chat._id;
  if (sender === undefined) {
    const sSender = getSender();
    sender = sSender.sender;
  }
  if (ott === undefined) ott = chat.currentOtt;
  if (from === undefined) from = chat.query.from;
  if (to === undefined) to = chat.query.to;
  if (start === undefined) start = isGetMore ? chat.query.start + LIMIT : chat.query.start;

  const blockId = _.get(chat.booking, "blockId._id");

  const id = _.get(chat.guest, ["ottIds", ott]) || _.get(chat.guest, "phone");
  const { data } = yield call(client(true).get, `/messages/ott/${ott}/${id}`, {
    params: {
      blockId,
      sender,
      start: refresh ? 0 : start,
      limit: LIMIT,
      from,
      to,
      messageId,
    },
  });

  yield put({
    type: actions.GET_MESSAGE_OTT_SUCCESS,
    payload: {
      messages: _.get(data, "messages") || [],
      friend: _.get(data, "other.friend"),
      avatar: _.get(data, "other.info.avatar"),
      senders: _.get(data, "senders"),
      isGetMore,
      other: {
        pageName: _.get(data, "other.page.name"),
        members: _.keyBy(_.get(data, "other.info.members"), "id"),
      },
      query: {
        start,
        from,
        to,
      },
      refresh,
      histories: _.get(data, "histories") || {},
    },
  });
}

function* addFriend() {
  const chat = yield select(state => state.Chat);
  yield put({
    type: actions.UPDATE,
    payload: {
      friend: 0,
    },
  });

  const ott = chat.currentOtt;
  const blockId = _.get(chat.booking, "blockId._id");
  const id = _.get(chat.guest, ["ottIds", ott]) || _.get(chat.guest, "phone");
  const { sender } = getSender();

  const { data } = yield call(client().post, `/messages/ott/${ott}/${id}/addFriend`, {
    params: {
      blockId,
      sender,
    },
  });

  yield put({
    type: actions.UPDATE,
    payload: {
      friend: _.get(data, "data.friend"),
    },
  });
}

function* readInbox({ payload }) {
  const { error_code } = yield call(
    client(true).post,
    `/inbox/${payload.read ? "read" : "unread"}/${payload.messageId}`
  );
  if (error_code === 0) {
    yield put({
      type: actions.UPDATE,
      payload: {
        read: payload.read,
      },
    });
    yield put(inboxActions.readInbox(payload));
    // yield put(inboxActions.refresh());
  }
}

function* changeAttitude({ payload }) {
  const { error_code, data } = yield call(client(true).post, `/messages/${payload.messageId}/attitude`, {
    attitude: payload.attitude,
  });
  if (error_code === 0) {
    yield put({
      type: actions.CHANGE_ATTITUDE_SUCCESS,
      payload: data.attitude,
    });
    yield put(inboxActions.changeAttitude({ ...payload, ...data }));
  }
}

function* updateGroupInfo({ payload }) {
  const messageId = yield select(state => state.Chat._id);
  const { error_code, data } = yield call(client().put, `/messages/${messageId}/group`, payload);

  if (error_code === 0) {
    if (data.members) {
      const members = yield select(state => state.Chat.other.members);
      const newMembers = data.members.map(m => ({
        ...(members[m.id] || null),
        ...m,
      }));
      data.members = _.keyBy(newMembers, "id");
    }

    yield put({
      type: actions.UPDATE_OTHER,
      payload: data,
    });
  }
}

function* updateGroupAuto({ payload }) {
  const messageId = yield select(state => state.Chat._id);
  const { error_code, data } = yield call(client().post, `/messages/${messageId}/group/auto`, payload);
  if (error_code === 0) {
    yield put({
      type: actions.UPDATE_OTHER,
      payload: {
        ...data,
      },
    });
  }
}

function* getChatTimelines({ payload: { isGetMore, start, refresh, id } }) {
  const chat = yield select(state => state.Chat);

  if (start === undefined) start = isGetMore ? chat.queryTimelines.start + LIMIT : chat.queryTimelines.start;

  const { data } = yield call(client(true).get, `/messages/${id}/timeline`, {
    params: { start: refresh ? 0 : start, limit: LIMIT },
  });

  yield put({
    type: actions.CHAT_TIMELINES_SUCCESS,
    payload: {
      histories: _.get(data, "histories") || {},
      timelines: _.get(data, "timelines") || {},
      senders: _.get(data, "senders") || {},
      totalTimelines: data.total,
      queryTimelines: {
        start,
      },
    },
  });
}

function* replyChatTimelines({ payload: { data } }) {
  const [chat, user] = yield select(state => [state.Chat, state.Auth.user]);
  const messageId = chat._id;
  let body = {
    msg: data.message,
  };

  body = new FormData();
  body.append("msg", data.message);

  _.forEach(data.attachments, file => {
    body.append("attachments", file);
  });

  const { error_code, data: respone } = yield call(client().post, `/messages/${messageId}/timeline/reply`, body, {
    params: {},
  });

  if (error_code === 0) {
    yield put({
      type: actions.CHAT_TIMELINES_REPLY_SUCCESS,
      payload: {
        newTimeLine: _.get(respone, "message") || null,
        data,
        user,
      },
    });
  } else {
    yield put({
      type: actions.CHAT_TIMELINES_REPLY_ERROR,
      payload: { data, user },
    });
  }
}

export default function* rootSaga() {
  yield all([
    takeEvery(actions.SEND_MESSAGE, sendMessage),
    takeLatest(actions.CHAT_INIT, chatInit),
    takeLatest(actions.ADD_FRIEND, addFriend),
    takeLatest(actions.CHAT_REFRESH, refreshChat),
    takeLatest(actions.CHANGE_OTT, changeOtt),
    takeLatest(actions.GET_MESSAGE_OTT, getMessageOtt),
    takeEvery(actions.READ_INBOX, readInbox),
    takeEvery(actions.CHANGE_ATTITUDE, changeAttitude),
    takeLatest(actions.UPDATE_GROUP_INFO, updateGroupInfo),
    takeLatest(actions.UPDATE_GROUP_AUTO, updateGroupAuto),
    takeLatest(actions.CHAT_TIMELINES, getChatTimelines),
    takeLatest(actions.CHAT_TIMELINES_REPLY, replyChatTimelines),
  ]);
}
