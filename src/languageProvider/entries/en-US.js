import moment from "moment";
import antdEn from "antd/es/locale/en_US";
// import appLocaleData from "react-intl/locale-data/en";
import messages from "../locales/en_US.json";

moment.locale("en-US", {
  week: {
    dow: 1,
  },
});

const EnLang = {
  messages,
  antd: antdEn,
  locale: "en-US",
  // data: appLocaleData
};

export default EnLang;
