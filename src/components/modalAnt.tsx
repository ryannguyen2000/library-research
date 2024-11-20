import { Modal } from "antd";
import React from "react";

interface ModalAntTypes {
  isOpen: boolean;
  setIsOpen: any;
}

const ModalAnt = (props: ModalAntTypes) => {
  const { isOpen, setIsOpen } = props;

  const onClose = () => setIsOpen(false)

  return (
    <Modal open={isOpen} title="Modal Ant" onCancel={onClose} onClose={onClose}>
      Modal Ant Design
    </Modal>
  );
};

export default ModalAnt;
