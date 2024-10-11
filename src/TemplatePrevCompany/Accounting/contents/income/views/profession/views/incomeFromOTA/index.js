import { useSelector, useDispatch } from "react-redux";
import { useCallback, useEffect, memo } from "react";
import _ from "lodash";

import TopBarContainer from "@containers/Accounting/container/TopBarContainer";
import actions from "@redux/accounting/income/profession/incomFromOTA/actions";
import Box from "@components/utility/box";

import ToolFilter from "./toolFilter";
import TableIncomeProfession from "./table";

const IncomeOta = ({ ...props }) => {
  const { data, dataOTA, isLoading } = useSelector(state => state.accounting.income.profession.incomeFromOTA);

  const dispatch = useDispatch();

  const page = parseInt(_.get(props.query, "page")) || 1;
  const pageSize = parseInt(_.get(props.query, "limit")) || 10;

  const getData = useCallback(() => {
    dispatch(
      actions.fetch({
        limit: pageSize,
        start: (page - 1) * pageSize,
        blockId: _.get(props.query, "blockId"),
        ota: _.get(props.query, "ota"),
      })
    );
  }, [dispatch, page, pageSize, props.query]);

  useEffect(getData, [getData]);

  useEffect(() => {
    dispatch(actions.fetchOTA());
  }, [dispatch]);

  return (
    <div>
      <TopBarContainer toolFilterNode={<ToolFilter dataOTA={dataOTA} {...props} />} nonTitle />
      <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
        <TableIncomeProfession data={data} loading={isLoading} {...props} page={page} pageSize={pageSize} />
      </Box>
    </div>
  );
};

export default memo(IncomeOta);
