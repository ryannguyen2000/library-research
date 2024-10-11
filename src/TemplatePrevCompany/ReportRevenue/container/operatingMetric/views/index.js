import { Box } from "@components/utility/styles";
import ADR from "./adr";
import BookingWindows from "./bookingWindows";
import Occupancy from "./occupancy";
import BookingTransaction from "./bookingTransaction";
import GMV from "./gmv";
import ALOS from "./alos";

const components = {
  adr: ADR,
  booking_windows: BookingWindows,
  occupancy: Occupancy,
  booking_transaction: BookingTransaction,
  gmv: GMV,
  alos: ALOS,
};

const ContentRouterElement = props => {
  const { activeKey } = props;

  const Component = components[activeKey];

  return (
    <Box className="content" style={{ minHeight: "100vh", padding: 15 }}>
      <Component
        pathname={activeKey}
        {...props}
      />
    </Box>
  );
};

export default ContentRouterElement;
