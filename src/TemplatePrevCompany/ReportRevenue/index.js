import _ from "lodash";
import queryString from "query-string";
import { useLocation, useNavigate } from "react-router";
import { Link, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo } from "react";
import { Menu } from "antd";
import { useSelector } from "react-redux";

import IntlMessages from "@components/utility/intlMessages";
import { createChangeParams } from "@helpers/func";

import ContentRouterElement from "./container";
import { ReportRevenueWrapper } from "./styles";
import { routes } from "./const";

const ReportRevenue = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => queryString.parse(searchParams.toString()), [searchParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changeSearchParams = useCallback(createChangeParams(setSearchParams), [setSearchParams]);

  const view = useSelector(state => state.App.view);

  const activeKey = pathname.split("/")[2];

  const isMobile = view !== "DesktopView";

  useEffect(() => {
    if (!activeKey) {
      navigate(`revenueStream`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <ReportRevenueWrapper>
      <Menu
        style={{ width: isMobile ? "100%" : 170 }}
        defaultSelectedKeys={["revenueStream"]}
        selectedKeys={activeKey}
        mode={isMobile ? "horizontal" : "inline"}
        items={_.map(routes, item => ({
          label: (
            <Link disabled={item.disabled} to={{ pathname: item.to, search }}>
              <IntlMessages id={item.to} />
            </Link>
          ),
          key: item.to,
          icon: item.icon,
          disabled: item.disabled,
        }))}
      />
      <ContentRouterElement
        searchParams={searchParams}
        query={query}
        changeSearchParams={changeSearchParams}
        isMobile={isMobile}
        pathName={activeKey}
      />
    </ReportRevenueWrapper>
  );
};

export default ReportRevenue;
