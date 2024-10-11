import { Tabs } from "antd";
import styled from "styled-components";

const TabWrapper = styled.div`
  .ant-tabs-nav {
    margin: 0px !important;
  }
  .ant-tabs-small > .ant-tabs-nav .ant-tabs-tab {
    font-size: 12px;
    padding: 0px !important;
  }
`;

const TabsRoute = ({ items, tabBarExtraContent = [], onChange, activeKey }) => {
  return (
    <TabWrapper>
      <Tabs
        items={items}
        onChange={onChange}
        tabBarExtraContent={tabBarExtraContent}
        activeKey={activeKey}
        size="small"
      />
    </TabWrapper>
  );
};

export default TabsRoute;
