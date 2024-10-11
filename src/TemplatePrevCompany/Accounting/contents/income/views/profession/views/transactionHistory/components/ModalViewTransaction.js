import _ from "lodash";
import styled from "styled-components";
import { useEffect, useState } from "react";
import { Col, Divider, Form, Modal, Row, Spin, Tooltip } from "antd";

import client from "@helpers/client";
import { Box } from "@components/utility/styles";

import * as dataTable from "../tables/renderCol";
import { InfoCircleOutlined } from "@ant-design/icons";

const ModalViewTransaction = ({ onToggle, id, dataModal, ...props }) => {
  const [state, setState] = useState({
    data: {},
    loading: false,
  });

  const getDate = async () => {
    setState(prev => ({ ...prev, loading: true }));
    if (!dataModal) {
      const { error_code, data } = await client().get(`/finance/booking/charge/report/transactions/${id}`);
      if (error_code === 0) {
        setState(prev => ({ ...prev, data: _.get(data, "data", {}) }));
      }
    } else {
      setState(prev => ({ ...prev, data: dataModal }));
    }
    setState(prev => ({ ...prev, loading: false }));
  };

  useEffect(() => {
    getDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tooltipLabel = (label, text) => (
    <Tooltip title={text} placement="top">
      <Box flex justify="flex-start" alignItem="center" gap={5}>
        {label}
        <InfoCircleOutlined />
      </Box>
    </Tooltip>
  );

  const amountLabel = tooltipLabel("Amount", "This is inclusive of the Surcharge applied by the accommodation");
  const surchargeLabel = tooltipLabel(
    "Amount",
    "Surcharge fee set by accommodation for processing payment from Booking Engine > Hotel Link Pay > Payment Methods > Surcharge."
  );
  const estimateTaxAmountLabel = tooltipLabel("Estimate Tax Amount", "Calculated by Kovena system.");

  return (
    <CsModal open={true} onCancel={onToggle} title="Details" footer={null}>
      <Spin spinning={state.loading}>
        <Box>
          <Row>
            <Box fontSize="13px" color="#000">
              Transaction Details
            </Box>
            <RenderCol label="Transaction ID" value={_.get(state.data, "id")} />
            <RenderCol label="Charge ID" value={_.get(state.data, "charge.id")} />
            <RenderCol label="Reference No." value={_.get(state.data, "charge.reference")} />
            <RenderCol label="Merchant Name" value={_.get(state.data, "merchant_name")} />
            <RenderCol label="Source" value={_.get(state.data, "")} />
            <RenderCol label="Type" value={_.get(state.data, "transaction_type")} />
            <RenderCol label="Status" value={_.get(state.data, "transaction_status")} />
            <RenderCol label="Created On" value={dataTable.convertDate(_.get(state.data, "created_at"))} />
            <RenderCol label={amountLabel} value={dataTable.renderAmount(_.get(state.data, "amount"))} />
            <RenderCol label={surchargeLabel} value={dataTable.renderAmount(_.get(state.data, "surcharge_amount"))} />
            <RenderCol label="Original Amount" value={dataTable.renderAmount(_.get(state.data, "original_amount"))} />
            <RenderCol label="Channel" value={_.get(state.data, "transaction_channel")} />
            <RenderCol label={estimateTaxAmountLabel} value={_.get(state.data, "")} />
            <Divider style={{ margin: 0, marginBottom: 5 }} />
            <Box fontSize="13px" color="#000">
              Customer Details
            </Box>
            <RenderCol label="Card Name" value={_.get(state.data, "charge.card_holder")} />
            <RenderCol label="Last 4 Digits" value={_.get(state.data, "")} />
            <RenderCol label="Card Type" value={_.get(state.data, "charge.type")} />
            <RenderCol label="Expire Date" value={dataTable.convertDate(_.get(state.data, "expire_date"))} />
            <Divider style={{ margin: 0, marginBottom: 5 }} />
            <Box fontSize="13px" color="#000">
              Booking Details
            </Box>
            <RenderCol label="Booking Number" value={_.get(state.data, "bk_id")} />
            <RenderCol label="Booking Date" value={dataTable.convertDate(_.get(state.data, "bk_date"))} />
            <RenderCol label="Check-in Date" value={dataTable.convertDate(_.get(state.data, "bk_check_in"))} />
            <RenderCol label="Check-out Date" value={dataTable.convertDate(_.get(state.data, "bk_check_out"))} />
            <RenderCol label="Guest Name" value={_.get(state.data, "guest_name")} />
          </Row>
        </Box>
      </Spin>
    </CsModal>
  );
};

const RenderCol = ({ label, value }) => {
  return (
    <Col xs={24}>
      <Form.Item labelCol={{ span: 8 }} labelAlign="left" style={{ marginBottom: 0 }} label={label}>
        {value}
      </Form.Item>
    </Col>
  );
};

const CsModal = styled(Modal)`
  .ant-modal-body {
    padding: 5px 24px;
  }
`;

export default ModalViewTransaction;
