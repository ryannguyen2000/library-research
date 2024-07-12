// Layout.js
import React from "react";
import { Outlet } from "react-router-dom";
import Menus from "../routes/menus";

function Layout() {
  return (
    <div>
      <Menus />
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
