import { EdgeLabelRenderer, BaseEdge, getSmoothStepPath } from "reactflow";
import _ from "lodash";
import { formatter } from "@helpers/utility";
import { TextNumber } from "@components/utility/styles";
import { styleColor } from "../../styles";

function EdgeLabel({ transform, lineNumber, label, style, selected }) {
  return (
    <div
      style={{
        position: "absolute",
        background: `${_.get(style, "background")}`,
        borderRadius: 3,
        border: `${_.get(style, "border")}`,
        color: _.get(style, "color"),
        fontSize: 12,
        fontWeight: 600,
        transform,
        display: "flex",
        alignItems: "center",
        justifyContent: "start",
        // width: 110,
        gap: 5,
        pointerEvents: "all",
        cursor: "pointer",
        lineHeight: "20px",
      }}
      className="nodrag nopan"
    >
      <TextNumber fontSize={14} color={styleColor.lineNumber}>
        {lineNumber}
      </TextNumber>
      <TextNumber fontSize={12} color={_.get(style, "color")}>
        {formatter(label)}
      </TextNumber>
    </div>
  );
}

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
  selected,
}) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { lineNumber, startLabel, endLabel, GENERAL_SIZE, positionYText, positionXText } = data;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style} // Apply custom edge color
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        {startLabel && (
          <EdgeLabel
            transform={`translate(-50%, 0%) translate(${sourceX + GENERAL_SIZE.SOURCE_X_EDGE + positionXText}px,${
              sourceY - GENERAL_SIZE.SOURCE_Y_EDGE + positionYText
            }px)`}
            lineNumber={lineNumber}
            label={startLabel}
            style={style}
            selected={selected}
          />
        )}
        {endLabel && (
          <EdgeLabel transform={`translate(-50%, -100%) translate(${targetX}px,${targetY}px)`} label={endLabel} />
        )}
      </EdgeLabelRenderer>
    </>
  );
};

// Inherit from the smoothstep edge type
CustomEdge.inherits = "step";

export default CustomEdge;
