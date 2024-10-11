import { HeaderBot, HeaderTop } from "@components/page/headerComponent";
import Topbar from "@components/page/topbar";
import { Box } from "@components/utility/styles";

const TopBarContainer = ({ title, childrenBtnNode, toolFilterNode, nonePadding }) => {
  return (
    <Topbar nonePadding={!!nonePadding}>
      {title && (
        <HeaderTop>
          <h3>{title}</h3>
        </HeaderTop>
      )}
      <HeaderBot className={!title ? "pt-0" : ""}>
        <Box flex gap={5} justify="end">
          {childrenBtnNode}
        </Box>
      </HeaderBot>
      <Box pt={2}>{toolFilterNode}</Box>
    </Topbar>
  );
};

export default TopBarContainer;
