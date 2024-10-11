// import { useSelector, useDispatch } from "react-redux";
import { memo, useState, useEffect } from "react";
import _ from "lodash";

import { useData } from "@hooks/data";
import { emitter, events } from "@helpers/eventEmitter";

import TopBarContainer from "@containers/Accounting/container/TopBarContainer";
import Box from "@components/utility/box";

import ToolFilter from "./toolFilter";
import TableData from "./table";

const Booking = props => {
  const { query } = props;

  const [version, setVersion] = useState(1);

  const page = parseInt(_.get(query, "page")) || 1;
  const pageSize = parseInt(_.get(query, "pageSize")) || 10;

  const {
    bookings,
    total,
    loading,
    fetch: refresh,
  } = useData(`/finance/booking/charge/list`, {
    start: (page - 1) * pageSize,
    limit: pageSize,
    status: query.status,
    otaBookingId: query.otaBookingId,
    cardStatus: query.cardStatus,
    chargedStatus: query.chargedStatus,
    blockId: query.home,
    excludeBlockId: query.excludeBlockId,
    v: version,
  });

  useEffect(() => {
    const onEvent = _.throttle(() => {
      setVersion(v => v + 1);
    }, 500);

    emitter.addListener(events.BOOKING_CHARGED_STATUS_UPDATE, onEvent);

    return () => {
      emitter.removeAllListeners(events.BOOKING_CHARGED_STATUS_UPDATE);
    };
  }, []);

  return (
    <div>
      <TopBarContainer toolFilterNode={<ToolFilter {...props} refresh={refresh} />} nonTitle />
      <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
        <TableData
          {...props}
          refresh={refresh}
          data={bookings || []}
          total={total}
          loading={loading}
          page={page}
          pageSize={pageSize}
        />
      </Box>
    </div>
  );
};

export default memo(Booking);
