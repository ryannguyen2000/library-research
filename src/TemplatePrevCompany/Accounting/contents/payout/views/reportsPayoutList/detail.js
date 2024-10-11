import _ from "lodash";
import { useEffect, useCallback } from "react";
import { connect } from "react-redux";

import actions from "@redux/financeReports/detail/actions";
import Box from "@components/utility/box";
import Table from "@containers/Finance/reportPayout/table";
// import ToolBar from "@containers/Finance/reportPayout/tool";
import Title from "@containers/Finance/reportPayout/title";
import Confirm from "@containers/Finance/reportPayout/tool/confirm";
import Des from "@containers/Finance/reportPayin/des";
import ToolBar from "./tool";

const DetailReportPayout = ({ query, fetch, reset, ...props }) => {
  const id = _.get(query, "detailId");
  const isCreate = id === "create";

  const getData = useCallback(() => {
    if (_.get(query, "detailId")) {
      fetch(id, "pay");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fetch]);

  useEffect(() => {
    isCreate ? reset() : getData();
  }, [isCreate, getData, reset]);

  return (
    <>
      <ToolBar isCreate={isCreate} id={id} query={query} />
      <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
        <Title />
        <Table isCreate={isCreate} getData={getData} />
        <Des isPayout={true} />
        <Confirm getData={getData} />
      </Box>
    </>
  );
};

export default connect(null, { fetch: actions.fetch, reset: actions.reset })(DetailReportPayout);
