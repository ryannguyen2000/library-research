import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo, useEffect, memo } from "react";
import queryString from "query-string";
import moment from "moment";
import _ from "lodash";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { Spin } from "antd";

import { Box, Container } from "@components/utility/styles";
import { createChangeParams } from "@helpers/func";
import cashFlowActions from "@redux/cashFlow/actions";
import cashFlowDetailAction from "@redux/cashFlow/cashFlowDetail/actions";
import { pageSizeOptions } from "@settings/const";
import Topbar from "@components/page/topbar";
import IntlMessages from "@components/utility/intlMessages";

import Diagram from "./Diagram";
import TopBar from "./tool";
import TableDetail from "./tableDetail";

const selector = state => [state.CashFlow.cashFlow, state.CashFlow.cashFlowDetail];

function CashFlow() {
  const dispatch = useDispatch();
  const [{ data, dataGroups, totalRevenue, totalExpense, listLine, listNode, isLoading }, { dataGroup }] = useSelector(
    selector,
    shallowEqual
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => queryString.parse(searchParams.toString()), [searchParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changeParams = useCallback(createChangeParams(setSearchParams), []);

  const getData = useCallback(() => {
    if (!query.period || !query.diagramType || !query.limit || !query.page || !query.viewType) {
      changeParams(
        {
          period: moment().startOf("month").format("Y-MM"),
          diagramType: "revenue",
          viewType: "remaining",
          limit: pageSizeOptions[0],
          page: 1,
        },
        {
          replace: true,
        }
      );
    } else {
      dispatch(
        cashFlowActions.fetch({
          home: _.get(query, "home") || undefined,
          period: _.get(query, "period") || undefined,
          excludeBlockId: _.get(query, "excludeBlockId") || undefined,
          diagramType: _.get(query, "diagramType") || undefined,
          otaBookingId: query.otaBookingId,
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.period, query.home, query.diagramType, query.excludeBlockId, query.otaBookingId]);

  useEffect(() => {
    if (query.flow || query.node) {
      const paramsGroup = {
        home: _.get(query, "home") || undefined,
        period: _.get(query, "period") || undefined,
        flow: query.flow || undefined,
        node: query.node || undefined,
        viewType: query.viewType || undefined,
        excludeBlockId: query.excludeBlockId || undefined,
        otaBookingId: query.otaBookingId || undefined,
      };
      if (query.groupValue) {
        if (_.isEmpty(dataGroup)) {
          dispatch(cashFlowDetailAction.fetchGroup(paramsGroup));
        }
        dispatch(
          cashFlowDetailAction.fetch({
            home: _.get(query, "home") || undefined,
            period: _.get(query, "period") || undefined,
            flow: query.flow || undefined,
            node: query.node || undefined,
            viewType: query.viewType || undefined,
            excludeBlockId: query.excludeBlockId || undefined,
            otaBookingId: query.otaBookingId || undefined,
            groupValue: query.groupValue || undefined,
          })
        );
      } else {
        dispatch(cashFlowDetailAction.fetchGroup(paramsGroup));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.home,
    query.period,
    query.flow,
    query.node,
    query.viewType,
    query.excludeBlockId,
    query.otaBookingId,
    query.groupValue,
  ]);

  useEffect(getData, [getData]);

  return (
    <Container>
      <Topbar>
        <h3>
          <IntlMessages id="cash_flow" />
        </h3>
      </Topbar>
      <TopBar changeParams={changeParams} query={query} listLine={listLine} listNode={listNode} />
      <Spin spinning={isLoading}>
        <Box mt={30} flex center position="relative" overflow="hidden" overflowX="auto">
          <Diagram
            isLoading={isLoading}
            changeParams={changeParams}
            query={query}
            data={data}
            dataGroups={dataGroups}
            totalRevenue={totalRevenue}
            totalExpense={totalExpense}
          />
        </Box>
      </Spin>
      <Box p="0px 10px">
        {query.flow || query.node ? (
          <TableDetail
            dataCashFlow={data}
            dataGroups={dataGroups}
            listLineCashFlow={listLine}
            query={query}
            changeParams={changeParams}
          />
        ) : null}
      </Box>
    </Container>
  );
}

export default memo(CashFlow);
