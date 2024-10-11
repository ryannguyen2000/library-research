import { useState, useEffect } from "react";
import _ from "lodash";

import Topbar from "@components/page/topbar";
import { HeaderButton, HeaderTop } from "@components/page/headerComponent";
import { PlusOutlined } from "@ant-design/icons";
import ReportsPayout from "./reportsPayout";

const ToolBar = ({ handleCreate, ...props }) => {
  const [isOpenDr, setIsOpenDr] = useState(true);

  const isCreate = _.get(props, "id");

  const handleDropdown = () => {
    if (isOpenDr) {
      props.changeParams({
        ..._.get(props, "query"),
        toolFilter: "false",
      });
    } else {
      props.changeParams({
        ..._.get(props, "query"),
        toolFilter: "true",
      });
    }
  };

  useEffect(() => {
    if (_.get(props, "toolFilter") === "true") {
      setIsOpenDr(true);
    } else {
      setIsOpenDr(false);
    }
  }, [props]);

  return isCreate ? (
    <ReportsPayout query={props.query} />
  ) : (
    <Topbar>
      <HeaderTop>
        <HeaderButton onClick={handleDropdown}>
          <i className="ion-android-options abs-icon" />
          <span className="filter-text">BỘ lỌC</span>
        </HeaderButton>
        <HeaderButton icon={<PlusOutlined />} onClick={handleCreate}>
          TẠO MỚI
        </HeaderButton>
      </HeaderTop>
    </Topbar>
  );
};

export default ToolBar;
