import { useLocation } from "react-router-dom";

import IntlMessages from "@components/utility/intlMessages";

// import PayoutOrderList from "./views/payoutOrderList";
import PayoutList from "./views/payoutList";
import ReportsPayoutList from "./views/reportsPayoutList";
import NewPayout from "./views/newPayout";
import Menus from "../menus";

const components = {
  payout_list: PayoutList,
  reports_payout_list: ReportsPayoutList,
  payment_order: NewPayout,
};

const Payout = ({ searchParams, query, changeSearchParams }) => {
  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[3] || "payout_list";

  const EXPENSE_TABS = [
    {
      key: "payout_list",
      label: <IntlMessages id="payout_list" />,
      // children: <PayoutList route={activeKey} changeParams={changeSearchParams} query={query} />,
    },
    {
      key: "reports_payout_list",
      label: <IntlMessages id="reports_payout_list" />,
      // children: <ReportsPayoutList route={activeKey} changeParams={changeSearchParams} query={query} />,
    },
    {
      key: "payment_order",
      label: <IntlMessages id="payment_order" />,
      // children: <NewPayout route={activeKey} changeParams={changeSearchParams} query={query} />,
    },
  ];

  const Component = components[activeKey];

  return (
    <>
      <Menus items={EXPENSE_TABS} defaulTab="payout_list" activeKey={activeKey} />
      {Component && <Component searchParams={searchParams} changeParams={changeSearchParams} query={query} />}
    </>
  );
};

export default Payout;
