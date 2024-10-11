import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import { Provider } from "react-redux";
import { currentLanguage } from "languageProvider/config";
import AppLocale from "languageProvider";
import App from "App";
import { IntlProvider } from "react-intl"

import { GoogleOAuthProvider } from "@react-oauth/google";

const { antd, locale, messages } = AppLocale[currentLanguage]

const DashApp = () => {
  return (
    <ConfigProvider locale={antd} theme={{ token: { colorPrimary: "#00b96b" } }}>
      <IntlProvider locale={locale} messages={messages}>
        <Provider store={store}>
          <GoogleOAuthProvider clientId="747304224211-h3khtjo70s4ok52pka0eepmnioqgpnqc.apps.googleusercontent.com">
            <App />
          </GoogleOAuthProvider>
        </Provider>
      </IntlProvider>
    </ConfigProvider>
  )
}

export default DashApp