import _ from "lodash";
import { MarkerType, Position } from "reactflow";

import { TextHeader } from "@components/utility/styles";
import { colorsEdgeColumns, styleNodeGuest, styleTableNormol } from "./styles";
import { TextTransform, styleColor } from "../../styles";
import { createNodeGroups } from "./nodesGroup";
import { normalSize, smallSize } from "./const";
import { createObjectFlow } from "../func";

export const commonStyle = (color, isSelected, onlyLine, onlyNode) => {
  return {
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color,
      width: 15,
      height: 15,
    },
    animated: isSelected ? true : false,
    style: {
      stroke: color,
      strokeWidth: 1.5,
      color: isSelected ? styleColor.textSelectedEdge : styleColor.textEdged,
      background: isSelected ? styleColor.freshAirCyan : "",
      opacity: isSelected ? 1 : 0.3,
      zIndex: isSelected ? "1001 !important" : 0,
    },
    hidden:
      !onlyLine && !onlyNode
        ? false
        : Boolean(isSelected && onlyLine) || Boolean(isSelected && onlyNode)
        ? false
        : true,
  };
};

const setPositionNode = (index, height, width) => {
  let position = 0;
  if (index < 3) {
    if (index === 0) {
      position = height / 2;
    } else if (index === 1) {
      position = height / 2 + height / 3;
    } else {
      position = height / 2 - height / 3;
    }
  } else {
    if (index === 3) {
      position = width / 2;
    } else if (index % 2 === 0) {
      position = width / 2 + 35 * Math.ceil(index / 4);
    } else {
      position = width / 2 - 35 * Math.ceil(index / 3 - 1);
    }
  }
  return position;
};

const createRightNodesAndCreateAdges = (data, indexParent, isGuest, GENERAL_SIZE) => {
  let rightNodes = [];

  data.forEach((itemC, index) => {
    const isTopNodes = index > 2 && !isGuest;
    const flowPosition = setPositionNode(index, GENERAL_SIZE.HEIGHT_NODE, GENERAL_SIZE.WIDTH_NODE);
    const topFirstEdgeGuest = GENERAL_SIZE.HEIGHT_NODE_GUEST / _.get(data, "length", 0) / 2;
    const topEdgeGuest = index * (GENERAL_SIZE.HEIGHT_NODE_GUEST / _.get(data, "length", 0)) + topFirstEdgeGuest;

    rightNodes = [
      ...rightNodes,
      {
        id: `${indexParent.objectKey}_TO_${itemC.to}`,
        position: isTopNodes ? Position.Top : Position.Right,
        style: isGuest
          ? {
              top: index === 0 ? topFirstEdgeGuest : topEdgeGuest,
            }
          : isTopNodes
          ? {
              left: flowPosition,
            }
          : {
              top: flowPosition,
            },
        type: "source",
      },
    ];

    // const newEdge = {
    //   id: itemC.line ? itemC.line.toString() : `${indexParent.objectKey}_TO_${itemC.to}`,
    //   source: indexParent.objectKey,
    //   target: itemC.to,
    //   sourceHandle: `${indexParent.objectKey}_TO_${itemC.to}`,
    //   targetHandle: `${itemC.to}_FROM_${indexParent.objectKey}`,
    //   data: {
    //     lineNumber: itemC.line,
    //     startLabel: itemC.amount === 0 ? "0" : itemC.amount,
    //     GENERAL_SIZE,
    //   },
    //   type: "customEdge",
    //   ...commonStyle(colorsEdgeColumns[indexGroup], isSeledtedDefault, onlyLine),
    // };

    // setEdges(prevState => {
    //   // Cập nhật edges mới
    //   const existingIndex = prevState.findIndex(edge => edge.id === newEdge.id);
    //   if (existingIndex !== -1) {
    //     const newState = [...prevState];
    //     newState[existingIndex] = newEdge;
    //     return newState;
    //   } else {
    //     return [...prevState, newEdge];
    //   }
    // });
  });

  return rightNodes;
};

