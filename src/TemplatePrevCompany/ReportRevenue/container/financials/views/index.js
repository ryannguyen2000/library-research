import _ from "lodash";
import moment from "moment";
import { useCallback, useEffect } from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";

import actions from "@redux/revenueStream/actions";
import { DATE_PICKER_TYPE } from "@settings/const";

import IncomeStatement from "./incomeStatement";
import RevenueStream from "./revenueStream";
import ExpensesStream from "./expensesStream";
import ArchivalRecords from "./archivalRecords";
import { Box } from "@components/utility/styles";

const components = {
  incomeStatement: IncomeStatement,
  revenueStream: RevenueStream,
  expensesStream: ExpensesStream,
  list_of_company_document: ArchivalRecords,
};

const selector = state => [
  state.revenueStream.data,
  state.revenueStream.loading,
  state.revenueStream.query,
  state.revenueStream.showChart,
  state.revenueStream.showTotal
]

const ContentRouterElement = props => {
  const dispatch = useDispatch();

  const [data, loading, queryRedux, showChart, showTotal] = useSelector(
    selector,
    shallowEqual
  );

  const { query, changeSearchParams, pathname, activeKey } = props;

  const getDataTable = useCallback(() => {
    if (!query.timelineType || !query.from || !query.to) {
      const initFrom = moment().startOf("month").format("Y-MM-DD");
      const initTo = moment().endOf("month").format("Y-MM-DD");
      changeSearchParams(
        {
          timelineType: _.get(query, "timelineType", "DAILY"),
          from: _.get(query, "from", initFrom),
          to: _.get(query, "to", initTo),
        },
        {
          replace: true,
        }
      );
    } else {
      if (pathname !== "list_of_company_document") {
        dispatch(
          actions.fetch({
            pathName: pathname || "revenueStream",
            params: {
              ...query,
              from: moment(query.from).format(DATE_PICKER_TYPE[query.timelineType].format),
              to: moment(query.to).format(DATE_PICKER_TYPE[query.timelineType].format),
            },
          })
        );
      }
    }
  }, [dispatch, pathname, query, changeSearchParams]);

  useEffect(() => {
    getDataTable();
  }, [getDataTable]);

  const Component = components[activeKey];

  return (
    <Box className="content" style={{ minHeight: "100vh", padding: 15 }}>
      <Component
        pathname={activeKey}
        data={data}
        loading={loading}
        queryRedux={queryRedux}
        showChart={showChart}
        showTotal={showTotal}
        {...props}
      />
    </Box>
  );
};

export default ContentRouterElement;
