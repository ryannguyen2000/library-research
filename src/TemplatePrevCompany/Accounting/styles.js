import { ReportWrapper } from "@containers/Report/style";
import styled from "styled-components";
import { palette } from "styled-theme";
import { Tooltip } from "antd";

export const AccountingWrapper = styled(ReportWrapper)`
  .ant-menu-title-content,
  .ant-tabs-tab-btn {
    text-transform: uppercase;
  }

  .content {
    padding: 0;
  }
`;

export const StatusTag = styled.span`
  padding: 0 5px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  background-color: ${palette("primary", 0)};
  font-size: 13px;
  color: #ffffff;
  text-transform: capitalize;
  &.unswiped {
    background-color: ${palette("grayscale", 0)};
  }
  &.swiped {
    background-color: ${palette("success", 0)};
  }
  &.error {
    background-color: ${palette("danger", 0)};
  }
`;

export const CsTooltip = styled(Tooltip)`
  .ant-tooltip-content {
    padding: 12px;
    background-color: #fffe;
    font-size: 14px;
  }
`;
