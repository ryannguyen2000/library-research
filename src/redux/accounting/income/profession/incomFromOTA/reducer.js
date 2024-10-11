import actions from "./actions";

const initState = {
  isLoading: false,
  data: [],
  dataOTA: [],
  total: 0,
  query: null,
  columnsReferences: {
    columns: {
      date: "Ngày",
      home: "Khách sạn",
      exchangedAmount: "Số tiền (VND)",
      ota: "OTA",
      paymentMethodName: "Cách nhận",
      implementor: "Người thực hiện",
      status: "Trạng thái",
    },
    otherColumns: {
      booking_id: "Booking ID",
      booking_date: "Booking Date",
      guest_name: "Guest Name",
      checkin_in_date: "Check-in Date",
      checkin_out_date: "Check-out Date",
      no_of_rooms: "No. of Rooms",
      booking_paid_by: "Booking Paid By",
      currency: "Currency",
      ref_safes: "Ref Sales",
      from_agoda: "From Agoda",
      to_agoda: "To Agoda",
      from_customer: "from Customner",
      to_hotel: "To Hotel",
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
    case actions.FETCH_SUCCESS_OTA:
      return {
        ...state,
        ...payload,
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
