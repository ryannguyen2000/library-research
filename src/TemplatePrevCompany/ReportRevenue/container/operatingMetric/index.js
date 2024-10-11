import { useLocation } from 'react-router';

import { Box } from '@components/utility/styles';
import { CommentOutlined, PoundOutlined } from '@ant-design/icons';

import Menus from '../menus'
import ContentRouterElement from './views';

const OperatingMetric = ({ searchParams, changeSearchParams, query, isMobile, search, navigate }) => {
  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[3] || "adr"

  const CONVERT_USER_TABS = [
    {
      key: "adr",
      icon: <CommentOutlined />,
      label: "ADR",
    },
    {
      key: "booking_windows",
      icon: <PoundOutlined />,
      label: "Booking Windows",
    },
    {
      key: "occupancy",
      icon: <PoundOutlined />,
      label: "Occupancy",
    },
    {
      key: "booking_transaction",
      icon: <PoundOutlined />,
      label: "Booking Transaction",
    },
    {
      key: "gmv",
      icon: <PoundOutlined />,
      label: "GMV",
    },
    {
      key: "alos",
      icon: <PoundOutlined />,
      label: "ALOS",
    },
  ];

  return (
    <Box flex flexColumn={isMobile ? true : false}>
      <Menus items={CONVERT_USER_TABS} activeKey={activeKey} isMobile={isMobile} />
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
  )
}

export default OperatingMetric