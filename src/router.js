import { BrowserRouter, Route, Navigate, Routes, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import asyncComponent from "./helpers/AsyncFunc";

import "./containers/App/global.scss";

const Signin = asyncComponent(() => import("./containers/Page/signin"));
const Forgot = asyncComponent(() => import("./containers/Page/forgotPassword"));
const App = asyncComponent(() => import("./containers/App/App"));

function RestrictedRoute() {
  const isLoggedIn = useSelector(state => !!state.Auth.idToken);
  const location = useLocation();

  if (isLoggedIn) return <App />;

  return <Navigate to="/signin" state={{ from: location }} />;
}

function PublicRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<Signin />} />
        <Route path="/forgotpassword" element={<Forgot />} />
        <Route path="/*" element={<RestrictedRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default PublicRoutes;
