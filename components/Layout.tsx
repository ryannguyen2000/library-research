"use client";

import styled from "styled-components";
import { motion } from "framer-motion";
import _ from "lodash";
import { Container } from "./styles";

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

const stonesAnimation: any = {
  stone_1: { y: [0, -5, 0] },
  stone_2: { y: [0, 0, 0] },
  stone_3: { y: [0, -9, 0] },
  stone_4: { y: [0, -11, 0], x: [0, 20, 0] },
  stone_5: { y: [0, -13, 0] },
  stone_6: { y: [0, -15, 0] },
  stone_7: { y: [0, -30, 0] },
  stone_8: { y: [0, -19, 0] },
  stone_9: { y: [0, -21, 0] },
};

const srcCircle = `/images/background/circle1.png`;

function LayoutComponent({ children }: any) {
  return (
    <Container>
      <Background>
        <CircleAnimation
          className="circle"
          src={srcCircle}
          initial={{ y: 0, x: 0 }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 10, repeat: Infinity, repeatType: "loop" }}
        />

        {_.map(stones, (s: any) => (
          <StoneAnimation
            key={s}
            className={s}
            src={`/images/background/${s}.png`}
            initial={{ y: 0, x: 0 }}
            animate={stonesAnimation[s]}
            transition={{ duration: 10, repeat: Infinity, repeatType: "loop" }}
          />
        ))}
      </Background>
      {children}
    </Container>
  );
}

const Background = styled.div`
  position: absolute;
  background-image: url("/images/background/background_home.png");
  background-position: center;
  background-size: 100%;
  background-attachment: fixed;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  right: 0;
  z-index: -1;
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

  .circle {
    width: 200px;
  }
`;

const StoneAnimation = styled(motion.img)``;

const CircleAnimation = styled(motion.img)`
  position: absolute;
  top: 0;
  left: 65%;
`;

export default LayoutComponent;
