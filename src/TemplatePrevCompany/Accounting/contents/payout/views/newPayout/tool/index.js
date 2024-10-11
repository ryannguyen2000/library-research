import { useState } from "react";
import { PlusOutlined } from "@ant-design/icons";

import TopBarContainer from "@containers/Accounting/container/TopBarContainer";
import { HeaderButton } from "@components/page/headerComponent";

import ToolFilter from "./toolFilter";
import ModalNewExpense from "./modalNewExpense";

const ToolBar = ({ changeParams, query, data, ...props }) => {
  const [isOpenDr, setIsOpenDr] = useState(true);
  const [openModal, setOpenModal] = useState(false);

  const handleDropdown = () => {
    setIsOpenDr(o => !o);
    // if (isOpenDr) {
    //   changeParams({
    //     toolFilter: "false",
    //   });
    // } else {
    //   changeParams({
    //     toolFilter: "true",
    //   });
    // }
  };

  const handleCreate = () => {
    setOpenModal(!openModal);
  };

  // useEffect(() => {
  //   if (_.get(query, "toolFilter") === "true") {
  //     setIsOpenDr(true);
  //   } else {
  //     setIsOpenDr(false);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [_.get(query, "toolFilter")]);

  return (
    <TopBarContainer
      // nonePadding
      childrenBtnNode={
        <>
          <ModalNewExpense type="create" toggleModal={handleCreate} openModal={openModal} />
          <HeaderButton onClick={handleDropdown}>
            <i className="ion-android-options abs-icon" />
            <span className="filter-text">BỘ lỌC</span>
          </HeaderButton>
          <HeaderButton icon={<PlusOutlined />} onClick={handleCreate}>
            TẠO LỆNH
          </HeaderButton>
        </>
      }
      toolFilterNode={
        <ToolFilter
          {...props}
          isOpenDr={isOpenDr}
          setIsOpenDr={setIsOpenDr}
          changeParams={changeParams}
          query={query}
        />
      }
    />
  );
};

export default ToolBar;
