import Topbar from "@components/page/topbar";
import { HeaderTop } from "@components/page/headerComponent";
import { Box } from "@components/utility/styles";
import ToolFilter from "./toolFilter";

const ToolBar = ({ title, ...props}) => {
  return (
    <Topbar nonePadding={true}>
      <HeaderTop>
        <h3>{title}</h3>
      </HeaderTop>
      <Box pt={10}>
        <ToolFilter {...props} />
      </Box>
    </Topbar>
  );
};

export default ToolBar;
