import { useCallback, useEffect, useState } from "react";
import { useDispatch, connect } from "react-redux";
import _ from "lodash";

import actions from "@redux/accounting/expense/newExpense/actions";
// import { Box } from "@components/utility/styles";
import Box from "@components/utility/box";

import TableNewExpense from "./tableNewExpense";
import ToolBar from "./tool";
import { ModalContextNewExpense, dataModalNewExpense } from "./tool/modalContext";
import ModalUpdate from "./tool/modalUpdate";

function ModalContain({ children }) {
  const [state, setState] = useState(dataModalNewExpense);
  return <ModalContextNewExpense.Provider value={{ ...state, setState }}>{children}</ModalContextNewExpense.Provider>;
}

const NewPayout = ({ query, changeParams, data, totalData, loading, ...props }) => {
  const dispatch = useDispatch();

  const limit = parseInt(_.get(query, "limit")) || 10;
  const page = parseInt(_.get(query, "page")) || 1;

  const getData = useCallback(() => {
    dispatch(
      actions.fetch({
        ...query,
        type: undefined,
        page: undefined,
        home: undefined,
        limit,
        start: limit * (page - 1),
      })
    );
  }, [dispatch, query, limit, page]);

  useEffect(getData, [getData]);

  return (
    <ModalContain>
      <ModalUpdate {...props} />
      <>
        <ToolBar data={data} changeParams={changeParams} query={query} {...props} />
        <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
          <TableNewExpense
            data={data}
            totalData={totalData}
            changeParams={changeParams}
            query={query}
            loading={loading}
            page={page}
            pageSize={limit}
            {...props}
          />
        </Box>
      </>
    </ModalContain>
  );
};

export default connect(
  ({ accounting: { expense } }) => ({
    data: expense.newExpense.data,
    totalData: expense.newExpense.total,
    loading: expense.newExpense.isLoading,
  }),
  actions
)(NewPayout);
