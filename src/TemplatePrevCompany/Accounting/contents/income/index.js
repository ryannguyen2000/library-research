import { useLocation } from "react-router-dom";

import IntlMessages from "@components/utility/intlMessages";

import IncomeList from "./views/incomeList";
import ProfessionList from "./views/profession";
import PrepaymentList from "./views/prepayment";
// import Debt from "./views/debt";
import Menus from "../menus";

const components = {
  income_list: IncomeList,
  income_profession: ProfessionList,
  prepayment_list: PrepaymentList,
  // debt: Debt,
};

const Income = ({ searchParams, changeSearchParams, query }) => {
  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[3] || "income_list";

  const INCOME_TABS = [
    {
      key: "income_list",
      label: <IntlMessages id="income_list" />,
      // children: (
      //   <IncomeList route={activeKey} searchParams={searchParams} changeParams={changeSearchParams} query={query} />
      // ),
    },
    {
      key: "prepayment_list",
      label: <IntlMessages id="prepayment_list" />,
      // children: (
      //   <PrepaymentList route={activeKey} searchParams={searchParams} changeParams={changeSearchParams} query={query} />
      // ),
    },
    {
      key: "income_profession",
      label: <IntlMessages id="income_profession" />,
      // children: (
      //   <ProfessionList route={activeKey} searchParams={searchParams} changeParams={changeSearchParams} query={query} />
      // ),
    },
    // {
    //   key: "debt",
    //   label: <IntlMessages id="debt" />,
    //   // children: <Debt route={activeKey} searchParams={searchParams} changeParams={changeSearchParams} query={query} />,
    //   disabled: true,
    // },
  ];

  const Component = components[activeKey];

  return (
    <>
      <Menus items={INCOME_TABS} activeKey={activeKey} />
      {Component && <Component searchParams={searchParams} changeParams={changeSearchParams} query={query} />}
    </>
  );
};

export default Income;
