import { memo, useEffect, useState } from "react";
import ReactFlow, { useEdgesState, useNodesState } from "reactflow";
import _ from "lodash";
import { Empty } from "antd";
import "reactflow/dist/style.css";
import { useDispatch, useSelector } from "react-redux";

import cashFlowActions from "@redux/cashFlow/actions";
import { Box } from "@components/utility/styles";
import { CustomManyNodeRight, CustomNodeFourSide, CustomGroup, CustomNodes } from "./components/CustomNode";
import CustomEdge from "./components/CustomEdgeStartEnd";
import { nodesFc } from "./nodes";
import { WrapDiagram } from "../styles";
import {
  createObjectFlow,
  resetEdgesAndNodes,
  styleEdgeNoSeleted,
  styleEdgeSeleted,
  styleHiddenEdge,
  styleNodeNoSelected,
  styleNodeSelected,
} from "./func";
import useScreenSize from "../hooks/useWindowSize";

const nodeTypes = {
  CustomGroup,
  customManyRight: CustomManyNodeRight,
  CustomNodeFourSide,
  CustomNodes,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

function Diagram({ changeParams, query, data, dataGroups, totalRevenue, totalExpense }) {
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [height, setHeight] = useState(0);

  const { screenWidth } = useScreenSize();

  const dispatch = useDispatch();
  const { selected: selectedRedux } = useSelector(state => state.CashFlow.cashFlow);

  useEffect(() => {
    if (query.diagramType && data && dataGroups && query.viewType && screenWidth) {
      setNodes(
        nodesFc(
          query.viewType,
          data,
          dataGroups,
          totalRevenue,
          totalExpense,
          setEdges,
          _.get(query, "flow"),
          _.get(query, "node"),
          _.get(query, "onlyLine"),
          _.get(query, "onlyNode"),
          setHeight,
          screenWidth
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dataGroups, query.viewType, screenWidth]);

  useEffect(() => {
    // if (query.flow && query.typeSelected && !_.isEmpty(edges) && isInitialLoad) {
    if (query.flow && query.typeFlow && !_.isEmpty(edges) && isInitialLoad) {
      dispatch(
        cashFlowActions.selectNodeFlow({
          flow: query.flow,
          typeFlow: query.typeFlow,
        })
      );
      setIsInitialLoad(false);
    } else if (query.node && query.typeNode && !_.isEmpty(edges) && isInitialLoad) {
      dispatch(
        cashFlowActions.selectNodeFlow({
          node: query.node,
          typeNode: query.typeNode,
        })
      );
      setIsInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, edges, isInitialLoad]);

  if (_.isEmpty(data) || _.isEmpty(dataGroups)) {
    return <Empty />;
  }

  return (
    screenWidth && (
      <Box height={`${height}px`} maxWidth={1400} width={`${screenWidth - 32}px`}>
        <WrapDiagram flex center>
          <RenderReactFlow
            data={data}
            edges={edges}
            nodes={nodes}
            changeParams={changeParams}
            dispatch={dispatch}
            query={query}
            selectedRedux={selectedRedux}
            setEdges={setEdges}
            setNodes={setNodes}
          />
        </WrapDiagram>
      </Box>
    )
  );
}

function RenderReactFlow({ data, edges, nodes, setNodes, changeParams, query, selectedRedux, dispatch }) {
  const [edgesUpdate, setEdgesUpdate] = useEdgesState(edges);
  const [edgesForNodeOnly, setEdgesForNodeOnly] = useState(edges);

  // keyForReactFlow use re-render when change edgesUpdate
  const [keyForReactFlow, setKeyForReactFlow] = useState(0);

  const updateHiglLighted = (id, type) => {
    const isNotCustomGroup = type !== "CustomGroup";
    const isExisted = (selectedRedux.flow && selectedRedux.flow.toString() === id) || selectedRedux.node === id || !id;
    if (isExisted) {
      resetEdgesAndNodes(
        nodes,
        edgesUpdate,
        setNodes,
        setEdgesUpdate,
        dispatch,
        cashFlowActions,
        changeParams,
        query,
        type
      );
    } else if (!isExisted && isNotCustomGroup) {
      if (type === "CustomNodes") {
        dispatch(
          cashFlowActions.selectNodeFlow({
            node: id,
            typeNode: type,
            typeFlow: undefined,
          })
        );
      } else if (type === "customEdge") {
        dispatch(
          cashFlowActions.selectNodeFlow({
            flow: id,
            typeFlow: type,
          })
        );
      }
      updateParamsFlow({ id, type });
    }
  };

  const createEdgesForNodeOnlyFirstLoad = ({ id, selectedLine, onlyNode, onlyLine }) => {
    if (keyForReactFlow === 0) {
      let newEdges = [];
      let newEdgesForNodeOnly = [];
      edgesUpdate.forEach(edge => {
        const isEdge = edge.source === id || edge.target === id;
        const isSelectedLine = edge.id === selectedLine;
        if (isEdge) {
          if (isSelectedLine) {
            newEdges.push(styleEdgeSeleted(edge));
            newEdgesForNodeOnly.push(styleEdgeSeleted(edge));
          } else {
            if (onlyLine) {
              newEdges.push(styleHiddenEdge(edge));
              newEdgesForNodeOnly.push(styleHiddenEdge(edge));
            } else {
              newEdges.push(styleEdgeNoSeleted(edge));
              newEdgesForNodeOnly.push(styleEdgeNoSeleted(edge));
            }
          }
        } else {
          if (onlyNode) {
            newEdges.push(styleHiddenEdge(edge));
          } else {
            newEdges.push(styleEdgeNoSeleted(edge));
          }
        }
      });
      setEdgesForNodeOnly(newEdges);
    }
  };

  const updateEdges = ({ valueId, onlyLine }) => {
    let newEdges = [];
    const objectFlow = createObjectFlow(data, valueId);

    const callUpdateNodeSelected = node =>
      updateNodeSelected({
        id: valueId,
        type: "CustomNodes",
        ojFlow: objectFlow,
        onlyNode: _.get(query, "onlyNode"),
        nodePamams: _.get(query, "node"),
      });

    if (!query.onlyNode || !query.node) {
      edgesUpdate.forEach(edge => {
        const isSelected = edge.id === valueId;
        if (isSelected) {
          newEdges.push(styleEdgeSeleted(edge));
        } else {
          if (onlyLine) {
            newEdges.push(styleHiddenEdge(edge));
            callUpdateNodeSelected();
          } else {
            newEdges.push(styleEdgeNoSeleted(edge));
            callUpdateNodeSelected();
          }
        }
      });
    } else {
      if (keyForReactFlow !== 0) {
        edgesForNodeOnly.forEach(edge => {
          const isSelected = edge.id === valueId;
          if (isSelected) {
            callUpdateNodeSelected(_.get(query, "node"));
            newEdges.push(styleEdgeSeleted(edge));
          } else {
            if (onlyLine && valueId) {
              newEdges.push(styleHiddenEdge(edge));
              callUpdateNodeSelected(_.get(query, "node"));
            } else {
              newEdges.push(styleEdgeNoSeleted(edge));
              callUpdateNodeSelected(_.get(query, "node"));
            }
          }
        });
      }
    }
    if (query.onlyNode && query.node && keyForReactFlow !== 0) {
      setEdgesForNodeOnly(newEdges);
    } else if (!query.onlyNode && !query.node && keyForReactFlow !== 0) {
      setEdgesUpdate(newEdges);
      setEdgesForNodeOnly(newEdges);
    } else if (keyForReactFlow !== 0) {
      setEdgesForNodeOnly(newEdges);
    }
  };

  const updateNodeSelected = ({ id, type, ojFlow, onlyNode, nodePamams }) => {
    const isTypeCustomNodes = type === "CustomNodes";
    if (isTypeCustomNodes) {
      let newNodes = [];
      let newEdges = [];
      let newEdgesForNodeOnly = [];
      nodes.forEach(node => {
        const isSelected = !_.isEmpty(ojFlow) ? node.id === ojFlow.objectKey || node.id === ojFlow.to : node.id === id;
        const isType = node.type === "CustomNodes";
        if (isType) {
          if (isSelected) {
            newNodes.push(styleNodeSelected(node));
            if (_.isEmpty(ojFlow) || !ojFlow) {
              updateEdges({ onlyLine: false, valueId: null });
            }
          } else {
            newNodes.push(styleNodeNoSelected(node));
          }
        } else {
          newNodes.push(node);
        }
      });
      edgesUpdate.forEach(edge => {
        const isEdge = edge.source === id || edge.target === id;
        if (isEdge) {
          newEdges.push(styleEdgeSeleted(edge));
          newEdgesForNodeOnly.push(styleEdgeSeleted(edge));
        } else {
          if (onlyNode) {
            newEdges.push(styleHiddenEdge(edge));
          } else {
            newEdges.push(styleEdgeNoSeleted(edge));
          }
        }
      });
      setNodes(newNodes);
      setEdgesUpdate(newEdges);
      if (onlyNode && id) {
        setEdgesForNodeOnly(newEdgesForNodeOnly);
      } else if (!onlyNode && id) {
        setEdgesForNodeOnly(newEdges);
      }
    }
  };

  const updateParamsFlow = ({ id, type }) => {
    const isExistedFlow = selectedRedux.flow === id || selectedRedux.node === id;
    if (isExistedFlow) {
      changeParams({
        ...query,
        flow: undefined,
        node: undefined,
        typeNode: undefined,
        typeFlow: undefined,
        groupValue: undefined,
        page: 1,
      });
    } else {
      if (type !== "CustomGroup") {
        if (type === "customEdge") {
          changeParams({
            ...query,
            node: _.get(query, "onlyNode") ? _.get(query, "node") : undefined,
            flow: id,
            typeFlow: type,
            groupValue: undefined,
            page: 1,
          });
        }
        if (type === "CustomNodes") {
          changeParams({
            ...query,
            node: id,
            typeNode: type,
            flow: undefined,
            typeFlow: undefined,
            groupValue: undefined,
            page: 1,
          });
        }
      }
    }
  };

  useEffect(() => {
    setEdgesUpdate(edges);
    setEdgesForNodeOnly(edges);
    setKeyForReactFlow(prevKey => prevKey + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, selectedRedux.listFlowForOnlyNode]);

  useEffect(() => {
    if (query.flow || query.node) {
      if (query.typeNode === "CustomNodes" && !query.typeFlow) {
        // Higlight seleted node && has onlyNode => hidden remaining nodes
        updateNodeSelected({
          id: query.node,
          type: query.typeNode,
          ojFlow: {},
          onlyNode: _.get(query, "onlyNode"),
          nodePamams: _.get(query, "node"),
        });
      } else if (query.typeFlow === "customEdge") {
        if (query.onlyLine) {
          // Higlight seleted flow && hidden remaining flows
          createEdgesForNodeOnlyFirstLoad({
            id: query.node,
            selectedLine: _.get(query, "flow"),
            onlyNode: _.get(query, "onlyNode"),
            onlyLine: _.get(query, "onlyLine"),
          });
          updateEdges({ valueId: query.flow, onlyLine: true });
        } else {
          // Higlight seleted flow
          createEdgesForNodeOnlyFirstLoad({
            id: query.node,
            selectedLine: _.get(query, "flow"),
            onlyNode: _.get(query, "onlyNode"),
            onlyLine: _.get(query, "onlyLine"),
          });
          updateEdges({ valueId: query.flow, onlyLine: false });
        }
      }
    } else if ((!query.flow || !query.node) && (query.typeFlow || query.typeNode) && !_.isEmpty(edgesUpdate)) {
      updateEdges({ valueId: query.flow, onlyLine: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.flow, query.node, query.onlyLine, query.onlyNode]);

  return (
    <ReactFlow
      draggable={false}
      nodes={nodes}
      nodeTypes={nodeTypes}
      edges={edgesForNodeOnly}
      edgeTypes={edgeTypes}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      panOnDrag={false}
      onNodeDragStop={false}
      onNodeClick={(e, node) => {
        updateHiglLighted(node.id, node.type);
      }}
      onEdgesChange={e => {
        const isIdSelected = _.filter(e, { selected: true }).map(item => item.id);
        updateHiglLighted(_.get(isIdSelected, "[0]"), "customEdge");
      }}
      nodesDraggable={false}
      selectNodesOnDrag={false}
      preventScrolling={false}
      key={`RenderReactFlow-${keyForReactFlow}`}
    />
  );
}

export default memo(Diagram);
