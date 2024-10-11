import actions from "./actions";

const initState = {
  loading: false,
  data: [],
  total: 0,
  query: null,
  columnReferences: {
    reservation: {
      reference_no: "Reference No.",
      bk_id: "Booking Id",
      card_name: "Card Name",
      amount: "Amount",
      transaction_channel: "Channel",
      transaction_type: "Transaction type",
      status: "Status",
      guest_name: "Guest Name",
      created_at: "Created On",
      payout_date: "Payout Date",
    },
    other: { action: "#", order: "STT" },
  },
  columns: {
    reservation: ["reference_no", "bk_id", "card_name", "amount", "status", "created_at", "payout_date", "action"],
  },
};

export default function reducer(state = initState, { type, payload }) {
  switch (type) {
    case actions.FETCH_START: {
      return {
        ...state,
        loading: true,
      };
    }
    case actions.FETCH_SUCCESS:
      return {
        ...state,
        ...payload,
        loading: false,
      };
    case actions.UPDATE_START:
      return {
        ...state,
        loading: true,
      };
    case actions.RESET:
      return initState;
    case actions.ON_COLUMM_CHANGE: {
      const newCol = { ...state.columns };
      newCol[payload.keyType] = payload.data;
      return {
        ...state,
        columns: newCol,
      };
    }
    default:
      return state;
  }
}
