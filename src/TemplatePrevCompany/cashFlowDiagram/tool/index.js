import { Box } from "@components/utility/styles";
import Topbar from "@components/page/topbar";

import ToolFilter from "./ToolFilter";

function ToolBar({ changeParams, query, ...props }) {
  return (
    <Topbar>
      <Box>
        <ToolFilter changeParams={changeParams} query={query} {...props} />
      </Box>
    </Topbar>
  );
}

export default ToolBar;
