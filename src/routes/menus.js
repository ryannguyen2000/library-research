import { memo } from "react";
import { Tabs } from "antd";
import { Link } from "react-router-dom";
import styled from "styled-components";
import _ from "lodash";
import { DiFirefox } from "react-icons/di";
import { FaAccessibleIcon } from "react-icons/fa";
import { FaBattleNet } from "react-icons/fa";
import { FaAppleAlt } from "react-icons/fa";
import { BsDiagram2Fill } from "react-icons/bs";

const items = [
  {
    key: "/",
    label: "Home",
    icon: <DiFirefox />,
  },
  {
    key: "/ant-design",
    label: "Ant Design",
    icon: <FaAccessibleIcon />,
  },
  {
    key: "/material",
    label: "Material UI",
    icon: <FaBattleNet />,
  },
  {
    key: "/tailwind",
    label: "Tailwind UI",
    icon: <FaAppleAlt />,
  },
  {
    key: "/react-flow",
    label: "React Flow",
    icon: <BsDiagram2Fill />,
  },
];

const itemsRightMenu = [
  {
    key: "/sign-in",
    label: "Sign In",
    icon: <DiFirefox />,
  },
  {
    key: "/sign-up",
    label: "Sign Up",
    icon: <DiFirefox />,
  },
  {
    key: "/account-info",
    label: "Account",
    icon: <DiFirefox />,
  },
];

const TabRoute = memo(({ to, label, disabled, icon }) => {
  return (
    <>
      <CsLink to={to} replace disabled={disabled}>
        {label}
      </CsLink>
    </>
  );
});

const Menus = ({ activeKey, routeParent, ...props }) => {
  return (
    <>
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
                  icon={_.get(item, "icon")}
                />
              ),
            };
          })}
        />
      </MenuWrapper>
    </>
  );
};

const MenusRight = ({ activeKey, routeParent, ...props }) => {
  return (
    <>
      <MenuWrapper>
        <CsTabs
          activeKey={activeKey || ""}
          items={_.map(itemsRightMenu, (item) => {
            const key = _.get(item, "key", "");
            return {
              ...item,
              label: (
                <TabRoute
                  disabled={_.get(item, "disabled", false)}
                  to={routeParent ? `${routeParent}/${key}` : key}
                  label={item.label}
                  icon={_.get(item, "icon")}
                />
              ),
            };
          })}
        />
      </MenuWrapper>
    </>
  );
};

const MenuWrapper = styled.div`
  padding: 10px 15px 0 15px;
  align-self: center;
`;

const CsTabs = styled(Tabs)`
  .ant-tabs-tab {
    padding: 0px !important;
    a {
      display: block;
      font-size: 12px;
    }
    .ant-tabs-tab-btn {
      display: flex;
      align-items: center;
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

export { Menus, MenusRight };
