import Box from "@components/utility/box";
import ToolBar from "./tool";
import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import queryString from "query-string";
import _ from "lodash";
import { useDispatch } from "react-redux";
import { createChangeParams } from "@helpers/func";
import TableTransitionHistory from "./tables";

import paymentActions from "@redux/accounting/income/profession/transactionHistory/payment/actions";
import transactionActions from "@redux/accounting/income/profession/transactionHistory/transaction/actions";

const TransactionHistory = () => {
  const dispatch = useDispatch();

  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => queryString.parse(searchParams.toString()), [searchParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changeParams = useCallback(createChangeParams(setSearchParams), [setSearchParams]);

  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.limit) || 10;
  const from = _.get(query, "from");
  const to = _.get(query, "to");

  const type = _.get(query, "type", "kovena_payment");

  const getData = useCallback(() => {
    if (!type || type === "kovena_payment") {
      const dataReq = {
        ...query,
        type: undefined,
        date_from: from,
        date_to: to,
        limit: pageSize,
      };
      dispatch(paymentActions.fetch(dataReq));
    }
    if (type === "kovena_transaction") {
      const dataReq = {
        ...query,
        type: undefined,
        date_from: from,
        date_to: to,
        limit: pageSize,
      };
      dispatch(transactionActions.fetch(dataReq));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, query]);

  const onTypeChange = useCallback(e => {
    const type = e.target.value;
    const queryUndefined = _.mapValues(query, () => undefined);
    if (queryUndefined) {
      changeParams({
        ...queryUndefined,
        type,
        page: 1,
        limit: 10,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getData();
  }, [getData]);

  return (
    <>
      <div style={{ padding: "10px 0" }}>
        <ToolBar
          {...query}
          query={query}
          onTypeChange={onTypeChange}
          changeParams={changeParams}
          nonTitle={true}
          type={type}
        />
      </div>
      <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
        <TableTransitionHistory
          changeParams={changeParams}
          query={query}
          limit={pageSize}
          page={page}
          setPage={() => {}}
          type={type}
        />
      </Box>
    </>
  );
};

export default TransactionHistory;
