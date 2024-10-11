import Modal from "@containers/Finance/payout/formUpdate";
import { useCallback, useContext } from "react";
import { ModalContextOrderList } from "./modalContext";

const ModalUpdate = () => {
  const { open, data, setState } = useContext(ModalContextOrderList);

  const toggleModal = () => {
    setState({
      data: {},
      open: !open,
    });
  };
  const updateData = useCallback(
    newData => {
      setState(s => ({
        ...s,
        data: {
          ...s.data,
          ...newData,
        },
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setState]
  );

  return <div>{open && <Modal toggleModal={toggleModal} data={data} updateData={updateData} />}</div>;
};

export default ModalUpdate;
