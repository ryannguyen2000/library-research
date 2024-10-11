import Modal from "@containers/Finance/payout/formUpdate";
import { useCallback, useContext } from "react";
import { ModalContextNewExpense } from "./modalContext";

const ModalUpdate = () => {
  const { open, data, refresh, setState } = useContext(ModalContextNewExpense);

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

  if (!open) return null;

  const toggleModal = () => {
    setState({
      data: {},
      open: !open,
      refresh: refresh,
    });
  };

  return <Modal refresh={refresh} toggleModal={toggleModal} data={data} updateData={updateData} />;
};

export default ModalUpdate;