export const nodesFc = (
  liabilities,
  data,
  dataGroups,
  totalRevenue,
  totalExpense,
  setEdges,
  selectedLine,
  selectedNode,
  onlyLine,
  onlyNode,
  setHeight,
  screenWidth
) => {
  const GENERAL_SIZE = screenWidth >= 1400 ? normalSize : smallSize;
  const { nodesGroups, widthGroup } = createNodeGroups(dataGroups, totalRevenue, totalExpense, setHeight, screenWidth);
  let nodes = [];
  if (data) {
    data.forEach((itemP, indexP) => {
      const isGuest = itemP.objectKey === "GUEST";
      let flowsFrom = []; // Initialize the "flowsFrom" array
      let flowsFromLeftIndex = 0;
      let flowsFromBottomIndex = 0;
      let position = {};
      let parentNode = undefined;

      dataGroups.forEach((itemGroup, index) => {
        const datachild =
          !_.isEmpty(itemGroup.objects) &&
          itemGroup.objects.find(child => (child.key === itemP.objectKey ? child.key : false));
        if (datachild) {
          if (itemGroup.key === "SOURCE") {
            if (datachild.index !== 0) {
              position = {
                x: 35,
                y: datachild.index * GENERAL_SIZE.POSITION_NODE_Y + GENERAL_SIZE.HEIGHT_NODE_GUEST,
              };
            } else {
              position = {
                x: 35,
                y: datachild.index * GENERAL_SIZE.POSITION_NODE_Y + GENERAL_SIZE.PADDING_FIRST_EACH_NODE_OF_GROUP,
              };
            }
          } else {
            position = {
              x: (widthGroup - GENERAL_SIZE.WIDTH_NODE) / 2,
              y:
                _.get(itemGroup, "objects.length", 0) > GENERAL_SIZE.LIMIT_AMOUNT_NODE_FOR_TOP
                  ? datachild.index * GENERAL_SIZE.POSITION_NODE_FIRST_Y + GENERAL_SIZE.PADDING_FIRST_EACH_NODE_OF_GROUP
                  : datachild.index * GENERAL_SIZE.POSITION_NODE_Y + GENERAL_SIZE.PADDING_FIRST_EACH_NODE_OF_GROUP,
            };
          }
          parentNode = _.get(itemGroup, "key");
        }
      });

      let rightNodes = createRightNodesAndCreateAdges(itemP.flows, itemP, isGuest, GENERAL_SIZE);
      let leftNodes = [];
      // Find items in dataFake where this item's objectKey matches their flows' "to" value
      data.forEach(otherItem => {
        if (otherItem.flows.some(flow => flow.to === itemP.objectKey && otherItem.objectKey !== itemP.objectKey)) {
          const isBottomNodes = flowsFromLeftIndex > 2;
          leftNodes.push({
            id: `${itemP.objectKey}_FROM_${otherItem.objectKey}`,
            position: isBottomNodes ? Position.Bottom : Position.Left,
            style: isBottomNodes
              ? { left: setPositionNode(flowsFromBottomIndex++, GENERAL_SIZE.HEIGHT_NODE, GENERAL_SIZE.WIDTH_NODE) }
              : { top: setPositionNode(flowsFromLeftIndex++, GENERAL_SIZE.HEIGHT_NODE, GENERAL_SIZE.WIDTH_NODE) },
            type: "target",
          });
          flowsFrom.push(otherItem);
        }
      });

      const objectFlow = createObjectFlow(data, selectedLine);

      const isSeledtedDefault = selectedNode
        ? _.get(itemP, "objectKey") === selectedNode
        : _.get(itemP, "objectKey") === _.get(objectFlow, "objectKey") ||
          _.get(itemP, "objectKey") === _.get(objectFlow, "to");

      nodes.push({
        id: _.get(itemP, "objectKey"),
        parentNode,
        extent: "parent",
        type: "CustomNodes",
        position,
        data: {
          label: isGuest ? (
            <TextTransform fontSize={GENERAL_SIZE.TEXT_TRANSFORM}>
              {_.get(itemP, "objectName").toUpperCase()}
            </TextTransform>
          ) : (
            <>
              <TextHeader>{_.get(itemP, "objectName")}</TextHeader>
            </>
          ),
          value: liabilities === "total" ? itemP.total : liabilities === "remaining" ? itemP.remaining : "0",
          rightNodes: rightNodes,
          leftNodes: leftNodes,
          GENERAL_SIZE,
        },
        style:
          itemP.objectKey === "GUEST"
            ? styleNodeGuest(isSeledtedDefault, GENERAL_SIZE)
            : styleTableNormol(isSeledtedDefault, GENERAL_SIZE),
      });
    });
  }
  setEdges(createEdges(data, dataGroups, selectedLine, selectedNode, onlyLine, onlyNode, screenWidth));
  return [...nodesGroups, ...nodes];
};

export const createEdges = (data, dataGroups, selectedLine, selectedNode, onlyLine, onlyNode, screenWidth) => {
  const GENERAL_SIZE = screenWidth >= 1400 ? normalSize : smallSize;
  let edges = [];
  data.forEach((itemP, indexP) => {
    let indexGroup = 0;
    dataGroups.forEach((itemG, indexG) => {
      const datachild =
        !_.isEmpty(itemG.objects) && itemG.objects.find(child => (child.key === itemP.objectKey ? child.key : false));
      if (datachild) {
        indexGroup = indexG;
      }
    });
    _.map(itemP.flows, (itemC, indexC) => {
      const isSeledtedDefault =
        itemC.line === parseInt(selectedLine) || selectedNode === itemC.to || selectedNode === itemP.objectKey;
      let positionYText = 0;
      let positionXText = 0;
      if (indexC > 2) {
        if (indexC === 3) {
          positionYText = -15;
          positionXText = 0;
        } else if (indexC % 2 === 0) {
          positionYText = 5;
          positionXText = -5;
        } else if (indexC % 2 !== 0) {
          positionYText = 5;
          positionXText = -45;
        }
      }
      const newEdge = {
        key: itemC.line ? itemC.line.toString() : `${itemP.objectKey}_TO_${itemC.to}`,
        id: itemC.line ? itemC.line.toString() : `${itemP.objectKey}_TO_${itemC.to}`,
        source: itemP.objectKey,
        target: itemC.to,
        sourceHandle: `${itemP.objectKey}_TO_${itemC.to}`,
        targetHandle: `${itemC.to}_FROM_${itemP.objectKey}`,
        data: {
          lineNumber: itemC.line,
          startLabel: itemC.amount === 0 ? "0" : itemC.amount,
          GENERAL_SIZE,
          positionYText,
          positionXText,
        },
        type: "customEdge",
        ...commonStyle(colorsEdgeColumns[indexGroup], isSeledtedDefault, onlyLine, onlyNode),
      };
      edges.push(newEdge);
    });
  });
  return edges;
};
