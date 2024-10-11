import Box from "@containers/Report/contents/elements/box";
import FileList from "@containers/Report/contents/resource/file/FileList";
import FolderList from "@containers/Report/contents/resource/folder/FolderList";
import { CsRow } from "@containers/Report/contents/resource/style";
import { selectViewDevice } from "@redux/app/reducer";
import { Col } from "antd";
import { useSelector } from "react-redux";
import ToolBar from "@containers/ReportRevenue/components/tools";

const ArchivalRecords = ({ query, changeSearchParams, searchParams, data, loading, ...props }) => {
  const isMobile = useSelector(selectViewDevice);
  const limit = isMobile ? 12 : 16;
  const limitFile = isMobile ? 12 : 18;

  const folder = searchParams.get("folder");
  const pageFolder = parseInt(searchParams.get("pageFolder")) || 1;
  const pageFile = parseInt(searchParams.get("pageFile")) || 1;

  return (
    <>
      <ToolBar title="List Of Company Document" nonFilter={true} />
      <Box style={{ minHeight: "600px", position: "relative" }}>
        <CsRow>
          <Col span={24} style={{ minHeight: "300px" }}>
            <FolderList
              pageFolder={pageFolder}
              limit={limit}
              folder={folder}
              changeSearchParams={changeSearchParams}
              isAdmin={true}
            />
          </Col>
          <Col span={24} style={{ minHeight: "300px", marginTop: "50px" }}>
            <FileList
              pageFile={pageFile}
              limit={limitFile}
              folder={folder}
              changeSearchParams={changeSearchParams}
              isAdmin={true}
            />
          </Col>
        </CsRow>
      </Box>
    </>
  );
};

export default ArchivalRecords;
