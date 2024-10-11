import { combineReducers } from "redux";
import expense from "./expense";
import income from "./income";
import configs from "./configs";

export default combineReducers({
  expense,
  income,
  configs,
});
