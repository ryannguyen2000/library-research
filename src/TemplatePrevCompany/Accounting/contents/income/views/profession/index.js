import { useLocation } from "react-router-dom";

import IntlMessages from "@components/utility/intlMessages";

// import TransactionHistory from "./views/transactionHistory";
// import CashFund from "./views/cashFund";
import IncomeOta from "./views/incomeFromOTA";
import Booking from "./views/booking";
// import ThirdPartyPaid from "./views/thirdPartyPaid";
import Menus from "@containers/Accounting/contents/menus";
import TransactionHistory from "./views/transactionHistory";

const DEFAULT_TAB = "income_ota";

const components = {
  income_ota: IncomeOta,
  booking: Booking,
};

const ProfessionList = ({ changeParams, query, searchParams, ...props }) => {
  const type = searchParams.get("typeChild") || DEFAULT_TAB;

  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[4] || "income_ota";

  const PROFESSION_TABS = [
    {
      key: "income_ota",
      label: <IntlMessages id="income_ota" />,
      // children: <IncomeOta routechild={activeKey} type={type} changeParams={changeParams} query={query} {...props} />,
    },
    {
      key: "booking",
      label: "BOOKING.COM",
      // children: (
      //   <TransactionHistory routechild={activeKey} type={type} changeParams={changeParams} query={query} {...props} />
      // ),
    },
    {
      key: "transaction_history",
      label: <IntlMessages id="transaction_history" />,
      children: (
        <TransactionHistory routechild={activeKey} type={type} changeParams={changeParams} query={query} {...props} />
      ),
    },
    {
      key: "income_cash_fund",
      label: <IntlMessages id="income_cash_fund" />,
      // children: <CashFund routechild={activeKey} type={type} changeParams={changeParams} query={query} {...props} />,
      disabled: true,
    },
    // {
    //   key: "income_third_party_paid",
    //   label: <IntlMessages id="income_third_party_paid" />,
    //   // children: (
    //   //   <ThirdPartyPaid routechild={activeKey} type={type} changeParams={changeParams} query={query} {...props} />
    //   // ),
    //   disabled: true,
    // },
  ];

  const Component = components[activeKey];

  return (
    <>
      <Menus items={PROFESSION_TABS} activeKey={activeKey} routeParent="income_profession" />
      {Component && <Component type={type} changeParams={changeParams} query={query} {...props} />}
    </>
  );
};

export default ProfessionList;
