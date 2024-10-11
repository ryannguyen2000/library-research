import styled from "styled-components";
import { Box } from "@components/utility/styles";

export const WrapDiagram = styled(Box)`
  flex-direction: column;
  display: flex;
  flex-grow: 1;
  height: 100%;

  .react-flow {
    overflow-x: auto !important;
  }

  .react-flow__handle {
    width: 1px;
    height: 1px;
    background-color: #bbb;
  }

  .react-flow__node-custom {
    background: #fff;
    border: 1px solid #1a192b;
    border-radius: 3px;
    color: #222;
    font-size: 12px;
    padding: 10px;
    text-align: center;
    width: 150px;
  }

  .react-flow__panel > a {
    visibility: hidden !important;
  }
`;

// It needs to be modified
export const TextTransform = styled.p`
  position: absolute;
  transform: rotate(-90deg);
  top: 25%;
  left: -50%;
  width: 200%;
  height: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  font-size: ${props => (props.fontSize ? `${props.fontSize}px` : "")} !important;
`;

export const styleColor = {
  lineNumber: "#e600ff",
  textEdged: "#ff8c00",
  colorEdge: "#0000ff",
  textSelectedEdge: "#ff4500",
  freshAirCyan: "#a6e7ff",
};
