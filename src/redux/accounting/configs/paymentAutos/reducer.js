import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  total: 0,
  query: null,
  columnsReference: {
    columns: {
      name: "Tên",
      home: "Nhà",
      description: "Mô tả",
      createdAt: "Ngày tạo",
      createdBy: "Người tạo",
      deletedAt: "Ngày xóa",
      deletedBy: "Người xóa",
      autos: "Thời gian tự động",
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
