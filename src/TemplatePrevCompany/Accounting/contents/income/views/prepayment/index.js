// import { useCallback, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { connect } from "react-redux";
// import moment from "moment";

// import actions from "@redux/financeReports/list/actions";
// import Table from "@containers/Finance/reportsPayin/list";
// import ToolBar from "@containers/Finance/reportsPayin/toolbar";

// const PrepaymentList = ({
//   fetch,
//   del,
//   changeParams,
//   query,
//   setSearchParams,
//   loading,
//   total,
//   page,
//   setPage,
//   route,
//   ...props
// }) => {
//   const navigate = useNavigate();

//   const onTableChange = pagination => {
//     changeParams({
//       limit: pagination.pageSize,
//       page: pagination.current,
//     });
//   };

//   const handleCreate = () => {
//     navigate(`/finance/reports-payin/create`);
//   };

//   const getData = useCallback(() => {
//     if (route === "prepayment_list") {
//       const { page = 1, limit = 10, ...otherQuery } = query;
//       if (!query.from || !query.to || !otherQuery.toolFilter) {
//         changeParams(
//           {
//             from: moment().startOf("month").format("Y-MM-DD"),
//             to: moment().endOf("month").format("Y-MM-DD"),
//             toolFilter: "true",
//           },
//           {
//             replace: true,
//           }
//         );
//       } else {
//         fetch({
//           ...otherQuery,
//           type: undefined,
//           toolFilter: undefined,
//           start: (page - 1) * limit,
//           limit: +limit,
//         });
//       }
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [query, fetch, route]);

//   useEffect(getData, [getData]);

//   return (
//     <>
//       <ToolBar
//         nonePadding
//         nonTitle
//         accounting
//         handleCreate={handleCreate}
//         changeParams={changeParams}
//         payin
//         {...query}
//       />
//       <Table del={del} onTableChange={onTableChange} page={query.page} pageSize={query.limit} />
//     </>
//   );
// };

// export default connect(null, actions)(PrepaymentList);

import ReportPayin from "@containers/Finance/reportsPayin";

function List() {
  return <ReportPayin nonTitle={true} />;
}

export default List;
