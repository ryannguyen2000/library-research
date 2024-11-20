"use client";

import ModalAnt from "@/components/modalAnt";
import { useState } from "react";

const Page = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <div className="p-10 flex flex-col gap-5">
      <div>Page Login</div>
      <div>
        <button onClick={() => setIsOpen(true)}>Open Modal Ant</button>
        <ModalAnt isOpen={isOpen} setIsOpen={setIsOpen} />
      </div>
    </div>
  );
};

export default Page;
