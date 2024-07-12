import { Form, InputNumber, Typography } from "antd";
import Input from "antd/es/input/Input";
import { formatNumber } from "hooks/formatNumber";

const FormUseWatch = () => {
  const [form] = Form.useForm();
  const nameValue = Form.useWatch("name", form);
  // The selector is static and does not support closures.
  const customValue = Form.useWatch(
    (values) => (values ? `name: ${values.name || ""}` : null),
    form
  );

  return (
    <div>
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item name="name" label="Name (Watch to trigger rerender)">
          <Input />
        </Form.Item>
        <Form.Item name="age" label="Age (Not Watch)">
          <InputNumber />
        </Form.Item>
      </Form>
      <Typography>
        <pre>Name Value: {formatNumber(nameValue)}</pre>
        <pre>Custom Value: {formatNumber(customValue)}</pre>
      </Typography>
    </div>
  );
};

export default FormUseWatch;
