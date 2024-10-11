import { combineReducers } from "redux";

import paymentAccounts from "./paymentAccounts/reducer";
import paymentAutos from "./paymentAutos/reducer";

export default combineReducers({
  paymentAccounts,
  paymentAutos,
});
