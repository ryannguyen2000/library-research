import { useState } from "react";
import { Col, Radio, Row } from "antd";
import styled from "styled-components";

import TopBarContainer from "@containers/Accounting/container/TopBarContainer";
import { Box } from "@components/utility/styles";

import ToolColumn from "./toolColumn";
import ToolFilter from "./toolFilter";
import ToolExportTransaction from "./toolExportTransaction";
import ToolExportPayment from "./toolExportPayment";

const optionViewtype = [
  <Radio.Button key="kovena_payment" value="kovena_payment">
    Konvena payment
  </Radio.Button>,
  <Radio.Button key="kovena_transaction" value="kovena_transaction">
    Kovena transaction
  </Radio.Button>,
];

const ToolBar = ({ onTypeChange, type, onRowClick, ...props }) => {
  const [isOpenDr, setIsOpenDr] = useState(
    props.toolFilter === undefined || props.toolFilter === "true" || props.toolFilter === true
  );

  return (
    <>
      <TopBarContainer
        nonePadding
        title={!props.nonTitle && "Danh sách thu"}
        childrenBtnNode={
          <Box>
            <Row>
              <Col xs={24} lg={12}>
                <Box flex justify="flex-start">
                  <Radio.Group onChange={onTypeChange} value={type} buttonStyle="solid">
                    {optionViewtype}
                  </Radio.Group>
                </Box>
              </Col>
              <Col xs={24} lg={12}>
                <CsBox flex justify="flex-end">
                  {type === "kovena_transaction" && <ToolExportTransaction {...props} type={type} />}
                  {type === "kovena_payment" && <ToolExportPayment {...props} type={type} />}
                  {type === "kovena_transaction" && <ToolColumn type={type} />}
                </CsBox>
              </Col>
            </Row>
          </Box>
        }
        toolFilterNode={<ToolFilter type={type} isOpenDr={isOpenDr} setIsOpenDr={setIsOpenDr} {...props} />}
      />
    </>
  );
};

const CsBox = styled(Box)`
  @media screen and (max-width: 576px) {
    justify-content: flex-start;
    overflow-x: scroll;
  }
`;

export default ToolBar;
