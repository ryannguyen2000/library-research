import { useCallback } from "react";
// import { connect } from "react-redux";
// import { PlusOutlined } from "@ant-design/icons";
// import _ from "lodash";
// import { Link } from "react-router-dom";
// import moment from "moment";

// import actions from "@redux/financeReports/list/actions";
// import Table from "@containers/Finance/reportsPayin/list";
// import { HeaderButton } from "@components/page/headerComponent";
// import TopBarContainer from "@containers/Accounting/container/TopBarContainer";

// import ToolFilter from "./tool/toolFilter";

import PayoutList from "@containers/Finance/reportsPayout";

// const LitsReportsPayout = ({ fetch, del, query, route, ...props }) => {
//   const isToolFilter = _.get(query, "toolFilter") === "true";
//   const handleDropdown = () => {
//     if (!isToolFilter) {
//       props.changeParams({
//         toolFilter: "true",
//       });
//     } else {
//       props.changeParams({
//         toolFilter: "false",
//       });
//     }
//   };

//   const onTableChange = useCallback(
//     pagination => {
//       props.changeParams({
//         limit: pagination.pageSize,
//         page: pagination.current,
//       });
//     },
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//     [props.changeParams]
//   );

//   const withLink = (id, children) => {
//     return <Link to={`reports_payout_list?toolFilter=true&detailId=${id}`}>{children}</Link>;
//   };

//   const handleCreate = useCallback(() => {
//     const clearParams = _.mapValues(query, () => undefined);
//     props.changeParams({
//       ...clearParams,
//       type: "reports_payout_list",
//       detailId: "create",
//     });
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   const getData = useCallback(() => {
//     if (route === "reports_payout_list") {
//       const { page = 1, limit = 10, ...otherQuery } = query;
//       if (!query.from || !query.to || !query.toolFilter) {
//         props.changeParams({
//           toolFilter: "true",
//           from: moment().startOf("month").format("Y-MM-DD"),
//           to: moment().endOf("month").format("Y-MM-DD"),
//         });
//       } else {
//         fetch({
//           ...otherQuery,
//           type: "pay",
//           start: (+page - 1) * limit,
//           limit: +limit,
//           toolFilter: undefined,
//         });
//       }
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [query, route]);

//   useEffect(getData, [getData]);

//   return (
//     <>
//       <TopBarContainer
//         nonePadding
//         childrenBtnNode={
//           <>
//             <HeaderButton onClick={handleDropdown}>
//               <i className="ion-android-options abs-icon" />
//               <span>BỘ lỌC</span>
//             </HeaderButton>
//             <HeaderButton icon={<PlusOutlined />} onClick={handleCreate}>
//               TẠO MỚI
//             </HeaderButton>
//           </>
//         }
//         toolFilterNode={<ToolFilter isOpenDr={isToolFilter} {...query} {...props} />}
//       />
//       <Table
//         type="pay"
//         del={del}
//         onTableChange={onTableChange}
//         page={query.page || 1}
//         pageSize={query.limit}
//         withLinkCs={withLink}
//       />
//     </>
//   );
// };

// export default connect(null, actions)(LitsReportsPayout);

function List({ changeParams }) {
  const handleCreate = useCallback(() => {
    changeParams({
      detailId: "create",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PayoutList nonTitle accounting handleCreate={handleCreate} />;
}

export default List;
