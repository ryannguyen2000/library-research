import queryString from "query-string";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { Link, useSearchParams } from "react-router-dom";
import { memo, useCallback, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import _ from "lodash"

import IntlMessages from "@components/utility/intlMessages";
import { createChangeParams } from "@helpers/func";

import { CsMenu, ReportRevenueWrapper } from "./styles";
import { parentRoutes } from "./const";
import styled from "styled-components"

export const CUSTOM_PREFIX = "custom-menu";

const ReportRevenue = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const activeKeyParent = pathname.split("/")[2];

  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => queryString.parse(searchParams.toString()), [searchParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changeSearchParams = useCallback(createChangeParams(setSearchParams), [setSearchParams]);

  const view = useSelector(state => state.App.view);

  const isMobile = view !== "DesktopView";

  const ButtonMenu = styled(Link)`
    pointer-events: ${props => (props.disabled ? "none" : "")};
    cursor: ${props => props.disabled ? "not-allowed" : "pointer"};;
  `

  useEffect(() => {
    if (!activeKeyParent) {
      navigate(`${activeKeyParent || "finalcials"}`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKeyParent])

  const parentMenuItems = useMemo(() =>
    parentRoutes(isMobile).map(item => ({
      label: <ButtonMenu disabled={item.disabled} isMobile={isMobile} to={{ pathname: item.to }}>
        <IntlMessages id={item.to} />
      </ButtonMenu>,
      key: item.to,
      icon: item.icon,
      disabled: item.disabled,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })), [parentRoutes]
  );

  return (
    <>
      <ReportRevenueWrapper>
        <CsMenu
          getPopupContainer={triggerNode => triggerNode.parentNode}
          key="report-revenue-menu"
          className="report-revenue-menu"
          isMobile={isMobile}
          style={{ width: "100%", }}
          selectedKeys={activeKeyParent}
          mode="horizontal"
          items={parentMenuItems}
        />
        <Routes>
          {_.map(parentRoutes(isMobile), route => {
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
                      search={search}
                      navigate={navigate}
                    />
                  )
                }
              />
            );
          })}
        </Routes>
      </ReportRevenueWrapper>
    </>
  )
};

export default memo(ReportRevenue);

