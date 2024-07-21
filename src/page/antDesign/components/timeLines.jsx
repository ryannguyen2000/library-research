import { Card, Timeline } from "antd";

const TimeLines = () => {
  return (
    <Card title="Upload images" bordered={false}>
      <Timeline
        items={[
          {
            children: "Create a services site 2015-09-01",
          },
          {
            children: "Solve initial network problems 2015-09-01",
          },
          {
            children: "Technical testing 2015-09-01",
          },
          {
            children: "Network problems being solved 2015-09-01",
          },
        ]}
      />
    </Card>
  );
};

export default TimeLines;
