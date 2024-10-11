import actions from "./actions";

const initState = {
  loading: false,
  data: [],
  total: 0,
  query: null,
  columnReferences: {
    reservation: {
      payout_date: "Payout Date",
      charge_amount: "Charge Amount",
      charge_fee: "Charge Fee",
      payout_amount: "Payout Amount",
      receivable_amount: "Receivable Amount",
      status: "Status",
      card_name: " Card Name",
      reference_no: "Reference No.",
      guest_name: "Guest Name",
      channel: "Channel",
      type: "Type",
      created_on: "Created On",
    },
    other: { action: "#", order: "STT" },
  },
  columns: {
    reservation: ["payout_date", "charge_amount", "charge_fee", "payout_amount", "receivable_amount", "status"],
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
    default:
      return state;
  }
}
