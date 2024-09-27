"use client";

import Image from "next/image";
import Link from "next/link";
import styled from "styled-components";
import { ButtonGetOut, ButtonHome } from "./styles";

const MenuComponent = () => {
  return (
    <div className="flex w-full h-[80px] pl-[15px] pr-[15px]">
      <div className="flex h-full gap-2">
        <div className="z-99 flex gap-[3px] items-center justify-center">
          <Image
            width={100}
            height={100}
            className="logo"
            alt="koi"
            src="/images/koi_1.png"
          />
          <div className="logo-text">Bao</div>
        </div>
      </div>
      <div className="w-full h-full flex items-center ml-10 justify-between">
        <div className="">
          <ButtonHome>Home</ButtonHome>
        </div>
        <div className="">
          <ButtonGetOut>Get Out</ButtonGetOut>
        </div>
      </div>
    </div>
  );
};

export default MenuComponent;
