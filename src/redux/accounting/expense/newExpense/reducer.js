import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  total: 0,
  query: null,
  columnsReferences: {
    columns: {
      no: "No",
      status: "Trạng thái",
      amount: "Số tiền",
      blockIds: "Nhà",
      createdAt: "Ngày tạo",
      description: "Mô tả",
      payDescription: "Nội dung chi",
      createdBy: "Người tạo",
      debitAccount: "Nguồn chi",
      category: "Khoản chi",
      priority: "Cấp độ chi",
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
