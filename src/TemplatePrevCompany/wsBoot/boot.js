import _ from "lodash";

import store from "./store";
import authActions from "./auth/actions";
import errorActions from "./reservationsError/actions";
import smsActions from "./sms/actions";
import chatActions from "./chat/actions";
import inboxActions from "./inbox/actions";

import { wsUrl } from "../settings";
import { getToken } from "../helpers/utility";
import { emitter, events } from "../helpers/eventEmitter";

import { guideMenu, paymentTrackingMenu, problemMenu } from "@containers/NewCS/utils/itemsMenuList";
import CS_ROUTES from "@containers/NewCS/utils/routes";

const TIMET = 1000;
const TIME_RETRY = 3000;
const timers = {};

const ignoreKeys = ["displayToday", "display"];

function checkParams(params, wsData) {
  return _.entries(params).every(
    ([k, v]) => ignoreKeys.includes(k) || (_.isArray(v) ? v.includes(wsData[k]) : v === wsData[k])
  );
}

const refreshUnread = _.throttle(() => store.dispatch(inboxActions.getUnRead()), TIMET);
const refreshChat = _.throttle(data => store.dispatch(chatActions.refreshChat(data)), TIMET);
const refreshInbox = _.throttle(() => store.dispatch(inboxActions.refresh()), TIMET);
const refreshTimelines = _.throttle(data => store.dispatch(chatActions.getChatTimelines(data)), TIMET);
const refreshSMS = _.throttle(() => store.dispatch(smsActions.fetch({ read: false, data: false })), TIMET);
const refreshResErr = _.throttle(() => store.dispatch(errorActions.fetch()), TIMET);

export function initServerEventListener() {
  try {
    if (!wsUrl) {
      return;
    }

    const source = new WebSocket(`${wsUrl}?token=${getToken()}`);

    source.onopen = e => {
      console.log("WS OPENED");
    };

    source.addEventListener("close", async function (code, r) {
      console.log("WS CLOSE", code, r);
      source.close();
      setTimeout(() => initServerEventListener(), TIME_RETRY);
    });

    source.onerror = e => {
      console.log("WS ERROR", e);
      // source.close();
      // setTimeout(() => initServerEventListener(), TIME_RETRY);
    };

    source.onmessage = e => {
      try {
        const { event, data } = JSON.parse(e.data);

        switch (event) {
          case events.RESERVATION_ERROR:
            refreshResErr();
            break;

          case events.BANKING_SMS:
            refreshSMS();
            break;

          case events.MESSAGE_SEND: {
            const userId = _.get(store.getState(), "Auth.user._id");
            if (data.senderId !== userId && data.messageId && window.location.pathname.includes(data.messageId)) {
              refreshTimelines({ id: data.messageId, start: 0, receiveMessage: true, loadingTimelines: false });
              refreshChat(data);
            }
            break;
          }

          case events.MESSAGE_RECEIVE: {
            const { pathname, search } = window.location;
            if (data && data.messageId && pathname.includes(data.messageId)) {
              if (search.includes("timelines")) {
                refreshTimelines({ id: data.messageId, start: 0, receiveMessage: true, loadingTimelines: false });
              } else {
                refreshChat(data);
              }
            }
            if (pathname.includes("/inbox")) {
              refreshInbox();
            }

            if (pathname.includes("/new-cs")) {
              refreshUnread();
            }

            break;
          }

          case events.MESSAGE_TYPING: {
            if (timers[data.messageId]) {
              clearTimeout(timers[data.messageId]);
            }

            store.dispatch(chatActions.setTyping(data));

            timers[data.messageId] = setTimeout(() => {
              store.dispatch(chatActions.setTyping({ ...data, clear: true }));
              delete timers[data.messageId];
            }, 4000);

            break;
          }

          case events.BOOKING_BSTATUS_UPDATED: {
            const { pathname, search } = window.location;
            if (pathname.includes("/new-cs")) {
              const handleMenu = menu => {
                menu.forEach((menu, mIndex) => {
                  if (menu.params && menu.actions && typeof menu.actions.getTotal === "function") {
                    if (checkParams(menu.params, data)) {
                      store.dispatch(menu.actions.getTotal(menu.params));
                    }
                  }

                  if (search.includes(menu.key) || mIndex === 0) {
                    _.forEach(menu.children, (child, cIndex) => {
                      if (!child.params || !child.actions) {
                        return;
                      }

                      if (!checkParams(child.params, data)) {
                        return;
                      }

                      if (typeof child.actions.getTotal === "function") {
                        store.dispatch(child.actions.getTotal(child.params));
                      }

                      if ((search.includes(child.key) || cIndex === 0) && typeof child.actions.refresh === "function") {
                        store.dispatch(child.actions.refresh());
                      }
                    });
                  }
                });
              };

              if (pathname.includes("/guide")) {
                handleMenu(guideMenu);
              }
              if (pathname.includes("/paymentTracking")) {
                handleMenu(paymentTrackingMenu);
              }
              if (pathname.includes("/problem")) {
                handleMenu(problemMenu);
              }

              CS_ROUTES.forEach(route => {
                if (!route.actions || typeof route.actions.getUnRead !== "function") return;

                if (route.keyParams && route.keyParams.some(k => data[k] !== undefined)) {
                  store.dispatch(route.actions.getUnRead());
                }
              });
            }
            break;
          }

          case "ping": {
            if (source.send) source.send(JSON.stringify({ type: "pong" }));
            break;
          }

          default: {
            emitter.emit(event, data);
            break;
          }
        }
      } catch (e) {
        console.error("parse event error", e);
      }
    };
  } catch (e) {
    console.error(e);
  }
}

function init() {
  store.dispatch(authActions.checkAuthorization());
}

export default init;
