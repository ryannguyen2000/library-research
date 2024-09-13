import Square from "@assets/animations/Square";
import { Box } from "@components/styles";
import { Button } from "antd";
import styled from "styled-components";

const Home = () => {
  return (
    <HomeContainer>
      <Square bottom={0} left="45%" />
    </HomeContainer>
  );
};

const HomeContainer = styled(Box)`
  position: relative;
  height: 100%;
  overflow: hidden;
`;

export default Home;
