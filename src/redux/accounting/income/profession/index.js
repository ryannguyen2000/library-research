import { combineReducers } from "redux";
import incomeFromOTA from "./incomFromOTA/reducer";
import thirdPartyPaid from "./thirdPartyPaid/reducer";
import transactionHistory from "./transactionHistory";

export default combineReducers({
  incomeFromOTA,
  thirdPartyPaid,
  transactionHistory,
});
