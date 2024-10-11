import { CloseCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { minFormatMoney } from "@helpers/utility";
import { Button, Input, Space } from "antd";
import _ from "lodash";
import moment from "moment";
import { Link } from "react-router-dom";

export const formatPrice = (amount = 0, currency = "") => {
  return (
    <div className={`w-100 text-right ${amount >= 0 ? "text-green" : "text-red"}`}>{`${minFormatMoney(amount || "")} ${
      currency === "VND" ? "" : currency
    }`}</div>
  );
};

export const status = {
  processing: <span className="text-warn">Chưa duyệt</span>,
  confirmed: <span className="text-blue">Đã duyệt</span>,
  deleted: <span className="text-red">Đã xoá</span>,
};

export const statusExport = {
  processing: "Chưa duyệt",
  confirmed: "Đã duyệt",
  deleted: "Đã xoá",
};

export const sortExchangedAmount = ({ currencyAmount: a }, { currencyAmount: b }) => {
  return a.exchangedAmount - b.exchangedAmount;
};

export const sortAmount = ({ amount: a }, { amount: b }) => {
  return a - b;
};

export const sortCurrencyAmount = ({ amount: a }, { amount: b }) => {
  return a.amount - b.amount;
};

export const sortDtExchangedAmount = ({ currencyAmount: a }, { currencyAmount: b }) => {
  return a.dtExchangedAmount - b.dtExchangedAmount;
};

export const sortTransactionFee = (a, b) => {
  return a.transactionFee - b.transactionFee;
};

export const sortDtTransactionFee = (a, b) => {
  return a.dtTransactionFee - b.dtTransactionFee;
};

export const sorterCreatedAt = ({ paidAt: a }, { paidAt: b }) => {
  return a && b ? (a > b ? 1 : -1) : 0;
};

export const sorterCheckin = ({ a, b }, mapData) => {
  const toA = _.get(_.get(mapData.bookings, a), "to");
  const toB = _.get(_.get(mapData.bookings, b), "to");
  return toA && toB ? (toA > toB ? 1 : -1) : 0;
};

export const sorterCheckout = ({ a, b }, mapData) => {
  const fromA = _.get(_.get(mapData.bookings, a), "to");
  const fromB = _.get(_.get(mapData.bookings, b), "to");
  return fromA && fromB ? (fromA > fromB ? 1 : -1) : 0;
};

export const renderAmount = data => {
  if (data && data.amount) {
    const { amount, currency } = data;
    return formatPrice(amount, currency);
  }
  return "";
};

export const renderCheckout = (data, mapData) => {
  const to = _.get(_.get(mapData.bookings, data), "to");
  return to ? moment(to).format("DD/MM/Y") : "";
};

export const renderCheckin = (data, mapData) => {
  const from = _.get(_.get(mapData.bookings, data), "from");
  return from ? moment(from).format("DD/MM/Y") : "";
};

export const renderCreatedBy = data => {
  return data ? data.name || data.username : "";
};

export const renderCollector = (data, row) => {
  if (data) {
    return data.name || data.username;
  }
  return row.collectorCustomName || "";
};

export const renderState = data => {
  return data ? status[data] : "";
};

export const getColumnSearchProps = (dataIndex, setState, state, searchInput) => {
  const handleChangeParams = (selectedKeys, dataIndex) => {
    setState(prev => ({ ...prev, [dataIndex]: selectedKeys[0] }));
  };

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    handleChangeParams(selectedKeys, dataIndex);
  };

  const handleReset = (clearFilters, dataIndex) => {
    clearFilters();
    setState(prev => ({ ...prev, [dataIndex]: "" }));
    handleChangeParams([], dataIndex);
  };

  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div
        style={{ padding: "14px 20px", display: "flex", gap: "5px", flexDirection: "column" }}
        onKeyDown={e => e.stopPropagation()}
      >
        <Input
          ref={searchInput}
          placeholder={`Tìm kiếm`}
          value={state[dataIndex]}
          onChange={e => {
            setState({ [dataIndex]: e.target.value });
            setSelectedKeys(e.target.value ? [e.target.value] : []);
            const valueString = [e.target.value.toString()];
            handleChangeParams(valueString, dataIndex);
          }}
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
        />
        <Space style={{ height: "100%", display: "flex" }}>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            style={{
              width: 80,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Search
          </Button>
          <Button
            onClick={() => handleReset(clearFilters, dataIndex)}
            size="small"
            style={{ width: 80, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <CloseCircleOutlined />
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: <SearchOutlined className={dataIndex ? "text-blue" : ""} />,
    // onFilterDropdownVisibleChange: toggleGuestSearch,
  };
};

export const renderExportNo = data => {
  return data ? <Link to={`/finance/reports-payout/${data._id}`}>{data.noId}</Link> : "";
};
