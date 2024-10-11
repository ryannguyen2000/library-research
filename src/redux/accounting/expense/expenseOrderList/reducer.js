import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  total: 0,
  query: null,
  columnsReferences: {
    columns: {
      category: "Khoản chi",
      receive: "Người nhận",
      amount: "Số tiền",
      description: "Nội dung chi",
      source: "Nguồn chi",
      owner: "Nhà chi",
      priority: "Cấp độ",
      state: "Trạng thái",

      block: "Nhà",
      createdAt: "Ngày tạo",
      createdBy: "Người tạo",
      currencyAmount: "Tổng tiền",
      distribute: "Phân bổ",
      isInternal: "Cozrum chi"
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
