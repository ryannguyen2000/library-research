import styled from "styled-components";

export const Box = styled.div`
  position: ${(props) => (props.position ? props.position : "")};
  width: ${(props) => (props.width ? props.width : "100%")};
  max-width: ${(props) => (props.maxWidth ? props.maxWidth : "")};
  min-width: ${(props) => (props.minWidth ? props.minWidth : "")};
  flex: ${(props) => (props.flex ? props.flex : "")};
  height: ${(props) => (props.height ? props.height : "auto")};
  max-height: ${(props) => (props.maxHeight ? props.maxHeight : "auto")};
  min-height: ${(props) => (props.minHeight ? props.minHeight : "auto")};
  display: ${(props) => (props.flex || props.flexColumn ? "flex" : "")};
  flex-direction: ${(props) => (props.flexColumn ? "column" : "")};
  background-color: ${(props) => (props.bg ? `${props.bg}` : "")};
  gap: ${(props) => (props.gap ? `${props.gap}px` : "")};
  padding: ${(props) => (props.p ? `${props.p}` : "")};
  padding-left: ${(props) => (props.pl ? `${props.pl}px` : "")};
  padding-right: ${(props) => (props.pr ? `${props.pr}px` : "")};
  padding-bottom: ${(props) => (props.pb ? `${props.pb}px` : "")};
  padding-top: ${(props) => (props.pt ? `${props.pt}px` : "")};
  margin: ${(props) => (props.m ? `${props.m}px` : "")};
  margin-bottom: ${(props) => (props.mb ? `${props.mb}px` : "")};
  margin-top: ${(props) => (props.mt ? `${props.mt}px` : "")};
  margin-left: ${(props) => (props.ml ? `${props.ml}px` : "")};
  margin-right: ${(props) => (props.mr ? `${props.mr}px` : "")};
  align-items: ${(props) =>
    props.center ? "center" : props.alignItem ? props.alignItem : ""};
  justify-content: ${(props) =>
    props.center ? "center" : props.justify ? props.justify : ""};
  border: ${(props) => (props.border ? props.border : "")};
  border-left: ${(props) => (props.border_l ? props.border_l : "")};
  border-right: ${(props) => (props.border_r ? props.border_r : "")};
  border-top: ${(props) => (props.border_t ? props.border_t : "")};
  border-bottom: ${(props) => (props.border_b ? props.border_b : "")};
  border-radius: ${(props) =>
    props.borderRadius ? `${props.borderRadius}px` : ""};
  color: ${(props) => (props.color ? props.color : "#000")};
  font-weight: ${(props) => (props.fontWeight ? props.fontWeight : "")};
  letter-spacing: ${(props) =>
    props.letterSpacing ? props.letterSpacing : ""};
  font-size: ${(props) => (props.fontSize ? props.fontSize : "")};
  z-index: ${(props) => (props.zIndex ? `${props.zIndex}` : "")};
  overflow: ${(props) => (props.overflow ? props.overflow : "")};
  overflow-x: ${(props) =>
    props.overflowX ? `${props.overflowX} !important` : ""};
  overflow-y: ${(props) =>
    props.overflowY ? `${props.overflowY} !important` : ""};
  @media (992px <= width < 1200px) {
    display: ${(props) => (props["flex-lg"] ? "flex" : "")};
    justify-content: ${(props) =>
      props["center-lg"]
        ? "center"
        : props["justify-lg"]
        ? props["justify-lg"]
        : ""};
  }
  .ant-checkbox-wrapper {
    align-self: center;
  }
  &.ellipsis {
    white-space: nowrap;
    overflow: hidden;
    -o-text-overflow: ellipsis;
    text-overflow: ellipsis;
  }

  &.scrollbar::-webkit-scrollbar {
    width: 10px;
  }

  &.scrollbar::-webkit-scrollbar-track {
    border-radius: 8px;
    background-color: #e7e7e7;
    border: 1px solid #cacaca;
    box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
  }

  &.scrollbar::-webkit-scrollbar-thumb {
    border-radius: 8px;
    background-color: rgb(11, 171, 193);
  }
`;
