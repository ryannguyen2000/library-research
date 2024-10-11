import { useLocation } from "react-router-dom";

import { Box } from "@components/utility/styles";

import Menus from "../menus";
import ContentRouterElement from "./views";

const CustomerAcquisition = ({ searchParams, changeSearchParams, query, isMobile, search, navigate }) => {
  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[3] || "new_user";

  const CONVERT_USER_TABS = [
    {
      key: "new_user",
      label: "new_user",
    },
    {
      key: "convert_user",
      label: "convert_user",
    },
  ];

  return (
    <Box flex>
      <Menus items={CONVERT_USER_TABS} activeKey={activeKey} />
      {activeKey &&
        <ContentRouterElement
          searchParams={searchParams}
          query={query}
          changeSearchParams={changeSearchParams}
          isMobile={isMobile}
          pathname={activeKey}
          activeKey={activeKey}
        />
      }
    </Box>
  );
}

export default CustomerAcquisition