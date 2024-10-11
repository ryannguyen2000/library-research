import TableRevenue from "@containers/ReportRevenue/components/tableRevenue";
import ToolBar from "@containers/ReportRevenue/components/tools";
import BarChartComponent from "@containers/ReportRevenue/components/barChart";
import { Flex } from "@components/utility/styles";
import Box from "@components/utility/box";

const RevenueStream = ({ query, changeSearchParams, data, loading, showChart, ...props }) => {
  return (
    <Flex flexColumn>
      <ToolBar title="Revenue Stream" query={query} changeSearchParams={changeSearchParams} />
      <div>
        {showChart && <Box>
          <BarChartComponent data={data} loading={loading} query={query} />
        </Box>}
        <TableRevenue data={data} loading={loading} {...props} />
      </div>
    </Flex>
  );
};

export default RevenueStream;
