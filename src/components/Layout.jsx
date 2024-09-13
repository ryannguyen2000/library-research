import styled from "styled-components";
import { Outlet } from "react-router-dom";
import { Menus, MenusRight } from "../routes/menus";
import { Box } from "./styles";

const stones = [
  "stone_1",
  "stone_2",
  "stone_3",
  "stone_4",
  "stone_5",
  "stone_6",
  "stone_7",
  "stone_8",
  "stone_9",
];

function Layout() {
  return (
    <Container className="w-full">
      <Background>
        {_.map(stones, (s) => (
          <StoneAnimation className={s} src={`/images/background/${s}.png`} />
        ))}
      </Background>
      <Wrap>
        <Box flex gap={20} width="auto">
          <Logo>
            <img className="logo" src="/images/koi_1.png" />
            <div className="logo-text" width="auto">
              HuHuHaHa
            </div>
          </Logo>
          <Menus />
        </Box>
        <MenusRight />
      </Wrap>
      <main>
        <Outlet />
      </main>
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  width: 100%;
  height: 100vh;
`;

const Wrap = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const Logo = styled.div`
  z-index: 99;
  display: flex;
  gap: 3;
  align-items: center;
  justify-content: center;
  .logo {
    width: 100px;
  }
`;

const Background = styled.div`
  position: absolute;
  background-image: url("/images/background/background_home.png");
  background-position: center;
  background-size: 100%;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  right: 0;
  @media screen and (max-width: 1600px) {
    background-position: center;
  }

  .stone_1 {
    position: absolute;
    top: 50%;
    right: 10%;
  }
  .stone_2 {
    position: absolute;
    top: 20%;
    right: 0;
    width: 175px;
  }
  .stone_3 {
    position: absolute;
    top: 50%;
    right: 0%;
  }
  .stone_4 {
    position: absolute;
    top: 70%;
    right: 3%;
  }
  .stone_5 {
    position: absolute;
    top: 60%;
    right: 8%;
  }
  .stone_6 {
    position: absolute;
    top: 50%;
    right: 5%;
  }
  .stone_7 {
    position: absolute;
    top: 55%;
    left: 43%;
  }
  .stone_8 {
    position: absolute;
    top: 20%;
    left: 10%;
  }
  .stone_9 {
    position: absolute;
    top: 40%;
    left: 0%;
  }
`;

const StoneAnimation = styled.img``;

export default Layout;
