// import { useEffect, useCallback, useState, useRef } from "react";
// import { useNavigate } from "react-router-dom";
// import { connect } from "react-redux";
// import moment from "moment";
// import _ from "lodash";

// import payinActions from "@redux/payin/actions";
// import { pageSizeOptions } from "@settings/const";

import Payin from "@containers/Finance/payin/index";

// import Modal from "@containers/Finance/payin/modal";
// import ToolBar from "@containers/Finance/payin/tool";
// import Table from "@containers/Finance/payin/table";
// import { changeStateSort } from "@containers/Accounting/const";

// const initParams = query => {
//   return {
//     limit: parseInt(_.get(query, "limit")),
//     start: (parseInt(_.get(query, "page")) - 1) * parseInt(_.get(query, "limit")),
//     showSMS: true,
//     home: _.get(query, "home") || undefined,
//     ota: _.get(query, "ota") || undefined,
//     room: _.get(query, "room") || undefined,
//     createdBy: _.get(query, "createdBy") || undefined,
//     collector: _.get(query, "collector") || undefined,
//     paymentState: _.get(query, "paymentState") || undefined,
//     payoutType: _.get(query, "payoutType") || undefined,
//     hosting: _.get(query, "hosting") || undefined,
//     source: _.get(query, "source") || undefined,
//     serviceType: _.get(query, "serviceType") || undefined,
//     status: _.get(query, "status") || undefined,
//     isOwnerCollect: _.get(query, "isOwnerCollect") || undefined,
//     isAvoidTransactionFee: _.get(query, "isAvoidTransactionFee") || undefined,
//     isEmptyBookingId: _.get(query, "isEmptyBookingId") || undefined,
//     isCalcDeposit: _.get(query, "isCalcDeposit") || undefined,
//     otaBookingId: _.get(query, "otaBookingId") || undefined,
//     description: _.get(query, "description") || undefined,
//     sms: _.get(query, "sms") || undefined,
//     type: _.get(query, "type_payout_list") || undefined,
//   };
// };

// const IncomeList = ({ update, fetch, changeParams, query, route }) => {
//   const [state, setState] = useState({
//     dataModal: {},
//     open: false,
//   });
//   const [sortState, setSortState] = useState({
//     sort: _.get(query, "sort"),
//     sortType: _.get(query, "sortType"),
//   });

//   const navigate = useNavigate();

//   const searchInput = useRef(null);

//   const newQuery = _.omit(query, ["type"]);

//   const changeParamsSort = (sort, sortType) => {
//     changeParams({
//       ...query,
//       sort,
//       sortType,
//     });
//   };

//   const handleSortStateColumn = dataIndex => {
//     changeStateSort({
//       changeParamsSort,
//       dataIndex,
//       setState: setSortState,
//       state: sortState,
//     });
//   };

//   const getData = useCallback(() => {
//     if (route === "income_list" || !route) {
//       if (!query.from || !query.to) {
//         changeParams(
//           {
//             from: moment().startOf("month").format("Y-MM-DD"),
//             to: moment().endOf("month").format("Y-MM-DD"),
//             // state: `${PAYOUT_STATE.processing.value},${PAYOUT_STATE.transferred.value}`,
//             // state: ``,
//             dateType: "createdAt",
//             ...sortState,
//           },
//           {
//             replace: true,
//           }
//         );
//       } else {
//         const newQuerry = [];
//         for (const key in query) {
//           const value = query[key];
//           if (value === "true") {
//             newQuerry[key] = true;
//           } else if (value === "false") {
//             newQuerry[key] = false;
//           } else {
//             newQuerry[key] = value;
//           }
//         }
//         fetch({
//           ...query,
//           ...sortState,
//           ...initParams(query),
//         });
//       }
//     }
//   }, [query, sortState, route, changeParams, fetch]);

//   const onPushRow = useCallback(
//     bookingId => {
//       navigate(`/reservations/${bookingId}/pricing`);
//     },
//     [navigate]
//   );

//   const onTypeChange = useCallback(
//     e => {
//       const type_payout_list = e.target.value;
//       changeParams({
//         type_payout_list,
//         page: 1,
//         paymentState: type_payout_list === "unpaid" ? type_payout_list : undefined,
//       });
//     },
//     [changeParams]
//   );

//   const onRowClick = useCallback(dataModal => {
//     setState({
//       open: true,
//       dataModal,
//     });
//   }, []);

//   useEffect(getData, [getData]);

//   return (
//     <>
//       {state.open && (
//         <Modal
//           dataModal={state.dataModal}
//           update={update}
//           toggleModal={() => setState(state => ({ ...state, open: !state.open }))}
//           showBlock={!state.dataModal._id || !state.dataModal.bookingId}
//           refresh={getData}
//         />
//       )}
//       <ToolBar
//         {...newQuery}
//         onTypeChange={onTypeChange}
//         changeParams={changeParams}
//         onRowClick={onRowClick}
//         refresh={getData}
//         query={query}
//         type={query.type_payout_list}
//         accounting
//         nonTitle
//         nonePadding
//       />
//       <Table
//         {...newQuery}
//         noBordered
//         query={query}
//         page={parseInt(_.get(query, "page"))}
//         onPushRow={onPushRow}
//         type={query.type_payout_list}
//         onRowClick={onRowClick}
//         changeParams={changeParams}
//         searchInput={searchInput}
//         handleSortStateColumn={handleSortStateColumn}
//         sortState={sortState}
//       />
//     </>
//   );
// };

// export default connect(null, payinActions)(IncomeList);

function List(props) {
  return <Payin nonTitle={true} />;
}

export default List;
