import { PAYMENT_CARD_STATUS, PAYMENT_CHARGED_STATUS } from "@settings/const";

export function getCardStatusClass(status) {
  switch (status) {
    case PAYMENT_CARD_STATUS.no_info.value:
      return "text-warn";

    case PAYMENT_CARD_STATUS.unknown.value:
      return "text-blue";

    case PAYMENT_CARD_STATUS.invalid.value:
      return "text-red";

    case PAYMENT_CARD_STATUS.valid.value:
      return "text-green";

    default:
      return "";
  }
}

export function getChargedStatusClass(status) {
  switch (status) {
    case PAYMENT_CHARGED_STATUS.error.value:
      return "text-red";

    case PAYMENT_CHARGED_STATUS.charged.value:
      return "text-green";

    case PAYMENT_CHARGED_STATUS.need_to_charge.value:
      return "text-warn";

    default:
      return "";
  }
}
