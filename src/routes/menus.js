import { memo } from "react";
import { Tabs } from "antd";
import { Link } from "react-router-dom";
import styled from "styled-components";
import _ from "lodash";

const TabRoute = memo(({ to, label, disabled }) => {
  return (
    <>
      <CsLink to={to} replace disabled={disabled}>
        {label}
      </CsLink>
    </>
  );
});

const Menus = ({ items, activeKey, routeParent, ...props }) => {
  return (
    <MenuWrapper>
      <CsTabs
        activeKey={activeKey || ""}
        items={_.map(items, (item) => {
          const key = _.get(item, "key", "");

          return {
            ...item,
            label: (
              <TabRoute
                disabled={_.get(item, "disabled", false)}
                to={routeParent ? `${routeParent}/${key}` : key}
                label={item.label}
              />
            ),
          };
        })}
      />
    </MenuWrapper>
  );
};

const MenuWrapper = styled.div`
  padding: 10px 15px 0 15px;
`;

const CsTabs = styled(Tabs)`
  .ant-tabs-tab {
    padding: 0px !important;
    a {
      display: block;
      font-size: 12px;
    }
  }
  .ant-tabs-tab-active {
    a {
      color: #18b4c9 !important;
    }
  }
  .ant-tabs-nav {
    margin-bottom: 0 !important;
  }
`;

export const CsLink = styled(Link)`
  pointer-events: ${(props) => (props.disabled ? "none" : "")};
  color: ${(props) =>
    props.disabled ? "rgba(0, 0, 0, 0.25)" : "rgba(0, 0, 0, 0.7)"};
`;

export default Menus;
