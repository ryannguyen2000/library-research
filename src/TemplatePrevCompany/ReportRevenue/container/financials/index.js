import { useLocation } from 'react-router';

import { Box } from '@components/utility/styles';
import { FormOutlined, PoundOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';

import Menus from '../menus'
import ContentRouterElement from './views';

const Financials = ({ searchParams, changeSearchParams, query, isMobile, search, navigate }) => {
  const { pathname } = useLocation();
  const activeKey = pathname.split("/")[3] || "incomeStatement"

  const CONVERT_USER_TABS = [
    {
      key: "incomeStatement",
      label: "income statement",
      icon: <FormOutlined />
    },
    {
      key: "revenueStream",
      label: "revenue stream",
      icon: <PoundOutlined />,
    },
    {
      key: "expensesStream",
      label: "expenses stream",
      icon: <WalletOutlined />
    },
    {
      key: "list_of_company_document",
      label: "LIST OF COMPANY DOCUMENTATION",
      icon: <UserOutlined />
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

export default Financials