// import { minFormatMoney } from "@helpers/utility";
// import IntlMessages from "@components/utility/intlMessages";
import moment from "moment";
import _ from "lodash";

export const renderTime = data => (data ? moment(data).format("DD/MM/Y HH:mm") : "");

export const renderCreatedBy = data => (data ? _.get(data, "createdBy.name") || _.get(data, "createdBy.username") : "");

export const renderHome = data => {
  return _.map(_.get(data, "blockIds"), home => <p key={_.get(home, "_id")}>{_.get(home, "info.name")}</p>);
};
