import { Box } from "@components/utility/styles";
import { GUTTER } from "@containers/Accounting/const";
import { Row, Col } from "antd";
import styled from "styled-components";
import IntlMessages from "@components/utility/intlMessages";

const OrderDetail = () => {
  return (
    <Box>
      <Row gutter={GUTTER}>
        <Col md={24}>
          <Col md={24} lg={12}>
            <Flex>
              <IntlMessages id="transfer_object" />
              <span></span>
            </Flex>
          </Col>
          <Col md={24} lg={12}>
            <Flex>
              <IntlMessages id="receiving_object" />
              <span></span>
            </Flex>
          </Col>
          <Col md={24} lg={12}>
            <Flex>
              <IntlMessages id="receiving_method" />
              <span></span>
            </Flex>
          </Col>
          <Col md={24} lg={12}>
            <Flex>
              <IntlMessages id="received_at" />
              <span></span>
            </Flex>
          </Col>
          <Col md={24} lg={12}>
            <Flex>
              <IntlMessages id="executor" />
              <span></span>
            </Flex>
          </Col>
        </Col>
        <Col md={24}>
          <Box>
            <IntlMessages id="reservation_list" />
          </Box>
          <table style={{ margin: "10px 0px" }} border={1} width="100%">
            <thead>
              <tr>
                <th style={{ width: "15%" }}>STT</th>
                <th>
                  <IntlMessages id="id_res" />
                </th>
                <th>
                  <IntlMessages id="home" />
                </th>
                <th>
                  <IntlMessages id="room" />
                </th>
                <th>
                  <IntlMessages id="client_name" />
                </th>
                <th>
                  <IntlMessages id="checkin_day" />
                </th>
                <th>
                  <IntlMessages id="checkout_day" />
                </th>
                <th>
                  <IntlMessages id="revenue_VND" />
                </th>
                <th>
                  <IntlMessages id="income_type" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="currency" align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center"></td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
                <td className="amount" style={{ color: "#5aae66" }} align="center">
                  <ColTable></ColTable>
                </td>
              </tr>
            </tbody>
          </table>
        </Col>
      </Row>
    </Box>
  );
};

const Flex = styled.div`
  display: flex;
  gap: 5px;
`;

export const ColTable = styled.div`
  display: flex;
  flex-direction: column;
  margin: -1px;
  span {
    border-bottom: 1px solid rgba(0, 0, 0, 0.7);
    &:last-child {
      border-bottom: none;
    }
  }
`;

export default OrderDetail;
