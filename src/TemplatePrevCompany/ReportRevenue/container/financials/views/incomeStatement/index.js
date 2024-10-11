import TableRevenue from "@containers/ReportRevenue/components/tableRevenue";
import ToolBar from "@containers/ReportRevenue/components/tools";
import { Flex } from "@components/utility/styles";

const IncomeStatement = ({ query, changeSearchParams, data, loading, ...props }) => {
  return (
    <Flex flexColumn>
      <ToolBar title="Income Statement" query={query} changeSearchParams={changeSearchParams} />
      <div>
        <TableRevenue data={data} loading={loading} query={query} changeSearchParams={changeSearchParams} queryRedux={props.queryRedux} {...props} />
      </div>
    </Flex>
  );
}

export default IncomeStatement