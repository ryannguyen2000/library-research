import { useCallback, useEffect } from "react";
import { connect } from "react-redux";
import _ from "lodash";

import actions from "@redux/accounting/configs/paymentAutos/actions";
import Box from "@components/utility/box";

import TablePaymentAutos from "./TablePaymentAutos";
import ToolBar from "./tool";
// import client from "@helpers/client";

const PaymentAutos = ({ fetch, refresh, dataPaymentAutos, total, isLoading, query, changeParams }) => {
  // const [state, setState] = useState({});

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;

  const getData = useCallback(() => {
    fetch({
      limit,
      start: (page - 1) * limit,
      categoryId: _.get(query, "categoryId") || undefined,
      blockId: _.get(query, "blockId") || undefined || undefined,
      keyword: _.get(query, "keyword") || undefined,
      blockIds: _.get(query, "blockId") || undefined,
    });
  }, [fetch, query, page, limit]);

  useEffect(getData, [getData]);

  // const handleDelete = async data => {
  //   const { error_code } = await client().delete(`/payment/config/auto/${data._id}`);
  //   if (error_code === 0) {
  //     refresh();
  //   }
  //   return error_code;
  // };

  // const onUpdate = data => {
  //   setState(prevState => ({ ...prevState, isOpen: true, data }));
  // };

  // const onRequest = dataRequest => {
  //   setState(prevState => ({ ...prevState, isOpenRequest: true, dataRequest }));
  // };

  return (
    <>
      <ToolBar changeParams={changeParams} query={query} refresh={refresh} />
      <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
        <TablePaymentAutos
          data={dataPaymentAutos}
          total={total}
          loading={isLoading}
          // handleDelete={handleDelete}
          // onUpdate={onUpdate}
          // onRequest={onRequest}
          changeParams={changeParams}
          refreshPaymentAutos={refresh}
          page={page}
          pageSize={limit}
        />
      </Box>
    </>
  );
};

function mapStateProps(state) {
  return {
    dataPaymentAutos: state.accounting.configs.paymentAutos.data,
    isLoading: state.accounting.configs.paymentAutos.isLoading,
    total: state.accounting.configs.paymentAutos.total,
  };
}

export default connect(mapStateProps, actions)(PaymentAutos);
