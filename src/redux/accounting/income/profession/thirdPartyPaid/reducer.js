import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  total: 0,
  query: null,
  columnsReferences: {
    columns: {
      date: "Ngày",
      home: "Khách sạn",
      exchangedAmount: "Số tiền (VND)",
      description: "Nội dung chuyển khoản",
      ota: "OTA",
      receivingBank: "Ngân hàng nhận",
      created_at: "Người thực hiện",
      implementor: "Người thực hiện",
      state: "Trạng thái",
    },
    other: { action: "#", order: "STT" },
  },
};

export default function reducer(state = initState, { type, payload }) {
  switch (type) {
    case actions.FETCH_START: {
      return {
        ...state,
        isLoading: true,
      };
    }
    case actions.FETCH_SUCCESS:
      return {
        ...state,
        ...payload,
        isLoading: false,
      };
    case actions.UPDATE_START:
      return {
        ...state,
        isLoading: true,
      };
    case actions.RESET:
      return initState;
    default:
      return state;
  }
}
