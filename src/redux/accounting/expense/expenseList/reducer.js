import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  total: 0,
  query: null,
  columnReferences: {
    columns: {
      category: "Khoản chi",
      buyType: "Loại chi phí",
      quantity: "Số lượng",
      unitPrice: "Đơn giá",
      vat: "VAT",
      hasInvoice: "Hóa đơn",
      currencyAmount: "Tổng tiền",
      distribute: "Phân bổ",
      isInternal: "Cozrum chi",
      exportNo: "Phiếu chi",
      description: "Nội dung chi",
      blockIds: "Địa điểm",
      state: "Trạng thái",
      paidAt: "Ngày chi",
      createdBy: "Người tạo",
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
