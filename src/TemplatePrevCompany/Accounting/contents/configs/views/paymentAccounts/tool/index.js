import { PlusOutlined } from "@ant-design/icons";

import { HeaderButton } from "@components/page/headerComponent";
import ToolFilter from "./toolFilter";
import TopBarContainer from "@containers/Accounting/container/TopBarContainer";

const ToolBar = ({ query, changeParams, onUpdate }) => {
  return (
    <>
      <TopBarContainer
        childrenBtnNode={
          <>
            {/* <HeaderButton onClick={handleDropdown}>
              <i className="ion-android-options abs-icon" />
              <span className="filter-text">BỘ lỌC</span>
            </HeaderButton> */}
            <HeaderButton icon={<PlusOutlined />} onClick={() => onUpdate({})}>
              TẠO MỚI
            </HeaderButton>
          </>
        }
        toolFilterNode={<ToolFilter changeParams={changeParams} query={query} isOpenDr={true} />}
      />
    </>
  );
};

export default ToolBar;
