import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { debounce } from "lodash";
import { Layout } from "antd";

import authAction from "../../redux/auth/actions";
import appActions from "../../redux/app/actions";
// import lockerActions from "../../redux/locker/actions";
import { initServerEventListener } from "../../redux/boot";

import Topbar from "../Topbar";
import AppRouter from "./AppRouter";
import AppHolder from "./commonStyle";
import Footer from "../Footer";

const { Content } = Layout;

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(authAction.getRoutes());
    // dispatch(lockerActions.checkLocker());
    initServerEventListener();

    const toggleResize = debounce(e => {
      dispatch(
        appActions.toggleAll({
          windowWidth: e.target.innerWidth,
          windowHeight: e.target.innerHeight,
        })
      );
    }, 700);
    window.addEventListener("resize", toggleResize);

    return () => {
      window.removeEventListener("resize", toggleResize);
    };
  }, []); // eslint-disable-line

  return (
    <AppHolder>
      <Layout>
        <Topbar />
        <Layout className="cz-main-layout">
          <Content className="cz-content">
            <AppRouter />
          </Content>
        </Layout>
      </Layout>
      <Footer />
    </AppHolder>
  );
}

export default React.memo(App);
