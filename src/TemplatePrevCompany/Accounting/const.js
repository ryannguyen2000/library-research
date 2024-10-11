import moment from "moment";

export const GUTTER = 15;

export const limit = 10;

export const ranges = {
  "hôm nay": [moment(), moment()],
  "Tuần này": [moment().startOf("isoWeek"), moment().endOf("isoWeek")],
  "Tháng này": [moment().startOf("month"), moment().endOf("month")],
};

export const formatDateTime = dateTime => {
  return dateTime
    ? new Date(dateTime)
        .toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        .replace(/(\d{2}:\d{2}:\d{2}) (\d{2}\/\d{2}\/\d{4})/, "$1, ngày $2")
    : "";
};

export const swipeStatusOptions = {
  error: { value: "error", name: "Lỗi" },
  swiped: { value: "swiped", name: "Đã cà" },
  unswiped: { value: "unswiped", name: "Chưa cà" },
};

export const changeStateSort = ({ state, setState, dataIndex, changeParamsSort}) => {
  if (state.sort === dataIndex) {
    if (state.sortType === null) {
      const sortType = "asc";
      setState(prevState => ({
        ...prevState,
        sortType,
      }));
      changeParamsSort(state.sort, sortType);
    } else if (state.sortType === "asc") {
      const sortType = "desc";
      setState(prevState => ({
        ...prevState,
        sortType: "desc",
      }));
      changeParamsSort(state.sort, sortType);
    } else if (state.sortType === "desc") {
      setState(prevState => ({
        ...prevState,
        sort: null,
        sortType: null,
      }));
      changeParamsSort(state.sort, null);
    }
  } else {
    setState({
      sort: dataIndex,
      sortType: "asc",
    });
    changeParamsSort(dataIndex, "asc");
  }
};
