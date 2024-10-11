import actions from "./actions";

const initState = {
  credit: {
    isLoading: false,
    data: [],
    total: 0,
    query: null,
    hasMore: true,
    page: 1,
    limit: 10,
  },
  debit: {
    isLoading: false,
    data: [],
    total: 0,
    query: null,
    hasMore: true,
    page: 1,
    limit: 10,
  },
};

export default function reducer(state = initState, { type, payload }) {
  switch (type) {
    case actions.FETCH_START_DEBIT: {
      return {
        ...state,
        debit: {
          ...state.debit,
          isLoadingDebit: true,
        },
      };
    }
    case actions.FETCH_SUCCESS_DEBIT:
      return {
        ...state,
        debit: {
          ...state.debit,
          ...payload,
          isLoadingDebit: false,
        },
      };
    case actions.FETCH_START_CREDIT: {
      return {
        ...state,
        credit: {
          ...state.credit,
          isLoadingCredit: true,
        },
      };
    }
    case actions.FETCH_SUCCESS_CREDIT:
      return {
        ...state,
        credit: {
          ...state.credit,
          ...payload,
          isLoadingCredit: false,
        },
      };
    case actions.CHANGE_INIT_STATE_DEBIT:
      return {
        ...state,
        debit: {
          ...state.debit,
          ...payload,
        },
      };
    case actions.CHANGE_INIT_STATE_CREDIT:
      return {
        ...state,
        credit: {
          ...state.credit,
          ...payload,
        },
      };
    case actions.RESET:
      return initState;
    default:
      return state;
  }
}
