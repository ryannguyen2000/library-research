import { Card } from "antd";
import FormUseWatch from "./components/formUseWatch";

const AntDesign = () => {
  return (
    <>
      <Card
        title="Card title"
        bordered={false}
        style={{
          width: 300,
        }}
      >
        <FormUseWatch />
      </Card>
    </>
  );
};

export default AntDesign;
