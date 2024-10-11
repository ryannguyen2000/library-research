import { memo } from "react";
import { Handle, Position } from "reactflow";
import _ from "lodash";

import { Box, TextHeader, TextNumber } from "@components/utility/styles";
import { formatter } from "@helpers/utility";

const handleStyle = value => {
  return {
    top: _.get(value, "top"),
    right: _.get(value, "right"),
    bottom: _.get(value, "bottom"),
    left: _.get(value, "left"),
    border: "none",
    background: "transparent",
  };
};

export const CustomManyNodeRight = memo(({ data }) => {
  return (
    <>
      <Box flex center>
        {data.label}
      </Box>
      <Handle style={handleStyle()} type="source" position={Position.Top} id="top" />
      <Handle style={handleStyle({ top: 45 })} type="source" position={Position.Right} id="r1" />
      <Handle style={handleStyle({ top: 108 })} type="source" position={Position.Right} id="r2" />
      <Handle style={handleStyle({ top: 150 })} type="source" position={Position.Right} id="r3" />
      <Handle style={handleStyle({ top: 218 })} type="source" position={Position.Right} id="r4" />
      <Handle style={handleStyle({ top: 280 })} type="source" position={Position.Right} id="r5" />
      <Handle style={handleStyle({ top: 348 })} type="source" position={Position.Right} id="r6" />
      <Handle style={handleStyle({ top: 499 })} type="source" position={Position.Right} id="r7" />
      <Handle style={handleStyle()} type="source" position={Position.Bottom} id="bottom" />
      <Handle style={handleStyle()} type="source" position={Position.Left} id="left" />
    </>
  );
});

export const CustomNodeFourSide = memo(({ data }) => {
  const { label, value, handleTypes } = data;
  return (
    <>
      <Box flexColumn center>
        <TextHeader textAlign="center">{label}</TextHeader>
        <TextNumber color="#ff4500" fw="600">
          {formatter(value)}
        </TextNumber>
      </Box>
      <Handle
        style={{ ..._.get(data, "styleTop"), ...handleStyle() }}
        type={_.get(handleTypes, "top")}
        position={Position.Top}
        id="top"
      />
      <Handle
        style={{ ..._.get(data, "styleRight"), ...handleStyle() }}
        type={_.get(handleTypes, "right")}
        position={Position.Right}
        id="right"
      />
      <Handle
        style={{ ..._.get(data, "styleBottom"), ...handleStyle() }}
        type={_.get(handleTypes, "bottom")}
        position={Position.Bottom}
        id="bottom"
      />
      <Handle
        style={{ ..._.get(data, "styleLeft"), ...handleStyle() }}
        type={_.get(handleTypes, "left")}
        position={Position.Left}
        id="left"
      />
    </>
  );
});

export const CustomNodes = memo(({ data }) => {
  const { label, value, rightNodes, leftNodes, topNodes, bottomNodes, GENERAL_SIZE } = data;
  const renderNodes = data => {
    return (
      <>
        {data && data.length > 0
          ? data.map(item => (
              <Handle
                key={_.get(item, "id")}
                id={_.get(item, "id")}
                position={_.get(item, "position")}
                type={_.get(item, "type")}
                style={handleStyle(_.get(item, "style"))}
              />
            ))
          : null}
      </>
    );
  };

  return (
    <Box>
      <Box flexColumn center>
        <TextHeader fontSize={GENERAL_SIZE.TEXT_NODE} textAlign="center">
          {label}
        </TextHeader>
        <TextNumber fontSize={GENERAL_SIZE.NUMBER_NODE} color="#ff4500" fw="500">
          {formatter(value)}
        </TextNumber>
      </Box>
      {renderNodes(topNodes)}
      {renderNodes(rightNodes)}
      {renderNodes(bottomNodes)}
      {renderNodes(leftNodes)}
    </Box>
  );
});

export const CustomGroup = memo(({ data }) => {
  const { label, element } = data;
  return (
    <Box height={label ? "auto" : "100%"} flex alignItem="start" justify="center" zIndex={-99}>
      <TextHeader fw="bold">{label}</TextHeader>
      {element && element}
    </Box>
  );
});
