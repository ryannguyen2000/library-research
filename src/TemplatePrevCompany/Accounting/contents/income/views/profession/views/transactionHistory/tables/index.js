import Box from "@components/utility/box";
import TablePayment from "./tablePayment";
import TableTransaction from "./tableTransaction";

const tableComponent = {
  kovena_payment: TablePayment,
  kovena_transaction: TableTransaction,
};

const TableTransitionHistory = ({ changeParams, query, limit, page, type, ...props }) => {
  const TableComponent = tableComponent[type];

  return (
    <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
      <TableComponent changeParams={changeParams} limit={limit} page={page} query={query} />
    </Box>
  );
};

export default TableTransitionHistory;
