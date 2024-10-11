import _ from "lodash"
import styled from "styled-components"

import { formatter } from "@helpers/utility";

// function tickFormatter(value) {
//   let formatMoney = 0;
//   if (value < 1000000) {
//     formatMoney = value ? value / 1000 + " K" : value;
//   }
//   if (1000000 < value && value < 1000000000) {
//     formatMoney = value ? value / 1000000 + " M" : value;
//   }
//   if (value >= 1000000000) {
//     formatMoney = value ? value / 1000000000 + " B" : value;
//   }

//   return formatMoney;
// }

export const ColMoney = ({ money, currency, style }) => {
  // const colorText = money > 1000000000 ? "orange" : "";
  const isTextBold = _.get(style, "bold") ? "bold" : ""
  return (
    <WrapText style={{ fontWeight: isTextBold, color: _.get(style, "color") }}>
      {formatter(money)}
    </WrapText>
  );
};

const WrapText = styled.div`
  display: flex;
  justify-content: flex-end;
`
