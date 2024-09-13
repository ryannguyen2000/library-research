import { Box } from "@components/styles";
import { Button } from "antd";
import styled from "styled-components";

const Home = () => {
  return (
    <CsBox>
      <Box>INTRODUCING pibridge</Box>
      <Box>Together we build Pi's world</Box>
      <Box>
        <Button type="default">involve airdrop</Button>
      </Box>
    </CsBox>
  );
};

const CsBox = styled(Box)`
  position: absolute;
  bottom: 10%;
  left: 50%;
  z-index: 99;
`;

export default Home;
