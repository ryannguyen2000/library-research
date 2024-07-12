import { createBrowserRouter } from "react-router-dom";
import { Empty } from "antd";

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
        element: <AntDesign />,
      },
      {
        path: "/material",
        element: <MaterialUI />,
      },
      {
        path: "/signin",
        element: <Empty />,
      },
      {
        path: "/signup",
        element: <Empty />,
      },
    ],
  },
]);

export default router;
