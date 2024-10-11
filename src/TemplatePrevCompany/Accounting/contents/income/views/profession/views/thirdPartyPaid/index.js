import _ from "lodash";

import { Box } from "@components/utility/styles";

import ToolFilter from "./toolFilter";
import TableThirdPartyPaid from "./table";
import OrderDetail from "./orderDetail";

const ThirdPartyPaid = ({ query }) => {
  const id = _.get(query, "id");

  return (
    <Box minHeight="100vh" flex flexColumn gap={15}>
      <ToolFilter />
      {!id && <TableThirdPartyPaid />}
      {id && <OrderDetail />}
    </Box>
  );
};

export default ThirdPartyPaid;
