import { useCallback, useEffect, useState } from "react";
import _ from "lodash";
import { connect } from "react-redux";

import client from "@helpers/client";
import actions from "@redux/accounting/configs/paymentAccounts/actions";
import Box from "@components/utility/box";

import FormModal from "./Modal";
import ModalRequest from "./ModalRequest";
import List from "./List";
import ToolBar from "./tool";

const PaymentAccounts = ({ fetch, refresh, accounts, total, isLoading, query, changeParams }) => {
  const [state, setState] = useState({});

  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.limit) || 10;

  const getData = useCallback(() => {
    fetch({
      limit: pageSize,
      start: (page - 1) * pageSize,
      blockIds: _.get(query, "blockIds"),
      payoutCategoryIds: _.get(query, "payoutCategoryIds"),
      keyword: _.get(query, "keyword"),
    });
  }, [fetch, query, page, pageSize]);

  useEffect(getData, [getData]);

  const handleDelete = async data => {
    const { error_code } = await client().delete(`/payment/pay/account/${data._id}`);
    if (error_code === 0) {
      refresh();
    }
    return error_code;
  };

  const handleSubmit = async newData => {
    const dataReq = {
      ...newData,
    };
    const { error_code } = newData._id
      ? await client().put(`/payment/pay/account/${newData._id}`, dataReq)
      : await client().post(`/payment/pay/account`, dataReq);

    if (error_code === 0) {
      refresh();
    }

    return error_code;
  };

  const toggleModal = () => {
    setState(prevState => ({ ...prevState, isOpen: !prevState.isOpen }));
  };

  const toggleModalRequest = () => {
    setState(prevState => ({ ...prevState, isOpenRequest: !prevState.isOpenRequest }));
  };

  const onUpdate = data => {
    setState(prevState => ({ ...prevState, isOpen: true, data }));
  };

  const onRequest = dataRequest => {
    setState(prevState => ({ ...prevState, isOpenRequest: true, dataRequest }));
  };

  return (
    <>
      {state.isOpen && <FormModal data={state.data} toggleModal={toggleModal} handleSubmit={handleSubmit} />}
      {state.isOpenRequest && (
        <ModalRequest data={state.dataRequest} toggleModal={toggleModalRequest} fetchData={fetch} />
      )}
      <ToolBar changeParams={changeParams} onUpdate={onUpdate} query={query} />
      <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
        <List
          data={accounts || []}
          total={total || 0}
          loading={isLoading}
          handleDelete={handleDelete}
          onUpdate={onUpdate}
          onRequest={onRequest}
          changeParams={changeParams}
          page={page}
          pageSize={pageSize}
        />
      </Box>
    </>
  );
};

function mapStateToProps(state) {
  return {
    accounts: state.accounting.configs.paymentAccounts.data,
    isLoading: state.accounting.configs.paymentAccounts.isLoading,
    total: state.accounting.configs.paymentAccounts.total,
  };
}

export default connect(mapStateToProps, actions)(PaymentAccounts);
