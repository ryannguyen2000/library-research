import { Checkbox } from "antd";
import { optionsFilter } from "../const";

const ToolFilter = ({ onChangeState }) => {
  const onCheckbox = (e) => {
    onChangeState()
  };
  return <Checkbox.Group options={_.values(optionsFilter)} />;
};

export default ToolFilter;
