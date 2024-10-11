import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { connect } from "react-redux";
import { useDispatch } from "react-redux";
import { Empty } from "antd";

import Table from "@containers/Finance/payout/table";
import ToolBar from "@containers/Finance/payout/tool";
import { pageSizeOptions } from "@settings/const";

import actions from "@redux/accounting/expense/expenseOrderList/actions";
import { dataModalOrderList, ModalContextOrderList } from "./modalContext";
import ModalUpdate from "./modalUpdate";

function ModalContain({ children }) {
  const [state, setState] = useState(dataModalOrderList);
  return <ModalContextOrderList.Provider value={{ ...state, setState }}>{children}</ModalContextOrderList.Provider>;
}

const PayoutOrderList = ({ dataRedux, loading, refresh, query, ...props }) => {
  const [sortState, setSortState] = useState({
    sort: _.get(query, "sort"),
    sortType: _.get(query, "sortType"),
  });

  const isPayoutOrderList = Boolean(_.get(query, "type") === "payout_order_list");
  const dispatch = useDispatch();

  const searchInput = useRef(null);

  const changeParamsSort = (sort, sortType) => {
    props.changeParams({
      sort,
      sortType,
    });
  };
  const handleSortStateColumn = dataIndex => {
    if (sortState.sort === dataIndex) {
      if (sortState.sortType === null) {
        const sortType = "asc";
        setSortState(prevState => ({
          ...prevState,
          sortType,
        }));
        changeParamsSort(sortState.sort, sortType);
      } else if (sortState.sortType === "asc") {
        const sortType = "desc";
        setSortState(prevState => ({
          ...prevState,
          sortType: "desc",
        }));
        changeParamsSort(sortState.sort, sortType);
      } else if (sortState.sortType === "desc") {
        setSortState(prevState => ({
          ...prevState,
          sort: null,
          sortType: null,
        }));
        changeParamsSort(sortState.sort, null);
      }
    } else {
      setSortState({
        sort: dataIndex,
        sortType: "asc",
      });
      changeParamsSort(dataIndex, "asc");
    }
  };

  const handleChangeStateColumn = (selectedKeys, dataIndex) => {
    props.changeParams({
      ...query,
      [dataIndex]: selectedKeys[0],
    });
  };

  useEffect(() => {
    if (isPayoutOrderList) {
      if (!query.page || !query.limit) {
        props.changeParams(
          {
            toolFilter: "true",
            limit: pageSizeOptions[0],
            page: 1,
          },
          {
            replace: true,
          }
        );
      } else {
        const configQuery = _.omit(query, ["type", "page", "toolFilter"]);
        dispatch(
          actions.fetch({
            ...configQuery,
            ...sortState,
            limit: parseInt(_.get(query, "limit")),
            start: (parseInt(_.get(query, "page")) - 1) * parseInt(_.get(query, "limit")),
            blockIds: _.get(query, "home") || undefined,
            category: _.get(query, "category") || undefined,
            isInternal: _.get(query, "isInternal") || undefined,
            buyType: _.get(query, "buyType") || undefined,
            hasInvoice: _.get(query, "hasInvoice") || undefined,
            showPayMethod: "true",
            home: undefined,
          })
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sortState, isPayoutOrderList]);

  return isPayoutOrderList ? (
    <ModalContain>
      <ModalUpdate {...props} />
      <ToolBar nonTitle {...query} query={query} changeParams={props.changeParams} refreshEffect={refresh} />
      <Table
        noBordered
        page={_.get(query, "page") || 1}
        query={query}
        changeParams={props.changeParams}
        dataEffect={{
          data: _.get(dataRedux, "revenues") || [],
          totalRevenues: _.get(dataRedux, "totalRevenues"),
          total_amount: _.get(dataRedux, "total"),
          loading: loading,
          refreshDataEffect: refresh,
        }}
        sortState={sortState}
        searchInput={searchInput}
        handleSortStateColumn={handleSortStateColumn}
        handleChangeStateColumn={handleChangeStateColumn}
      />
    </ModalContain>
  ) : (
    <Empty />
  );
};

export default connect(
  ({ accounting: { expense } }) => ({
    dataRedux: expense.expenseOrderList.data,
    loading: expense.expenseOrderList.isLoading,
  }),
  actions
)(PayoutOrderList);
