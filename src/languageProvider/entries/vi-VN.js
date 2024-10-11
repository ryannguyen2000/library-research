import moment from "moment";
import antdVi from "antd/es/locale/vi_VN";
// import appLocaleData from 'react-intl/locale-data/vi';
import messages from "../locales/vi_VN.json";

moment.locale("vi-VN", {
  week: {
    dow: 1,
  },
});

const ViLang = {
  messages,
  antd: antdVi,
  locale: "vi-VN",
  // data: appLocaleData,
};

export default ViLang;
