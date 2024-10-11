import { memo } from "react";
import _ from "lodash";
import { Tabs } from "antd";
import { Link } from "react-router-dom";
import styled from "styled-components";

const ItemText = styled.div`
    width: calc(100% - 14px);
    text-wrap: initial;
    text-align: start;
    @media screen and (max-width: 1200px) {
      text-wrap: nowrap;
    }
`;

const TabRoute = memo(({ to, label, icon, disabled, isMobile }) => {
  return (
    <>
      <CsLink to={to} replace disabled={disabled}>
        <div style={{ display: 'flex', width: '100%' }}>
          <div isMobile={isMobile}>{icon}</div>
          <ItemText isMobile={isMobile}>{label}</ItemText>
        </div>
      </CsLink>
    </>
  );
});

const Menus = ({ items, activeKey, routeParent, isMobile }) => {
  return (
    <MenuWrapper>
      <CsTabs
        getPopupContainer={triggerNode => triggerNode.parentNode}
        isMobile={isMobile}
        tabPosition={isMobile ? "top" : "left"}
        activeKey={activeKey || ""}
        items={_.map(items, item => {
          const key = _.get(item, "key", "");
          return {
            ...item,
            label: (
              <TabRoute
                disabled={_.get(item, "disabled", false)}
                to={routeParent !== undefined ? `${routeParent}/${key}` : key}
                label={item.label}
                icon={_.get(item, "icon")}
                isMobile={isMobile}
              />
            ),
            icon: _.get(item, "icon")
          };
        })}
      />
    </MenuWrapper>
  );
};

const MenuWrapper = styled.div`
  background-color: #ffffff;
  overflow: hidden;

  @media (min-width: 1200px) {
    width: 170px;
  }
  .ant-tabs {
    width: 100%;
  }
  .ant-tabs-nav {
    width: 100%;
  }
  .ant-tabs-tab {
    width: 100%;
  }
`;

const CsTabs = styled(Tabs)`
  .ant-tabs-nav-list {
    gap: 5px;
  }
  .ant-tabs-tab {
    margin: 0 !important;
    min-height: 40px;
    padding: 0 !important;

    .ant-tabs-tab-btn {
      width: 100%;
      height: 100%;
    }

    a {
      display: flex;
      font-size: 12px;
      padding: 10px 5px;
      height: 100%;
      justify-content: flex-start;
      align-items: center;

      &:first-child {
        padding-left: ${props => props.isMobile ? "10px" : "5px"};
      }
      &:last-child {
        padding-right: ${props => props.isMobile ? "10px" : "5px"};
      }

      &:hover {
        color: ${props => !props.isMobile ? "#ffffff" : "rgba(0,0,0,0.7)"};
        background-color: ${props => !props.isMobile ? "#004e75" : "transparent"} !important;
      }
      .link-icon {
        width: 15px;
        margin-right: 6px;
      }
    }
  }
  .ant-tabs-tab-active {
    a {
      color: ${props => !props.isMobile ? "#ffffff" : "rgba(0,0,0,0.7)"};
      background-color: ${props => !props.isMobile ? "#004e75" : "transparent"} !important;
    }
  }
  .ant-tabs-nav {
    margin-bottom: 0 !important;
  }
  .ant-tabs-content-holder {
    display: none;
  }
`;

export const CsLink = styled(Link)`
  pointer-events: ${props => (props.disabled ? "none" : "")};
  color: ${props => (props.disabled ? "rgba(0, 0, 0, 0.25)" : "rgba(0, 0, 0, 0.7)")};

  display: flex;
  flex-direction: row; /* Changed to row to align icon and text horizontally */
  align-items: flex-start; /* Align items at the top */
  padding: 0; /* Remove default padding if necessary */
  text-decoration: none; /* Remove underline if desired */
  
  a {
    display: flex;
      flex-direction: column;
  }
  &:hover {
    background-color: transparent !important;
  }
  .menu-icon {
    .anticon {
      align-self: center;
    }
  }
`;

export default Menus;
