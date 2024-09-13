import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Provider } from "react-redux";

import "./index.css";
import App from "./App";
import store from "./redux/store";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ConfigProvider theme={{ token: { colorPrimary: "#00b96b" } }}>
    <Provider store={store}>
      <GoogleOAuthProvider clientId="747304224211-h3khtjo70s4ok52pka0eepmnioqgpnqc.apps.googleusercontent.com">
        <App />
      </GoogleOAuthProvider>
    </Provider>
  </ConfigProvider>
);
