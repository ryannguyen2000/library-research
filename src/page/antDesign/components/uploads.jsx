import { UploadOutlined } from "@ant-design/icons";
import { Button, Upload, Card } from "antd";

const Uploads = () => {
  return (
    <Card title="Upload images" bordered={false}>
      <Upload
        action="https://660d2bd96ddfa2943b33731c.mockapi.io/api/upload"
        listType="picture"
        maxCount={3}
        multiple
      >
        <Button icon={<UploadOutlined />}>Upload (Max: 3)</Button>
      </Upload>
    </Card>
  );
};

export default Uploads;
