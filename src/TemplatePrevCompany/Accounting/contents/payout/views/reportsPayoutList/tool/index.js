import { connect } from "react-redux";
import moment from "moment";

import Topbar from "@components/page/topbar";
import { HeaderBot } from "@components/page/headerComponent";
import ToolColumn from "@containers/Finance/reportPayout/tool/toolColumn";
import ToolExport from "@containers/Finance/reportPayout/tool/toolExport";
import ToolAdd from "@containers/Finance/reportPayout/tool/toolAdd";
import ToolSave from "./toolSave";
import { useNavigate } from "react-router-dom";

function ToolBar({ isCreate, id, ...props }) {
  const navigate = useNavigate();

  const routerFcCopy = ({ id }) => {
    navigate(`/accounting/expense?type=reports_payout_list&detailId=${id}`);
  };

  return (
    <Topbar>
      <HeaderBot className="pt-0">
        <Header isCreate={isCreate} />
        <div className="d-flex">
          <ToolAdd isCreate={isCreate} id={id} routerFc={routerFcCopy} />
          <ToolSave query={props.query} />
          {!isCreate && <ToolExport />}
          <ToolColumn />
        </div>
      </HeaderBot>
    </Topbar>
  );
}

const Header = connect(
  ({
    financeReports: {
      detail: {
        other: { noId, createdBy, createdAt, state },
      },
    },
  }) => ({
    createdBy,
    createdAt,
    state,
    noId,
  })
)(({ createdBy, createdAt, isCreate, noId, state }) => {
  const isDel = state === "deleted";
  return (
    <h3 className={isDel ? "text-through" : ""}>
      {isCreate ? (
        "Tạo báo cáo chi phí"
      ) : !createdBy || !createdBy.name ? (
        "Chi tiết báo cáo chi phí"
      ) : (
        <>
          Phiếu chi {noId}
          <span className="text-sm">{` | tạo bởi ${createdBy.name} - ${moment(createdAt).format("D/M/Y H:mm")}`}</span>
        </>
      )}
      {isDel && <span className="text-sm"> | Đã xoá</span>}
    </h3>
  );
});

export default ToolBar;
