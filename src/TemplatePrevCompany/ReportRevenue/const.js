import moment from "moment";

import Financials from "./container/financials";
import CustomerAcquisition from "./container/customerAcquisition";
import UnitEconomics from "./container/unitEconomics";
import OperatingMetric from "./container/operatingMetric";
import IconParentMenu from "./image";

export const CUSTOM_PREFIX = "custom-menu";

export const parentRoutes = () => {
  return [
    {
      to: "finalcials",
      icon: <IconParentMenu name="home" />,
      element: Financials,
    },
    {
      to: "operating_metric",
      icon: <IconParentMenu name="chronic" />,
      element: OperatingMetric,
    },
    {
      to: "customer_acquisition",
      icon: <IconParentMenu name="filter" />,
      element: CustomerAcquisition,
      disabled: true,
    },
    {
      to: "unit_ecomnomics",
      icon: <IconParentMenu name="chart" />,
      element: UnitEconomics,
      disabled: true,
    },
  ]
}

export const pickTimeForToFrom = timelineType => {
  let from = undefined;
  let to = undefined;

  if (timelineType) {
    from = moment().startOf("month").format("Y-MM-DD");
    to = moment().endOf("month").format("Y-MM-DD");

    switch (timelineType) {
      case "WEEKLY":
        to = moment().endOf("month").format("Y-MM-DD");
        break;
      case "MONTHLY":
        from = moment().startOf("year").format("Y-MM-DD")
        to = moment().endOf("months").format("Y-MM-DD")
        break;
      case "QUARTERLY":
        from = moment().subtract(2, "Q").startOf("Q").format("Y-MM-DD")
        to = moment().endOf('Q').format("Y-MM-DD")
        break;
      case "YEARLY":
        from = moment().subtract(1, "years").startOf("year").format("Y-MM-DD");
        to = moment().endOf("year").format("Y-MM-DD");
        break;
      default:
        break;
    }
  }
  return { from, to };
};

export const FOOTER_SIZE_BAR_CHART = {
  "DAILY": 10,
  "WEEKLY": 40,
  "MONTHLY": 15,
  "QUARTERLY": 15,
  "YEARLY": 10
}

export const LEFT_SIZE_BAR_CHART = {
  "DAILY": 20,
  "WEEKLY": 40,
  "MONTHLY": 40,
  "QUARTERLY": 45,
  "YEARLY": 45
}