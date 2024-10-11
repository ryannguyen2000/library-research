import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";

import Loader from "../../components/utility/loader";
import asyncComponent from "../../helpers/AsyncFunc";
import useRole from "../../hooks/role";
import { PERMISSIONS } from "../../settings/const";

const routes = [
  {
    path: "",
    component: asyncComponent(() => import("../Overview")),
  },
  {
    path: "account-info",
    isPublic: true,
    component: asyncComponent(() => import("../UserInfo")),
  },
  {
    path: "accounts/users",
    component: asyncComponent(() => import("../Permission/Users")),
  },
  {
    path: "accounts/roles",
    component: asyncComponent(() => import("../Permission/Roles")),
  },
  {
    path: "accounts/activity",
    component: asyncComponent(() => import("../Permission/Activity")),
  },
  {
    path: "accounts/calling",
    component: asyncComponent(() => import("../Permission/CallUsers")),
  },
  {
    path: "accounts/work-schedule",
    component: asyncComponent(() => import("../Permission/WorkSchedule")),
  },
  {
    path: "accounts/work-log",
    component: asyncComponent(() => import("../Permission/WorkLog")),
  },
  {
    path: "finance/shift-handover",
    component: asyncComponent(() => import("../Permission/ShiftHandover")),
  },
  {
    path: "finance/shift-handover/:id",
    component: asyncComponent(() => import("../Permission/ShiftHandover/detail")),
  },
  {
    exact: false,
    path: "accounts/users/:id",
    component: asyncComponent(() => import("../Permission/Users/detail")),
  },
  {
    path: "stats/review",
    component: asyncComponent(() => import("../Stat/Review")),
  },
  {
    path: "stats/review-2",
    component: asyncComponent(() => import("../Stat/ReviewDetail")),
  },
  {
    path: "stats/message",
    component: asyncComponent(() => import("../Stat/Message")),
  },
  {
    path: "stats/task",
    component: asyncComponent(() => import("../Stat/Task")),
  },
  {
    exact: false,
    path: "calendar",
    component: asyncComponent(() => import("../Calendar")),
  },
  {
    path: "finance/payin",
    component: asyncComponent(() => import("../Finance/payin")),
  },
  {
    path: "finance/payout",
    component: asyncComponent(() => import("../Finance/payout")),
  },
  {
    path: "finance/payout/:id",
    component: asyncComponent(() => import("../Finance/paymentDetail")),
  },
  {
    path: "finance/payment-categories",
    component: asyncComponent(() => import("../Finance/categories/payoutType")),
  },
  {
    path: "finance/overview",
    component: asyncComponent(() => import("../Finance/overview")),
  },
  {
    path: "finance/statistics",
    component: asyncComponent(() => import("../Finance/statistics")),
  },
  {
    path: "finance/payout-statistics",
    component: asyncComponent(() => import("../Finance/payoutStatistics")),
  },
  {
    path: "finance/reports-payin",
    component: asyncComponent(() => import("../Finance/reportsPayin")),
  },
  {
    path: "finance/reports-payin/:id",
    component: asyncComponent(() => import("../Finance/reportPayin")),
  },
  {
    path: "finance/ota-reports",
    component: asyncComponent(() => import("../Finance/reportOTA")),
  },
  {
    path: "finance/service-fee",
    component: asyncComponent(() => import("../Finance/serviceFee")),
  },
  {
    path: "finance/reports-payout",
    component: asyncComponent(() => import("../Finance/reportsPayout")),
  },
  {
    path: "finance/reports-payout/:id",
    component: asyncComponent(() => import("../Finance/reportPayout")),
  },
  {
    path: "finance/prepaid",
    component: asyncComponent(() => import("../Finance/prePaid")),
  },
  {
    path: "finance/prepaid/:id",
    component: asyncComponent(() => import("../Finance/prePaid/detail")),
  },
  {
    path: "finance/analytic",
    component: asyncComponent(() => import("../Finance/analytic")),
  },
  {
    path: "finance/report",
    component: asyncComponent(() => import("../Finance/reportAll")),
  },
  {
    path: "finance/prepaid-detail",
    component: asyncComponent(() => import("../Finance/prePaidDetail")),
  },
  {
    path: "finance/online-payment",
    component: asyncComponent(() => import("../Finance/onlinePayment")),
  },
  {
    path: "finance/cash-flow",
    component: asyncComponent(() => import("../Finance/cashFlow")),
  },
  {
    exact: false,
    path: "accounting",
    component: asyncComponent(() => import("../Accounting")),
  },
  {
    path: "guests/list",
    component: asyncComponent(() => import("../Guest")),
  },
  {
    path: "guests/residence",
    component: asyncComponent(() => import("../Guest/residence")),
  },
  {
    path: "guests/blacklist",
    component: asyncComponent(() => import("../Guest/blacklist")),
  },
  {
    path: "guests/merge",
    component: asyncComponent(() => import("../Guest/merge")),
  },
  {
    path: "guests/:id",
    component: asyncComponent(() => import("../Guest/detail")),
  },
  {
    path: "houses",
    component: asyncComponent(() => import("../House")),
  },
  {
    exact: false,
    path: "houses/:id",
    component: asyncComponent(() => import("../House/create_update")),
  },
  {
    exact: false,
    path: "inbox",
    component: asyncComponent(() => import("../Inbox")),
  },
  {
    path: "listings",
    refer: "houses",
    component: asyncComponent(() => import("../Listing")),
  },
  {
    path: "history",
    component: asyncComponent(() => import("../House/History")),
    exact: false,
    refer: "houses",
  },
  {
    exact: false,
    path: "listings/:id",
    refer: "houses",
    component: asyncComponent(() => import("../Listing/detail")),
  },
  {
    path: "promotion",
    component: asyncComponent(() => import("../Promotion/newPromotion")),
  },
  {
    path: "reservations",
    component: asyncComponent(() => import("../Reservation")),
  },
  {
    exact: false,
    path: "reservations/:id",
    component: asyncComponent(() => import("../Reservation/detail")),
  },
  {
    path: "reviews",
    component: asyncComponent(() => import("../KPI/review")),
  },
  {
    path: "settings/ota",
    component: asyncComponent(() => import("../Setting/ota")),
  },
  {
    path: "settings/global",
    component: asyncComponent(() => import("../Setting/global")),
  },
  {
    path: "settings/ott",
    component: asyncComponent(() => import("../Setting/ott")),
  },
  {
    path: "settings/ota-list",
    component: asyncComponent(() => import("../Setting/otaSync")),
  },
  {
    path: "settings/chat-templates",
    component: asyncComponent(() => import("../Setting/chatTemplate")),
  },
  {
    path: "settings/redirect/facebook",
    isPublic: true,
    component: asyncComponent(() => import("../Setting/redirectPage")),
  },
  {
    path: "settings/banking",
    component: asyncComponent(() => import("../Setting/Banking")),
  },
  {
    path: "account-info",
    isPublic: true,
    component: asyncComponent(() => import("../Setting/")),
  },
  {
    path: "task/schedule",
    component: asyncComponent(() => import("../Task/scheduler")),
  },
  {
    path: "task/tasks",
    component: asyncComponent(() => import("../Task")),
  },
  {
    path: "task/employee",
    component: asyncComponent(() => import("../Task/employee")),
  },
  {
    path: "task/pccc",
    component: asyncComponent(() => import("../Task/pccc")),
  },
  {
    exact: false,
    path: "task/tasks/:id",
    component: asyncComponent(() => import("../Task/detail")),
  },
  {
    path: "task/categories",
    component: asyncComponent(() => import("../Task/Categories")),
  },
  {
    path: "task/category-checklist",
    component: asyncComponent(() => import("../Task/CategoryCheckList")),
  },
  {
    exact: false,
    path: "customer-support",
    component: asyncComponent(() => import("../CustomerSupport")),
  },
  {
    exact: false,
    path: "price",
    component: asyncComponent(() => import("../Price")),
  },
  {
    exact: false,
    path: "performance/ADR",
    component: asyncComponent(() => import("../Performance/ADR")),
  },
  {
    exact: false,
    path: "performance/RevPar",
    component: asyncComponent(() => import("../Performance/RevPar")),
  },
  {
    exact: false,
    path: "performance/occupancy",
    component: asyncComponent(() => import("../Performance/Occupancy")),
  },
  {
    exact: false,
    path: "performance/ALOS",
    component: asyncComponent(() => import("../Performance/ALOS")),
  },
  {
    path: "performance/booking-window",
    component: asyncComponent(() => import("../Performance/BookingWindow")),
  },
  {
    path: "performance/ranking",
    component: asyncComponent(() => import("../Performance/Ranking")),
  },
  {
    path: "performance/boost-ranking",
    component: asyncComponent(() => import("../Performance/BoostRanking")),
  },
  {
    path: "performance/revenue",
    component: asyncComponent(() => import("../Performance/Revenue")),
  },
  {
    path: "performance/statistic-reservation",
    component: asyncComponent(() => import("../Performance/StatisticReservation")),
  },
  {
    path: "performance/pricing",
    component: asyncComponent(() => import("../Performance/Pricing")),
  },
  {
    path: "equipment/type",
    component: asyncComponent(() => import("../Equipment/Type")),
  },
  {
    path: "equipment/store",
    exact: false,
    component: asyncComponent(() => import("../Equipment/Store")),
  },
  {
    path: "equipment/form-request",
    exact: false,
    component: asyncComponent(() => import("../Equipment/FormRequest")),
  },
  {
    path: "equipment/form-import",
    exact: false,
    component: asyncComponent(() => import("../Equipment/FormImport")),
  },
  {
    path: "equipment/form-transfer",
    exact: false,
    component: asyncComponent(() => import("../Equipment/FormTransfer")),
  },
  {
    path: "equipment/form-counting",
    exact: false,
    component: asyncComponent(() => import("../Equipment/FormCounting")),
  },
  {
    path: "sms",
    isPublic: true,
    component: asyncComponent(() => import("../Sms")),
  },
  {
    path: "reminder",
    isPublic: true,
    component: asyncComponent(() => import("../Reminder")),
  },
  {
    path: "asset/list",
    exact: false,
    component: asyncComponent(() => import("../Asset/list")),
  },
  {
    path: "asset/kind",
    exact: false,
    component: asyncComponent(() => import("../Asset/kind")),
  },
  {
    path: "asset/package",
    exact: false,
    component: asyncComponent(() => import("../Asset/package")),
  },
  {
    path: "asset/approve",
    exact: true,
    component: asyncComponent(() => import("../Asset/approve")),
  },
  {
    path: "asset/approve/:id",
    exact: false,
    component: asyncComponent(() => import("../Asset/approve/detail")),
  },
  {
    path: "asset/tag",
    exact: false,
    component: asyncComponent(() => import("../Asset/Tag")),
  },
  {
    exact: false,
    path: "asset/assetIssues",
    component: asyncComponent(() => import("../Asset/assetIssuesManagement")),
  },
  {
    exact: false,
    path: "asset/assetIssue/:id",
    component: asyncComponent(() => import("../Asset/assetIssuesManagement/detailAssetIssue")),
  },
  {
    path: "new-report",
    exact: false,
    component: asyncComponent(() => import("../Report")),
  },
  {
    path: "export-report",
    exact: false,
    component: asyncComponent(() => import("../ExportPDFReport")),
  },
  {
    path: "report-revenue",
    exact: false,
    component: asyncComponent(() => import("../ReportRevenue")),
  },
  // {
  //   path: "report",
  //   exact: false,
  //   component: asyncComponent(() => import("../OldReport")),
  // },
  {
    path: "new-cs",
    exact: false,
    component: asyncComponent(() => import("../NewCS")),
  },
  {
    path: "guest-merge",
    exact: false,
    component: asyncComponent(() => import("../Guest/merge")),
  },
];

const NotFound = asyncComponent(() => import("../Page/404"));

function CheckRoute() {
  const loading = useSelector(state => state.Auth.loading);
  if (loading) return <Loader />;

  return <AppRoute />;
}

function AppRoute() {
  const authRoutes = useSelector(state => state.Auth.routes);
  const [roleRoom, roleRoot] = useRole([PERMISSIONS.ROOM, PERMISSIONS.ROOT]);

  const routeComponents = [];
  routes.forEach(({ path, exact = true, component: Elem, isPublic, refer }) => {
    if (
      roleRoot.exists ||
      isPublic ||
      (authRoutes.some(route => route.includes(refer || path) || route.includes(path.split("/")[0])) &&
        (path === "listings/:id" ? roleRoom.write : true))
    ) {
      routeComponents.push(<Route key={path} path={exact ? `/${path}` : `/${path}/*`} element={<Elem />} />);
    }
  });

  return (
    <Routes>
      {routeComponents}
      <Route path="/*" element={<NotFound />} />
    </Routes>
  );
}

export default CheckRoute;
