import { Col, Row } from "antd";
import {
  FormUseWatch,
  Sliders,
  TimeCompo,
  TimeLines,
  Uploads,
  WatermarkCompo,
} from "./components";

const AntDesign = () => {
  return (
    <div className="flex flex-col gap-3">
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={6}>
          <FormUseWatch />
        </Col>
        <Col xs={24} lg={6}>
          <Uploads />
        </Col>
        <Col xs={24} lg={6}>
          <Sliders />
        </Col>
        <Col xs={24} lg={6}>
          <WatermarkCompo />
        </Col>
        <Col xs={24} lg={6}>
          <TimeCompo />
        </Col>
        <Col xs={24} lg={6}>
          <TimeLines />
        </Col>
      </Row>
    </div>
  );
};

export default AntDesign;
