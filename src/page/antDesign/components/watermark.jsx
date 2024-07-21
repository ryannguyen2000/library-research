import { Card, Watermark } from "antd";
const WatermarkCompo = () => (
  <Card title="Form watch directly value" bordered={false}>
    <Watermark
      height={30}
      width={130}
      image="https://mdn.alipayobjects.com/huamei_7uahnr/afts/img/A*lkAoRbywo0oAAAAAAAAAAAAADrJ8AQ/original"
    >
      <div
        style={{
          height: 500,
        }}
      />
    </Watermark>
  </Card>
);
export default WatermarkCompo;
