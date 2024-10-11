import { useCallback, useEffect, useMemo } from "react";
import { Menu } from "antd";
import { CommentOutlined, PoundOutlined, AuditOutlined, ProjectOutlined, SettingOutlined } from "@ant-design/icons";
import _ from "lodash";
import queryString from "query-string";
import { Routes, Route, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import styled from "styled-components";

import IntlMessages from "@components/utility/intlMessages";
import { createChangeParams } from "@helpers/func";

import { AccountingWrapper } from "./styles";
import Communicate from "./contents/communicate";
import Payout from "./contents/payout";
import Income from "./contents/income";
import Profession from "./contents/profession";
import Statistic from "./contents/statistic";
import Configs from "./contents/configs";
import { CsLink } from "./contents/menus";

const routes = [
  {
    to: "communicate",
    icon: <CommentOutlined />,
    element: Communicate,
    disabled: true,
  },
  {
    to: "expense",
    icon: <PoundOutlined />,
    element: Payout,
  },
  {
    to: "income",
    icon: <PoundOutlined />,
    element: Income,
  },
  {
    to: "profession",
    icon: <AuditOutlined />,
    element: Profession,
    disabled: true,
  },
  {
    to: "statistic",
    icon: <ProjectOutlined />,
    element: Statistic,
    disabled: true,
  },
  {
    to: "configs",
    icon: <SettingOutlined />,
    element: Configs,
  },
];

const Accounting = () => {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const query = useMemo(() => queryString.parse(searchParams.toString()), [searchParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changeSearchParams = useCallback(createChangeParams(setSearchParams), [setSearchParams]);

  const view = useSelector(state => state.App.view);

  const activeKey = pathname.split("/")[2];

  const search = "";
  //  blockId ? `?blockId=${blockId}&from=${from}&to=${to}` : "";

  const isMobile = view !== "DesktopView";

  useEffect(() => {
    if (!activeKey) {
      navigate(`expense`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <AccountingWrapper>
      <CsMenu
        className="accounting-menu"
        style={{ width: isMobile ? "100%" : 170 }}
        defaultSelectedKeys={["expense"]}
        selectedKeys={activeKey}
        mode={isMobile ? "horizontal" : "inline"}
        items={_.map(routes, item => ({
          label: (
            <CsLink disabled={item.disabled} to={{ pathname: item.to, search }}>
              <IntlMessages id={item.to} />
            </CsLink>
          ),
          key: item.to,
          icon: item.icon,
          disabled: item.disabled,
        }))}
      />
      <div className="content accounting-content" style={{ minHeight: "100vh" }}>
        <Routes>
          {_.map(routes, route => {
            return (
              <Route
                key={route.to}
                path={`/${route.to}/*`}
                element={
                  route.element && (
                    <route.element
                      searchParams={searchParams}
                      query={query}
                      changeSearchParams={changeSearchParams}
                      isMobile={isMobile}
                    />
                  )
                }
              />
            );
          })}
        </Routes>
      </div>
    </AccountingWrapper>
  );
};

const CsMenu = styled(Menu)`
  @media screen and (max-width: 1200px) and (min-width: 769px) {
    .ant-menu-overflow-item {
      padding: 0px 15px !important;
    }
  }
`;

export default Accounting;
