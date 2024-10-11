import { connect } from "react-redux";
import _ from "lodash";

import actions from "@redux/financeReports/list/actions";

import LitsReportsPayout from "./list";
import DetailReportPayout from "./detail";

const ReportsPayoutList = ({ query, ...props }) => {
  const isDetail = Boolean(_.get(query, "detailId"));

  return isDetail ? <DetailReportPayout query={query} {...props} /> : <LitsReportsPayout query={query} {...props} />;
};

export default connect(null, actions)(ReportsPayoutList);
