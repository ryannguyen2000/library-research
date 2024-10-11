import { Row, Col } from "antd";

import IntlMessages from "@components/utility/intlMessages";
import { GUTTER } from "@containers/Accounting/const";
import { Box } from "@components/utility/styles";
import TabsRoute from "../tabs";
import Message from "./views/message";
import Email from "./views/email";

const DEFAULT_TAB = "message";

const Communicate = ({ isMobile, searchParams, query, changeSearchParams }) => {
  const type = searchParams.get("type") || DEFAULT_TAB;
  const COMMUNICATE_TABS = [
    {
      key: "message",
      label: <IntlMessages id="message" />,
      children: <Message changeParams={changeSearchParams} query={query} />,
    },
    {
      key: "email",
      label: <IntlMessages id="email" />,
      children: <Email changeParams={changeSearchParams} query={query} />,
    },
    // {
    //   key: "listen_and_call",
    //   label: <IntlMessages id="listen_and_call" />,
    //   children: <ListenAndCall changeParams={changeSearchParams} query={query} />,
    // },
  ];

  const onTabChange = key => {
    changeSearchParams({
      // ...resetParams[type],
      type: key,
      page: 1,
    });
  };

  return (
    <>
      <Row gutter={GUTTER}>
        <Col xs={24}>
          <Box flex flexColumn>
            <TabsRoute onChange={onTabChange} items={COMMUNICATE_TABS} activeKey={type} />
          </Box>
        </Col>
      </Row>
    </>
  );
};

export default Communicate;
