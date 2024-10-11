import { Form } from "antd";
import styled from "styled-components";

const FormItem = ({ children, ...props }) => {
  return <CsFormItem {...props}>{children}</CsFormItem>;
};

const CsFormItem = styled(Form.Item)`
  &.ant-form-item {
    margin-bottom: 10px;
  }
  .ant-form-item-label {
    padding: 2px !important;
  }
`;

export default FormItem;
