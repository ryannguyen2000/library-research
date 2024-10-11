import styled from "styled-components";
import { palette } from "styled-theme";
import { Button, Tooltip } from "antd";

import Table from "@components/tables/table.style";
import { ReportWrapper } from "@containers/Report/style";
import { BarChart } from "recharts";

export const ReportRevenueWrapper = styled(ReportWrapper)`
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

export const CsTable = styled(Table)`
  .ant-table-tbody tr {
    &:nth-child(2n - 1) {
      background-color: transparent;
    }
  }

  .ant-table-thead > tr > th  {
    &:nth-child(n+2) {
      background-color: #cccccc;
    }
    &:first-child {
      &::before {
      height: 100% !important;
      background-color: #afafaf !important;
      width: 3px !important;
    }
    }
  }

  .first-column {
    &::before {
      position: absolute;
      top: 50%;
      right: 0;
      width: 3px;
      height: 100%;
      background-color: #afafaf !important;
      transform: translateY(-50%);
      transition: background-color 0.3s;
      content: '';
    }
  }
  
  .ant-table-row-expand-icon {
    width: 20px;
    height: 19px;
    color: ${palette("primary", 0)};
    border-color: ${palette("primary", 0)};
    margin-top: 0px;
    &::before {
      top: 8px;
      right: 4px;
      left: 4px;
      height: 1px; 
    }
    &::after {
      top: 4px;
      bottom: 4px;
      left: 9px;
      width: 1px;
    }
  }

  .ant-table-row-level-1 {

  }
`;

export const CsButtonExpanded = styled(Button)`
  &.ant-btn {
    height: 22px;
  }
`

export const WrapTooltip = styled.div`
display: flex;
flex-direction: column;
gap: 10px;
border-radius: 5px;
background-color: #fffc;
padding: 12px;
font-size: 14px;
max-height: 200px;
box-shadow: 1px 2px 2px rgba(0, 0, 0, 0.1);
`;

export const CsBarChart = styled(BarChart)`
  .recharts-cartesian-axis-line {
    display: none;
  }
`