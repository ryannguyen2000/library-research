import _ from "lodash";
import actions from "./actions";

const iniState = {
  loading: false,
  data: {},
  query: {},
};

export default function reducer(state = iniState, { type, payload }) {
  switch (type) {
    case actions.SET_DATA: {
      return { ...state, data: payload };
    }
    default:
      return state;
  }
}
