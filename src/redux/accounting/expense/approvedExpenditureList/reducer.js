import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  total: 0,
  query: null,
  columnsReferences: {
    columns: {
      noId: "Phiếu",
      name: "Tên",
      amount: "Số tiền",
      created_by: "Người tạo",
      confirmed: "Đã duyệt",
      approved: "Đã chi",
      created_at: "Ngày tạo",
      note: "Ghi chú",
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
