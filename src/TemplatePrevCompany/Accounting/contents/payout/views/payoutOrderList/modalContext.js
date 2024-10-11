import { createContext } from "react";

export const dataModalOrderList = {
  open: false,
  data: {},
  setState: () => {}
};

export const ModalContextOrderList = createContext(dataModalOrderList);
