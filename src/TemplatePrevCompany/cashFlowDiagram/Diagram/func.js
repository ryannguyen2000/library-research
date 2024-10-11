import _ from "lodash";

const { styleColor } = require("../styles");

export const styleNodeSelected = node => {
  return {
    ...node,
    style: {
      ...node.style,
      color: "white",
      background: "#18b4c9",
    },
  };
};

export const styleNodeNoSelected = node => {
  return {
    ...node,
    style: {
      ...node.style,
      color: "black",
      background: "white",
    },
  };
};

export const styleEdgeSeleted = edge => {
  return {
    ...edge,
    animated: true,
    hidden: false,
    style: {
      ...edge.style,
      color: styleColor.textSelectedEdge,
      background: styleColor.freshAirCyan,
      border: "1px solid #96d4e7",
      opacity: 1,
      zIndex: "1001 !important",
    },
  };
};

export const styleEdgeNoSeleted = edge => {
  return {
    ...edge,
    animated: false,
    hidden: false,
    style: {
      ...edge.style,
      color: styleColor.textEdged,
      background: "",
      border: "",
      opacity: 0.3,
      zIndex: 0,
    },
  };
};

export const styleHiddenEdge = edge => {
  return {
    ...edge,
    animated: false,
    hidden: true,
    style: {
      ...edge.style,
      color: styleColor.textEdged,
      background: "",
      border: "",
      opacity: 0.3,
      zIndex: 0,
    },
  };
};

export const resetEdgesAndNodes = (
  nodes,
  edges,
  setNodes,
  setEdges,
  dispatch,
  cashFlowActions,
  changeParams,
  query,
  type
) => {
  let resetEdges = [];
  let resetNodes = [];
  edges.forEach(edge => {
    if (edge.type === "customEdge") {
      resetEdges.push({
        ...edge,
        animated: false,
        style: {
          ...edge.style,
          color: styleColor.textEdged,
          background: "",
          border: "",
          opacity: 0.3,
          zIndex: 0,
        },
      });
    } else {
      resetEdges.push(edge);
    }
  });
  nodes.forEach(node => {
    if (node.type === "CustomNodes") {
      resetNodes.push({
        ...node,
        style: {
          ...node.style,
          color: "black",
          background: "white",
        },
      });
    } else {
      resetNodes.push(node);
    }
  });
  setNodes(resetNodes);
  setEdges(resetEdges);
  dispatch(
    cashFlowActions.selectNodeFlow({
      flow: null,
      node: null,
      typeFlow: null,
      typeNode: null,
    })
  );
  if (query.onlyNode) {
    const isType = type === "CustomNodes";
    console.log("CustomNodes type", isType);
    if (type === "CustomNodes") {
      console.log("CustomNodes");
      changeParams({
        ...query,
        typeFlow: undefined,
        typeNode: "CustomNodes",
        flow: undefined,
        node: undefined,
      });
    } else {
      changeParams({
        ...query,
        flow: undefined,
        typeFlow: undefined,
      });
    }
  } else {
    changeParams({
      ...query,
      typeFlow: type === "customEdge" ? query.typeFlow : undefined,
      typeNode: type === "CustomNodes" ? query.typeNode : undefined,
      flow: undefined,
      node: undefined,
    });
  }
};

export const createObjectFlow = (data, valueId) => {
  let foundParent = null;
  let foundChild = null;
  let obecjtFlow = {};

  _.forEach(data, parent => {
    const childIndex = _.findIndex(parent.flows, { line: parseInt(valueId) });
    if (childIndex !== -1) {
      foundParent = parent;
      foundChild = parent.flows[childIndex];
      obecjtFlow = {
        objectKey: foundParent.objectKey,
        ...foundChild,
      };
      return false;
    }
  });
  return obecjtFlow;
};

export const createPositionNode = (index, plusY) => {
  const position = {
    x: 100,
    y: index * 160 + plusY,
  };
  return position;
};
