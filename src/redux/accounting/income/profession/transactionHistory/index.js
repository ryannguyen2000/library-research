import { combineReducers } from "redux";
import transaction from "./transaction/reducer";
import payment from "./payment/reducer";

export default combineReducers({
  transaction,
  payment,
});
