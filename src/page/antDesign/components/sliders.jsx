import { useState } from "react";
import { Card, Col, InputNumber, Row, Slider } from "antd";

const InputSlider = () => {
  const [inputValue, setInputValue] = useState(1);
  const onChange = (newValue) => {
    setInputValue(newValue);
  };

  return (
    <Row>
      <Col span={12}>
        <Slider
          min={1}
          max={20}
          onChange={onChange}
          value={typeof inputValue === "number" ? inputValue : 0}
        />
      </Col>
      <Col span={4}>
        <InputNumber
          min={1}
          max={20}
          style={{
            margin: "0 16px",
          }}
          value={inputValue}
          onChange={onChange}
        />
      </Col>
    </Row>
  );
};

const VerticalSlider = () => {
  const style = {
    display: "inline-block",
    height: 300,
    marginLeft: 70,
  };
  const marks = {
    0: "0°C",
    26: "26°C",
    37: "37°C",
    100: {
      style: {
        color: "#f50",
      },
      label: <strong>100°C</strong>,
    },
  };

  return (
    <div style={style}>
      <Slider vertical range marks={marks} defaultValue={[26, 37]} />
    </div>
  );
};

const Sliders = () => {
  return (
    <Card title="Form watch directly value" bordered={false}>
      <Row gutter={[12]}>
        <Col xs={24}>
          <InputSlider />
        </Col>
        <Col xs={24}>
          <VerticalSlider />
        </Col>
      </Row>
    </Card>
  );
};

export default Sliders;
