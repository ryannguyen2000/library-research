import { createContext } from "react";

export const dataModalNewExpense = {
  open: false,
  data: {},
  setState: () => {},
};

export const ModalContextNewExpense = createContext(dataModalNewExpense);
