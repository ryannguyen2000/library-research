import { useState } from "react";
import { DownCircleOutlined } from "@ant-design/icons";

import client from "@helpers/client";
import { saveAs } from "file-saver";
import { getFileNameByHeader } from "@helpers/utility";

import { CsButton } from "./btnConform";

const BtnDownFile = ({ id }) => {
  const [isLoading, setIsLoading] = useState(false);

  const getDownFile = async () => {
    setIsLoading(true);
    try {
      const response = await client().get(`/payment/pay/request/${id}/fileBulk`, {
        responseType: "blob",
      });
      if (response.data instanceof Blob) {
        saveAs(response.data, getFileNameByHeader(response.headers));
      }
    } catch (error) {}
    setIsLoading(false);
  };

  return (
    <CsButton icon={<DownCircleOutlined />} loading={isLoading} type="text" onClick={getDownFile}>
      Download
    </CsButton>
  );
};

export default BtnDownFile;
