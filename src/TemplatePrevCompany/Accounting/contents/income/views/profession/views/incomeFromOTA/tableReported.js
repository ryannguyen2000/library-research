import _ from "lodash";
import { Row, Col } from "antd";
import styled from "styled-components";

import Box from "@components/utility/box";
import { Label, Box as WrapFlex } from "@components/utility/styles";
import Table from "@components/tables/table.style";
import IntlMessages from "@components/utility/intlMessages";
import { useHouse } from "@hooks/categories";
import { PAYOUT_TYPES } from "@settings/const";
import { minFormatMoney } from "@helpers/utility";
import CardInfo from "@containers/Finance/reportPayin/tool/cardInfo";

import { renderTime } from "./renderCol";

export const formatPrice = (amount = 0, currency = "") => {
  return (
    <div className={`w-100 ${amount >= 0 ? "text-green" : "text-red"}`}>
      {amount === 0 ? "0" : `${minFormatMoney(amount || "")}`}&nbsp;{`${currency === "VND" ? "VND" : currency}`}
    </div>
  );
};

const ExpandedRowReportRender = ({ dataRes, dataReq, columns }) => {
  const [house] = useHouse();

  const reportInfo = _.get(dataRes, "dataReport.report");
  const cardInfo = _.get(dataRes, "dataReport.cards[0]");
  const isTitleTable = Boolean(!_.isEmpty(reportInfo) || !_.isEmpty(cardInfo));

  const nameHouses = _.map(_.get(reportInfo, "blockIds"), blockId => {
    const matchingObject = _.find(_.get(house, "data"), obj => obj._id === blockId);
    return matchingObject ? matchingObject.info.name : null;
  });

  const renderReportInfo = reportInfo
    ? [
        {
          title: "noId",
          content: _.get(reportInfo, "noId"),
        },
        {
          title: "Nhà",
          content: _.map(nameHouses, (item, index) => <span key={index}>{item}</span>),
        },
        {
          title: "Số tiền",
          content: Object.entries(_.get(reportInfo, "currencyAmount")).map(([key, value]) => (
            <WrapFlex flex gap={5} key={key}>
              {formatPrice(value, key)}
            </WrapFlex>
          )),
        },
        {
          title: "Phí thanh toán",
          type: "number",
          content: formatPrice(_.get(reportInfo, "totalTransactionFee")),
        },
        {
          title: "Khoản thu",
          content: _.get(reportInfo, "payoutType") ? (
            <IntlMessages id={PAYOUT_TYPES[_.get(reportInfo, "payoutType")].name} />
          ) : (
            ""
          ),
        },
        {
          title: "Ngày báo cáo",
          content: renderTime(_.get(reportInfo, "createdAt")),
        },
      ]
    : [];

  return (
    <Box style={{ border: "none", position: "relative", minHeight: 100 }}>
      <Table
        rowKey="id"
        bordered
        columns={columns}
        loading={dataRes.isLoadingPosted}
        rowClassName={"custom-row-class"}
        dataSource={dataReq || []}
        title={
          isTitleTable
            ? () => {
                return (
                  <WrapFlex>
                    <Row gutter={[5, 5]}>
                      {reportInfo && (
                        <Col xs={24} md={cardInfo ? 12 : 24}>
                          {_.map(renderReportInfo, (item, index) => (
                            <Col xs={cardInfo ? 24 : 8} key={index}>
                              <WrapFlex flex gap={5} mb={5}>
                                <Label style={{ minWidth: "110px" }} fw={500} fontSize={15} color="rgba(0, 0, 0, 0.85)">
                                  {item.title}:
                                </Label>
                                <Content style={item.type === "number" ? { color: "#5aae66" } : {}}>
                                  {item.content}
                                </Content>
                              </WrapFlex>
                            </Col>
                          ))}
                        </Col>
                      )}
                      {!_.isEmpty(cardInfo) && (
                        <Col xs={24} md={12}>
                          <CardInfo cardInfo={cardInfo} />
                        </Col>
                      )}
                    </Row>
                  </WrapFlex>
                );
              }
            : null
        }
        scroll={{
          x: "max-content",
        }}
        pagination={false}
      />
    </Box>
  );
};

const Content = styled.div`
  font-size: 15px;
  min-width: 80px;
`;

export default ExpandedRowReportRender;
