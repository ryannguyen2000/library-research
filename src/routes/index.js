import { createBrowserRouter } from "react-router-dom";

import TailWindCompo from "@page/tailwindCompo";
import ReactFlowContain from "@page/reactFlow";
import SignIn from "@page/auth/signIn";
import SignUp from "@page/auth/signUp";
import Account from "@page/auth/account";
import NotFoundPage from "@page/404";
import Home from "@page/home";

import AntDesign from "../page/antDesign";
import MaterialUI from "../page/material";
import Layout from "../components/Layout";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/ant-design",
        element: <AntDesign />,
      },
      {
        path: "/material",
        element: <MaterialUI />,
      },
      {
        path: "/tailwind",
        element: <TailWindCompo />,
      },
      {
        path: "/react-flow",
        element: <ReactFlowContain />,
      },
      {
        path: "/sign-in",
        element: <SignIn />,
      },
      {
        path: "/sign-up",
        element: <SignUp />,
      },
      {
        path: "/account-info",
        element: <Account />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);

export default router;
