import _ from "lodash";

import { Box, TextHeader, TextNumber } from "@components/utility/styles";
import { formatter } from "@helpers/utility";
import { normalSize, smallSize } from "./const";

const commonTableContainer = {
  type: "CustomGroup",
  sourceHandle: false,
  targetHandle: false,
  tabIndex: -1,
};

export const footerGroupFc = (totalRevenue, totalExpense, height, width, GENERAL_SIZE) => {
  return {
    id: "footer",
    data: {
      label: "",
      element: (
        <Box flex gap={10} height="100%">
          <Box flex center gap={10} height="100%">
            <TextHeader fw="bold" fontSize={GENERAL_SIZE.TEXT_FIRST_FOOTER_GROUP}>
              TỔNG SỐ TIỀN DOANH THU:
            </TextHeader>
            <TextNumber fontSize={GENERAL_SIZE.TEXT_FIRST_FOOTER_GROUP} fw="bold" color="#ff0000 ">
              {formatter(_.get(totalRevenue, "total"))}
            </TextNumber>
          </Box>
          {totalExpense && (
            <Box border_l="1px solid #ccc" flex center gap={10} height="100%" maxWidth="500px">
              <TextHeader fw="bold" fontSize={GENERAL_SIZE.TEXT_SECOND_FOOTER_GROUP}>
                TỔNG SỐ TIỀN CHI PHÍ:
              </TextHeader>
              <TextNumber fontSize={GENERAL_SIZE.TEXT_SECOND_FOOTER_GROUP} fw="bold" color="#ff0000 ">
                {formatter(_.get(totalExpense, "total"))}
              </TextNumber>
            </Box>
          )}
        </Box>
      ),
    },
    position: { x: 0, y: height + 20 },
    style: {
      width: width,
      height: GENERAL_SIZE.HEIGTH_FOOTER_NODE_GROUP,
      display: "flex",
      alignItems: "center",
      fontSize: 20,
      border: "1px solid #ccc",
      borderTop: "none",
      zIndex: -99,
    },
    ...commonTableContainer,
  };
};

export const createNodeGroups = (dataGroup, totalRevenue, totalExpense, setHeight, screenWidth) => {
  const GENERAL_SIZE = screenWidth >= 1400 ? normalSize : smallSize;
  let groups = [];
  let HEIGHT = 0;
  let widthGroupFooter = screenWidth - 32;
  let setWidthGroup =
    dataGroup.length > 0 && screenWidth && (screenWidth - 32 - GENERAL_SIZE.WIDTH_GROUP_FIRST) / (dataGroup.length - 1);
  let widthGroup = setWidthGroup > 239 ? setWidthGroup : GENERAL_SIZE.WIDTH_GROUP_FIRST + 50;
  dataGroup.forEach((group, index) => {
    let countLength = 0;
    if (group.key === "SOURCE") {
      countLength = group.objects.length * GENERAL_SIZE.POSITION_NODE_Y + GENERAL_SIZE.HEIGHT_NODE_GUEST;
      // + GENERAL_SIZE.PADDING_FIRST_EACH_NODE_OF_GROUP;
    } else {
      countLength =
        _.get(group, "objects.length", 0) > 5
          ? _.get(group, "objects.length", 0) * (GENERAL_SIZE.POSITION_NODE_FIRST_Y + 10)
          : _.get(group, "objects.length", 0) * GENERAL_SIZE.POSITION_NODE_Y;
    }
    HEIGHT = Math.max(HEIGHT, countLength);

    groups.push({
      id: _.get(group, "key"),
      position: {
        x:
          index === 0
            ? 0
            : index === 1
            ? GENERAL_SIZE.WIDTH_GROUP_FIRST
            : index * widthGroup - (widthGroup - GENERAL_SIZE.WIDTH_GROUP_FIRST),
        y: 0,
      },
      data: { label: _.get(group, "name") },
      style: {
        x:
          index === 0
            ? 0
            : index === 1
            ? GENERAL_SIZE.WIDTH_GROUP_FIRST
            : index * widthGroup - (widthGroup - GENERAL_SIZE.WIDTH_GROUP_FIRST),
        width: index === 0 ? GENERAL_SIZE.WIDTH_GROUP_FIRST : widthGroup,
        height: GENERAL_SIZE.HEIGHT_GROUP,
        fontSize: 20,
        border: "1px solid #ccc",
        borderTop: "none",
        zIndex: -99,
        marginTop: 20,
      },
      ...commonTableContainer,
    });
  });
  let newGroup = [];
  groups.forEach(group => {
    newGroup = [
      ...newGroup,
      {
        ...group,
        style: {
          ...group.style,
          height: HEIGHT,
        },
      },
    ];
  });

  // SET HEIRGHT OF DIAGRAM
  setHeight(HEIGHT + (GENERAL_SIZE.HEIGTH_FOOTER_NODE_GROUP + 40));

  const footerGroup = footerGroupFc(totalRevenue, totalExpense, HEIGHT, widthGroupFooter, GENERAL_SIZE);
  return { nodesGroups: [footerGroup, ...newGroup], widthGroup };
};
