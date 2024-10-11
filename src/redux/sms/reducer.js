import _ from "lodash";
import actions from "./actions";

const initState = {
  loading: false,
  data: [],
  total: 0,
  unread: 0,
};

export default function reducer(state = initState, { type, payload }) {
  switch (type) {
    case actions.FETCH_START:
      return {
        ...state,
        loading: true,
      };
    case actions.FETCH_SUCCESS: {
      const { concatResults, data, ...otherData } = payload;
      return {
        ...state,
        ...otherData,
        data: data ? (concatResults ? _.uniqBy([...state.data, ...data], "_id") : data) : state.data,
        loading: false,
      };
    }
    case actions.CHANGE_STATUS_DONE: {
      const item = state.data.find(sms => sms._id === payload._id);
      if (item) {
        item.read = payload.read;
        return {
          ...state,
          data: [...state.data],
          unread: state.unread + (item.read ? -1 : 1),
        };
      }
      return state;
    }
    default:
      return state;
  }
}
