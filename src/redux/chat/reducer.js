import _ from "lodash";
import moment from "moment";
import actions from "./actions";
import avatar from "../../image/default-avatar.svg";

const initState = {
  guest: {},
  booking: null,
  rooms: [],
  messages: [],
  senders: {},
  _id: null,
  other: {},
  read: false,
  attitude: "normal",
  currentOtt: null,
  loading: false,
  loadingOtt: false,
  support: true,
  query: {
    start: 0,
  },
  task: [],
  typing: {},
  selectedMessages: [],
  histories: {},
  quote: null,
  loadingTimelines: false,
  timelines: [],
  totalTimelines: [],
  queryTimelines: {
    start: 0,
  },
};

export default function reducer(state = initState, { type, payload }) {
  switch (type) {
    case actions.CHAT_INIT: {
      return {
        ...state,
        _id: payload.messageId,
        loading: true,
        messages: [],
        currentOtt: null,
        sender: null,
        query: {
          start: 0,
        },
        support: true,
      };
    }

    case actions.CHAT_INIT_DONE: {
      if (payload.replace) {
        return {
          ...state,
          messages: validateMessages(payload.messages, state.senders, state.guest),
          selectedMessages: [],
          loading: false,
          support: true,
        };
      } else {
        const senders = state.currentOtt ? state.senders : payload.senders;
        const guest = payload.guest || {};

        return {
          ...state,
          guest,
          senders,
          currentOtt: payload.currentOtt,
          booking: payload.booking,
          blockInbox: payload.blockInbox,
          rooms: payload.rooms,
          messages: state.currentOtt ? state.messages : validateMessages(payload.messages, senders, guest),
          other: payload.other,
          loading: false,
          support: true,
          attitude: payload.attitude,
          read: payload.read,
          selectedMessages: [],
        };
      }
    }

    case actions.SEND_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, payload.data],
      };

    case actions.NEW_MESSAGE_SUCCESFULL: {
      const senders = _.clone(state.senders);
      senders[payload.user._id] = payload.user;
      _.assign(payload.data, payload.newMessage, {
        user: payload.user._id,
        sending: false,
      });
      return {
        ...state,
        senders,
        messages: validateMessages(state.messages, senders, state.guest, state.other.members, state.histories),
        quote: null,
      };
    }

    case actions.NEW_MESSAGE_FAIL: {
      const senders = _.clone(state.senders);
      senders[payload.user._id] = payload.user;

      payload.data.error = true;
      payload.data.sending = false;

      return {
        ...state,
        senders,
        messages: validateMessages(state.messages, senders, state.guest, state.other.members, state.histories),
        quote: null,
      };
    }

    case actions.UPDATE: {
      return {
        ...state,
        ...payload,
      };
    }

    case actions.CHANGE_OTT: {
      const merge = {};
      if (payload.ott) merge.currentOtt = payload.ott;
      if (payload.sender) merge.sender = payload.sender;
      return {
        ...state,
        ...merge,
        loading: true,
        messages: [],
        selectedMessages: [],
        friend: undefined,
        support: true,
      };
    }

    case actions.GET_MESSAGE_OTT: {
      return payload.loading === false
        ? state
        : {
            ...state,
            loading: true,
            messages: payload.isGetMore ? state.messages : [],
            query: { ...state.query, ...payload },
          };
    }

    case actions.GET_MESSAGE_OTT_SUCCESS: {
      const guest = {
        ...state.guest,
        ottAvatar: payload.avatar,
      };
      const senders = {
        ...state.senders,
        ...payload.senders,
      };
      const other = {
        ...state.other,
        ...payload.other,
      };
      const histories = {
        ...state.histories,
        ...payload.histories,
      };
      return {
        ...state,
        senders,
        other,
        guest,
        histories,
        loading: false,
        query: payload.query,
        friend: payload.friend,
        messages: state.currentOtt
          ? validateMessages([...payload.messages, ...state.messages], senders, guest, other.members, histories)
          : state.messages,
      };
    }

    case actions.CHANGE_ATTITUDE_SUCCESS:
      return {
        ...state,
        attitude: payload,
      };

    case actions.UPDATE_OTHER: {
      const other = { ...state.other, ...payload };
      return {
        ...state,
        other,
      };
    }

    case actions.SET_TYPING: {
      const typing = { ...state.typing };
      if (payload.clear) {
        delete typing[payload.messageId];
      } else {
        typing[payload.messageId] = payload;
      }
      return {
        ...state,
        typing,
      };
    }

    case actions.SELECT_MESSAGE: {
      const { selectedMessages } = state;
      const newSelected = selectedMessages.some(mId => payload.includes(mId))
        ? _.difference(selectedMessages, payload)
        : _.uniq([...selectedMessages, ...payload]);

      return {
        ...state,
        selectedMessages: newSelected,
      };
    }

    case actions.QUOTE_MESSAGE: {
      return {
        ...state,
        quote: payload,
      };
    }

    case actions.CHAT_TIMELINES: {
      return {
        ...state,
        loadingTimelines: payload.loadingTimelines,
        timelines: payload.receiveMessage || payload.isGetMore ? state.timelines : [],
        queryTimelines: { ...state.queryTimelines, ...payload },
      };
    }

    case actions.CHAT_TIMELINES_SUCCESS: {
      const senders = { ...state.senders, ...payload.senders };
      const histories = {
        ...state.histories,
        ...payload.histories,
      };
      return {
        ...state,
        senders,
        histories,
        queryTimelines: payload.queryTimelines,
        timelines: validateMessages(
          [...payload.timelines, ...state.timelines],
          senders,
          state.guest,
          state.other.members,
          histories
        ),
        totalTimelines: payload.totalTimelines,
        loadingTimelines: false,
      };
    }
    case actions.CHAT_TIMELINES_REPLY:
      return {
        ...state,
        timelines: [...state.timelines, payload.data],
      };

    case actions.CHAT_TIMELINES_REPLY_SUCCESS: {
      const senders = _.clone(state.senders);
      senders[payload.user._id] = payload.user;
      _.assign(payload.data, payload.newTimeline, {
        user: payload.user._id,
        sending: false,
        messageId: _.get(payload, "newTimeLine.messageId"),
      });
      return {
        ...state,
        senders,
        timelines: validateMessages(state.timelines, senders, state.guest, state.other.members, state.histories),
        quote: null,
      };
    }
    case actions.CHAT_TIMELINES_REPLY_ERROR: {
      const senders = _.clone(state.senders);
      senders[payload.user._id] = payload.user;

      payload.data.error = true;
      payload.data.sending = false;

      return {
        ...state,
        senders,
        timelines: validateMessages(state.timelines, senders, state.guest, state.other.members, state.histories),
      };
    }

    case actions.RESET:
      return initState;

    default:
      return state;
  }
}

