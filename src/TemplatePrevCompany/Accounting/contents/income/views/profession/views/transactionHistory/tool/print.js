import React from "react";
import { renderToString } from "react-dom/server";
import { PrinterOutlined } from "@ant-design/icons";
import Logo from "@components/ottIcon/cozrum";

function RenderPrint({ data, genereData, columns, columnReferences, intl: { formatMessage: t }, dateRange }) {
  const now = new Date();

  const header = columns.task.map(c => <th key={c}>{t({ id: columnReferences.task[c] })}</th>);
  const rows = [];
  data.forEach((row, index) => {
    const temps = genereData(row, index);
    rows.push(
      <tr key={row._id}>
        <td className="text-center">{index + 1}</td>
        {columns.task.map(c => (
          <td key={c}>{temps[c]}</td>
        ))}
      </tr>
    );
  });

  return (
    <div>
      <div />
      <div style={{ width: 100, position: "absolute" }}>
        <Logo />
      </div>
      <h3
        style={{
          fontWeight: "bold",
          fontSize: 16,
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 7,
          marginTop: 0,
          lineHeight: "30px",
        }}
      >
        {`DANH SÁCH NHIỆM VỤ ${
          dateRange.length > 0 ? `${dateRange[0].format("DD/MM/Y")} - ${dateRange[1].format("DD/MM/Y")}` : ""
        }`}
      </h3>
      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>STT</th>
            {header}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <div className="footer">
        <div />
        <div />
        <div />
        <div style={{ fontWeight: 400 }}>{`TP HCM, ngày ${now.getDate()} tháng ${
          now.getMonth() + 1
        } năm ${now.getFullYear()}`}</div>
      </div>
    </div>
  );
}

const Printer = props => {
  const handlePrint = () => {
    const newWindow = window.open();
    newWindow.document.write(`
      <meta charset="utf-8">
      <style type="text/css">
        body {
          font-size: 13px;
          line-height: 1.5;
        }
        p {
          margin-top: 0px;
          margin-bottom: 3px;
        }
        img {
          width: 50px;
        }
        table {
          font-size: 13px;
          width: 100%;
          margin-top: 10px;
          border-collapse: collapse;
        }
        table, th, td {
          border: 1px solid black;
          padding: 2px 3px;
        }
        thead > tr {
          height: 40px;
        } 
        .text-center {
          text-align: center;
        }
        .footer {
          width: 100%;
          display: inline-flex;
          margin-top: 10px;
        }
        .footer > div {
          width: 25%;
          text-align: center;   
        }
      </style>
    ${renderToString(<RenderPrint {...props} />)}`);
    newWindow.print();
    newWindow.close();
  };

  return (
    <div className="export-item" onClick={handlePrint}>
      <PrinterOutlined /> Print
    </div>
  );
};

export default Printer;
