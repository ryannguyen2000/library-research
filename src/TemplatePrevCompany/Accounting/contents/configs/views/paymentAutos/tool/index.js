import { useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
// import _ from "lodash";

import { HeaderButton } from "@components/page/headerComponent";
import TopBarContainer from "@containers/Accounting/container/TopBarContainer";
import ToolFilter from "./toolFilter";
import ModaPaymentAutos from "./modal/modaPaymentAutos";

const ToolBar = ({ query, changeParams, refresh }) => {
  const [openModal, setOpenModal] = useState(false);

  const onToggleModal = () => {
    setOpenModal(o => !o);
  };

  // const isToolFilter = Boolean(_.get(query, "toolFilter") === "true");
  // const handleDropdown = () => {
  //   if (!isToolFilter) {
  //     changeParams({
  //       toolFilter: "true",
  //     });
  //   } else {
  //     changeParams({
  //       toolFilter: "false",
  //     });
  //   }
  // };

  return (
    <TopBarContainer
      childrenBtnNode={
        <>
          {openModal && <ModaPaymentAutos onToggleModal={onToggleModal} refresh={refresh} />}
          {/* <HeaderButton onClick={handleDropdown}>
            <i className="ion-android-options abs-icon" />
            <span className="filter-text">BỘ lỌC</span>
          </HeaderButton> */}
          <HeaderButton icon={<PlusOutlined />} onClick={onToggleModal}>
            TẠO MỚI
          </HeaderButton>
        </>
      }
      toolFilterNode={<ToolFilter changeParams={changeParams} query={query} isOpenDr={true} />}
    />
  );
};

export default ToolBar;
