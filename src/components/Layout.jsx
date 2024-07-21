import styled from "styled-components";
import { Outlet } from "react-router-dom";
import { Menus, MenusRight } from "../routes/menus";

function Layout() {
  return (
    <div className="w-full">
      <Wrap>
        <Menus />
        <MenusRight />
      </Wrap>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const Wrap = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
`;

export default Layout;
