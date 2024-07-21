import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import { useState } from "react";
import ToolFilter from "./tool/toolFilter";
import "@xyflow/react/dist/style.css";
import { initialStyle } from "./const";

const edges = [
  { id: "1-2", source: "1", target: "2", label: "to the", type: "step" },
];

const nodes = [
  {
    id: "1",
    data: { label: "Hello" },
    position: { x: 200, y: 200 },
    type: "input",
  },
  {
    id: "2",
    data: { label: "World" },
    position: { x: 400, y: 400 },
  },
];

// const nodeTypes = { textUpdater: TextUpdaterNode };

// const { nodes: initialNodes, edges: initialEdges } = createNodesAndEdges(
//   15,
//   30
// );

const ReactFlowContain = () => {
  // const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  // const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [state, setState] = useState({
    nodesDraggable: false,
    zoomOnScroll: false,
    zoomOnDoubleClick: false,
    panOnDrag: false,
    onNodeDragStop: false,
    selectNodesOnDrag: false,
    preventScrolling: false,
  });

  const onChangeState = (key) => (value) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ height: "50rem" }}>
      <ToolFilter onChangeState={onChangeState} />
      <ReactFlow
        draggable={state.draggable}
        nodesDraggable={state.nodesDraggable}
        zoomOnScroll={state.zoomOnScroll}
        zoomOnDoubleClick={state.zoomOnDoubleClick}
        panOnDrag={state.panOnDrag}
        onNodeDragStop={state.onNodeDragStop}
        selectNodesOnDrag={state.selectNodesOnDrag}
        preventScrolling={state.preventScrolling}
        // nodeTypes={nodeTypes}
        minZoom={0}
        onNodesChange={{}}
        style={initialStyle}
        nodes={nodes}
        edges={edges}
      >
        <MiniMap />
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default ReactFlowContain;
