// import { useState, useEffect, useRef, useCallback } from "react";
// import { useDispatch } from "react-redux";
// import _ from "lodash";
// import moment from "moment";

// import { pageSizeOptions } from "@settings/const";
// import payoutActions from "@redux/payout/actions";
// import ToolBar from "@containers/Finance/payout/tool";
// import TableWrapper from "@containers/Finance/payout/table";
// import { ModalContext, dataModal } from "@containers/Finance/payout/modalContext";
// import { changeStateSort } from "@containers/Accounting/const";

import PayoutList from "@containers/Finance/payout";

// function ModalContain({ children }) {
//   const [state, setState] = useState(dataModal);

//   return <ModalContext.Provider value={{ ...state, setState }}>{children}</ModalContext.Provider>;
// }

// const intitParams = ({ query }) => {
//   return {
//     limit: parseInt(_.get(query, "limit")),
//     start: (parseInt(_.get(query, "page")) - 1) * parseInt(_.get(query, "limit")),
//     home: _.get(query, "home") || undefined,
//     from: _.get(query, "from") || undefined,
//     to: _.get(query, "to") || undefined,
//     createdBy: _.get(query, "createdBy") || undefined,
//     category: _.get(query, "category") || undefined,
//     state: _.get(query, "state") || undefined,
//     distribute: _.get(query, "distribute") || undefined,
//     isInternal: _.get(query, "isInternal") || undefined,
//     dateType: _.get(query, "dateType") || undefined,
//     buyType: _.get(query, "buyType") || undefined,
//     description: _.get(query, "description") || undefined,
//     hasInvoice: _.get(query, "hasInvoice") || undefined,
//   };
// };

// const PayoutList = ({ changeParams, query, loading, total, page, setPage, route, ...props }) => {
//   const [sortState, setSortState] = useState({
//     sort: _.get(query, "sort"),
//     sortType: _.get(query, "sortType"),
//   });

//   const dispatch = useDispatch();

//   const searchInput = useRef(null);

//   const changeParamsSort = (sort, sortType) => {
//     changeParams({
//       sort,
//       sortType,
//     });
//   };

//   const handleSortStateColumn = dataIndex =>
//     changeStateSort({
//       changeParamsSort,
//       dataIndex,
//       setState: setSortState,
//       state: sortState,
//     });

//   const handleChangeStateColumn = (selectedKeys, dataIndex) => {
//     changeParams({
//       [dataIndex]: selectedKeys[0],
//     });
//   };

//   const getData = useCallback(() => {
//     if (route === "payout_list" || !route) {
//       if (!query.from || !query.to || !query.page || !query.limit || !query.toolFilter) {
//         changeParams(
//           {
//             limit: pageSizeOptions[0],
//             page: 1,
//             dateType: "createdAt",
//             from: moment().startOf("month").format("Y-MM-DD"),
//             to: moment().endOf("month").format("Y-MM-DD"),
//             toolFilter: "true",
//           },
//           {
//             replace: true,
//           }
//         );
//       } else {
//         dispatch(
//           payoutActions.fetch({
//             ...query,
//             ...sortState,
//             ...intitParams({ query }),
//           })
//         );
//       }
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [query, sortState, route]);

//   useEffect(getData, [getData]);

//   return (
//     <ModalContain>
//       <ToolBar nonePadding nonTitle {...query} query={query} changeParams={changeParams} />
//       <TableWrapper
//         noBordered
//         page={query.page || 1}
//         query={query}
//         changeParams={changeParams}
//         searchInput={searchInput}
//         handleSortStateColumn={handleSortStateColumn}
//         handleChangeStateColumn={handleChangeStateColumn}
//         sortState={sortState}
//       />
//     </ModalContain>
//   );
// };

// export default PayoutList;

function List() {
  return <PayoutList nonTitle />;
}

export default List;
