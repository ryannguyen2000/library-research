import { Modal } from "antd";
import { Box } from "@components/utility/styles";

const ModalViewPayment = ({ onToggle, data, ...props }) => {
  const noResult = (
    <Box flex flexColumn gap={10}>
      <h4>No Results Found</h4>
      <div>There aren't any results for that query.</div>
    </Box>
  );

  return (
    <Modal open={true} onCancel={onToggle} title="View Log" footer={null}>
      {noResult}
    </Modal>
  );
};

export default ModalViewPayment;
