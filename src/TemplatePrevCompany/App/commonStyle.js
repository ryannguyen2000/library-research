import styled from "styled-components";
import { palette } from "styled-theme";

const AppHolder = styled.div`
  -webkit-overflow-scrolling: touch;
  .ant-layout {
    background: ${palette("secondary", 1)};
    &.cz-main-layout {
      width: 100%;
      @media only screen and (max-width: 767px) {
        flex-shrink: 0;
      }
    }
  }
  .cz-content {
    min-height: 120px;
    flex-shrink: 0;
    background: #f3f3f3;
    position: relative;
    & > div {
      @media screen and (max-width: 1200px) and (min-width: 769px) {
        flex-wrap: wrap;
        .ant-menu-overflow-item {
          padding: 0px 15px !important;
        }
        .accounting-content {
          width: 100% !important;
        }
      }
    }
  }
`;

export default AppHolder;
