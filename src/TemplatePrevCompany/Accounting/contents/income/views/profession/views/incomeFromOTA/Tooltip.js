import styled from "styled-components";
import { Tooltip } from "antd";

const CsTooltip = ({ children, title }) => {
  return (
    <Custom title={title} getPopupContainer={triggerNode => triggerNode}>
      <Children>{children}</Children>
    </Custom>
  );
};

const Children = styled.div`
  max-width: 200px;
  position: relative;
  display: inline;
  > * {
    position: relative;
    display: inline;
  }
`;

const Custom = styled(Tooltip)`
  .ant-tooltip-inner {
    padding: 10px 15px;
    background: white;
    top: 0;
    display: inline-block;
    border-radius: 10px;
    border-bottom-right-radius: 0px;
    z-index: 2;
    color: black;
    word-wrap: break-word;
  }
`;

export default CsTooltip;
