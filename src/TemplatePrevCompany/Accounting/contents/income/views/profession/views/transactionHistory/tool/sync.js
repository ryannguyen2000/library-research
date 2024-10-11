import React, { useState } from "react";
import { SyncOutlined } from "@ant-design/icons";
import queryString from "query-string";
import moment from "moment";
import client from "@helpers/client";
import apiUrl from "@settings";
import { HeaderButton } from "@components/page/headerComponent";

const Sync = ({ refresh }) => {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    const query = queryString.parse(window.location.search);
    const from = moment(query.from, "Y-MM").startOf("month").toISOString();
    const to = moment(query.to, "Y-MM").endOf("month").toISOString();

    setLoading(true);
    await client(true).post(`${apiUrl}/finance/fetch?from=${from}&to=${to}`);
    setLoading(false);
    refresh();
  };

  return (
    <HeaderButton onClick={handleSync} disabled={loading} style={{ marginRight: 12 }}>
      <SyncOutlined spin={loading} />
      {loading ? "SYNCHRONIZING..." : "SYNC"}
    </HeaderButton>
  );
};

export default Sync;
