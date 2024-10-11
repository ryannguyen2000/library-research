import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { MinusCircleOutlined, PlusCircleFilled } from "@ant-design/icons";

import client from "@helpers/client";
// import { DATE_PICKER_TYPE } from "@settings/const";
import { Box } from "@components/utility/styles";
import IntlMessages from "@components/utility/intlMessages";

import { ColMoney } from "./renderCols";
import { CsButtonExpanded, CsTable } from "../styles";

const dynamicColumns = rangeTime => {
  return _.map(rangeTime, title => {
    return {
      title: (
        <Box className="label-time" flex justify="flex-end">
          {title}
        </Box>
      ),
      width: 120,
      render: data => {
        const money = _.find(data.data, d => _.get(d, "timeFormatted") === title);
        const suffix = _.get(data, "suffix")
        const styles = _.get(data, "style");
        return <ColMoney style={styles} money={_.get(money, "value")} suffix={suffix} />;
      },
    };
  });
};

const updateChildren = (data, parentKey, dataChildren) => {
  _.forEach(data, item => {
    if (item.key === parentKey) {
      item.children = _.map(dataChildren, d => ({ ...d, level: _.get(item, "level") + 1 }));
    } else if (!_.isEmpty(item.children)) {
      updateChildren(item.children, parentKey, dataChildren);
    }
  });
};

const getAPIExpendChidlren = async ({ parentKey, queryRedux, currentData }) => {
  const type = _.get(queryRedux, "pathName");
  if (!type) return;

  const { error_code, data } = await client().get(`/reportStream/${type}`, {
    params: {
      ..._.get(queryRedux, "params"),
      parentKey,
    },
  });

  if (error_code === 0) {
    const converDataChidlren = _.map(_.get(data, type), r => {
      if (r.hasChild) {
        return {
          ...r,
          children: [],
        };
      }
      return r;
    });

    updateChildren(currentData, parentKey, converDataChidlren);

    return true;
  }
};

const TableRevenue = ({ data, loading, queryRedux, showTotal, isMobile, ...props }) => {
  const [state, setState] = useState({
    data: [],
    loadingExpened: false,
    keysCalledApi: [],
    expandedRowKeys: [],
    rangeTime: [],
  });
  const refData = useRef();

  useEffect(() => {
    const convertData = !_.isEmpty(data)
      ? [
        {
          key: "TOTAL",
          label: "Total",
          data: _.map(_.get(data, "[0].data"), (item, i) => ({
            ...item,
            value: _.sum(_.map(data, dataItem => _.get(dataItem, ["data", i, "value"], 0))),
          })),
          style: { bold: true, color: "#000" },
        },
        ..._.map(data, d => ({
          ...d,
          level: 0,
          children: d.hasChild ? [] : undefined,
        })),
      ]
      : [];

    const newRangeTime = _.map(_.get(data, "[0].data"), "timeFormatted");

    const filterConvertData = showTotal ? convertData : _.filter(convertData, d => d.key !== "TOTAL");

    refData.current = filterConvertData

    setState(prev => ({
      ...prev,
      rangeTime: newRangeTime,
      data: filterConvertData,
      keysCalledApi: [],
    }));
  }, [data, showTotal]);

  useEffect(() => {
    const needFetchKeys = _.difference(state.expandedRowKeys, state.keysCalledApi);
    if (!needFetchKeys.length) return;

    (async function fetchChilds() {
      setState(prev => ({ ...prev, loadingExpened: true }));

      const rs = await Promise.all(
        needFetchKeys.map(key =>
          getAPIExpendChidlren({
            parentKey: key,
            queryRedux,
            currentData: refData.current,
          })
        )
      );

      const keysUpdated = needFetchKeys.filter((k, i) => rs[i]);

      setState(prev => ({
        ...prev,
        loadingExpened: false,
        keysCalledApi: _.uniq([...prev.keysCalledApi, ...keysUpdated]),
        data: [...refData.current],
      }));
    })();
  }, [state.expandedRowKeys, state.keysCalledApi, queryRedux]);

  const onExpand = (expanded, record) => {
    setState(prev => {
      const newExpanded = expanded
        ? _.uniq([...prev.expandedRowKeys, record.key])
        : _.filter(prev.expandedRowKeys, k => k !== record.key);

      return {
        ...prev,
        expandedRowKeys: newExpanded,
      };
    });
  };

  const expandIcon = ({ expanded, onExpand, record }) => {
    const hasChild = _.get(record, "hasChild");

    const isBold = _.get(record, "labelStyle.bold") || _.get(record, "style.bold");
    const color = _.get(record, "labelStyle.color") || _.get(record, "style.color")

    const styles = { fontWeight: isBold ? "bold" : "", color };

    if (!hasChild && !record.level) return <Box style={{ ...styles, paddingLeft: 22 }} fontWeight={500}>{record.label}</Box>;

    const stylesIcon = { fontSize: 15, display: "flex" };
    const chartStyleColor = _.get(record, "chartStyle.color");

    const plusIcon = <PlusCircleFilled style={stylesIcon} />;
    const minusIcon = <MinusCircleOutlined style={stylesIcon} />;

    const squareBox = chartStyleColor ? <div style={{ width: 15, height: 15, backgroundColor: chartStyleColor, borderRadius: 3 }} /> : <></>

    const icon = expanded ? minusIcon : plusIcon;

    return (
      <Box pl={record.level * 12} className="custom-expand-icon expanded" with="auto" flex alignItem="center" gap={5}>
        {squareBox}

        {hasChild ? (
          <CsButtonExpanded style={{ padding: 0 }} type="text" onClick={e => onExpand(record, e)}>
            {icon}
          </CsButtonExpanded>
        ) : (
          <div style={{ width: 16 }} />
        )}
        <div style={{ ...styles, alignSelf: "center" }}>{record.label}</div>
      </Box>
    );
  };

  const columns = [
    {
      title: !_.isEmpty(queryRedux) ? <IntlMessages id={_.get(queryRedux, "pathName")} /> : "",
      fixed: isMobile ? false : "left",
      className: "first-column",
    },
    ...dynamicColumns(state.rangeTime),
  ];

  return (
    <CsTable
      rowKey="key"
      columns={columns}
      loading={loading || state.loadingExpened}
      pagination={false}
      scroll={{
        x: "max-content",
      }}
      rowClassName={row => (row.key === "TOTAL" ? "summary-row" : "")}
      dataSource={state.data}
      expandedRowKeys={state.expandedRowKeys}
      onExpand={onExpand}
      expandable={{
        expandIcon,
      }}
    />
  );
};

export default TableRevenue;