function validateMessages(messages, senders, guest, members, histories) {
  messages = _.uniqBy(messages, m => m.messageId || m._id).sort((a, b) => new Date(a.time) - new Date(b.time));
  const rs = [];

  messages.forEach(m => {
    if (!m.messageData) return;
    m.message = _.get(m, "messageData.message");
    m.image_attachment_url = _.get(m, "messageData.image_attachment_url");
    m.attachments = _.get(m, "messageData.attachments");
    m.name = _.get(m, "messageData.dName");
    m.userId = _.get(m, "messageData.userId");
    m.fromMe = _.get(m, "messageData.fromMe");
  });

  messages.forEach((m, index, allMessages) => {
    const next = allMessages[index + 1];
    m.isContinue =
      next &&
      next.status !== "event" &&
      next.status !== "request" &&
      !next.group &&
      next.user === m.user &&
      next.ottName === m.ottName &&
      (!m.userId || (m.fromMe === next.fromMe && next.userId === m.userId)) &&
      moment(next.time).diff(m.time, "seconds") <= 60 &&
      !_.includes(_.get(m, "image_attachment_url.[0]"), "emoticon");

    const member = members && members[m.userId];
    const isGuest = m.user === "guest";

    m.name = isGuest
      ? m.dName || _.get(member, "displayName")
      : _.get(senders, [m.user, "name"]) || m.user || "" || _.get(m, "messageData.dName");
    m.avatar = isGuest
      ? _.get(member, "avatar") || guest.ottAvatar || guest.avatar || avatar
      : "/images/icons/i-cozrum.png";
    m.history = _.get(histories, m.messageId);

    if (!m.messageIds) m.messageIds = [m.messageId];
    if (!m.messages) m.messages = [_.cloneDeep(m)];

    if (!rs.length || m.message || !m.image_attachment_url?.length || m.image_attachment_url[0].includes("emoticon")) {
      rs.push(m);
      return;
    }

    const lastM = _.last(rs);

    if (
      !lastM ||
      !lastM.image_attachment_url?.length ||
      (lastM.attachments && lastM.attachments.length) ||
      !allMessages[index - 1].isContinue
    ) {
      rs.push(m);
      return;
    }

    lastM.messageIds.push(m.messageId);
    lastM.messages.push(_.cloneDeep(m));
    lastM.image_attachment_url.push(...m.image_attachment_url);
    if (lastM.attachments && m.attachments) lastM.attachments.push(...m.attachments);
    lastM.group = true;
    lastM.isContinue = false;
  });

  return rs;
}
