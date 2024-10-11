import Topbar from "@components/page/topbar";
import { HeaderTop } from "@components/page/headerComponent";
import { Box } from "@components/utility/styles";
import ToolFilter from "./toolFilter";

const ToolBar = ({ title, nonFilter, ...props }) => {
  return (
    <Topbar nonPadding={true} nonPaddingMb={true}>
      <HeaderTop>
        <h3 style={{ fontWeight: 400 }}>{title}</h3>
      </HeaderTop>
      {!nonFilter && <Box pt={10}>
        <ToolFilter {...props} />
      </Box>}
    </Topbar>
  );
};

export default ToolBar;
