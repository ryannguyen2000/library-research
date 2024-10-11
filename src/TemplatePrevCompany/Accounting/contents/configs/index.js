import { useLocation } from "react-router-dom";
import IntlMessages from "@components/utility/intlMessages";

import PaymentAccounts from "./views/paymentAccounts";
import PaymentAutos from "./views/paymentAutos";
import Menus from "../menus";

const components = {
  paymentAccounts: PaymentAccounts,
  paymentAutos: PaymentAutos,
};

const Configs = ({ searchParams, query, changeSearchParams }) => {
  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[3] || "paymentAccounts";

  const INCOME_TABS = [
    {
      key: "paymentAccounts",
      label: <IntlMessages id="paymentAccounts" />,
      // children: (
      //   <PaymentAccounts
      //     route={activeKey}
      //     searchParams={searchParams}
      //     changeParams={changeSearchParams}
      //     query={query}
      //   />
      // ),
    },
    {
      key: "paymentAutos",
      label: <IntlMessages id="paymentAutos" />,
      // children: (
      //   <PaymentAutos route={activeKey} searchParams={searchParams} changeParams={changeSearchParams} query={query} />
      // ),
    },
  ];

  const Component = components[activeKey];

  return (
    <>
      <Menus items={INCOME_TABS} activeKey={activeKey} />
      {Component && <Component searchParams={searchParams} changeParams={changeSearchParams} query={query} />}
    </>
  );
};

export default Configs;
