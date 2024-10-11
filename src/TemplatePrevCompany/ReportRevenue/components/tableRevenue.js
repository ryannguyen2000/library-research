import _ from "lodash";
import { useEffect, useState } from "react";
import { MinusCircleOutlined, PlusCircleFilled } from "@ant-design/icons";

import client from "@helpers/client";
// import { DATE_PICKER_TYPE } from "@settings/const";
import { Box } from "@components/utility/styles";
import IntlMessages from "@components/utility/intlMessages";

import { ColMoney } from "./renderCols";
import { CsButtonExpanded, CsTable } from "../styles";

const dynamicColumns = (rangeTime) => {
  if (rangeTime) {
    return _.map(rangeTime, (r, index) => {
      const title = rangeTime[index]
      return {
        title: <Box className="label-time" flex justify="flex-end">{title}</Box>,
        width: 100,
        render: data => {
          const money = _.find(data.data, d => _.get(d, "timeFormatted") === r);
          const currency = "VND";
          const styles = _.get(data, "style")
          return <ColMoney style={styles} money={_.get(money, "value")} currency={currency} />;
        },
      }
    })
  }
};

const findKeysByKey = (data, key) => {
  let result = [];

  const search = (items) => {
    for (const item of items) {
      if (item.key === key) {
        collectKeys(item);
        break;
      }
      if (item.children) {
        search(item.children);
      }
    }
  };

  const collectKeys = (obj) => {
    result.push(obj.key.toString());
    if (obj.children) {
      obj.children.forEach(child => collectKeys(child));
    }
  };

  search(data);
  return result;
};

const TableRevenue = ({ query, changeSearchParams, data, loading, queryRedux, ...props }) => {
  const [state, setState] = useState({
    data: [],
    loadingExpened: false,
    keysCalledApi: [],
    expandedRowKeys: [],
    rangeTime: []
  })

  const columns = [
    {
      title: !_.isEmpty(queryRedux) ? <IntlMessages id={_.get(queryRedux, "pathName")} /> : "",
      width: 300,
      fixed: "left",
      className: 'first-column'
    },
    ...dynamicColumns(state.rangeTime, _.map(_.get(state.data, "[0].data"), "timeFormatted")) || [],
  ];

  const updateChildren = (data, parentKey, dataChildren) => {
    return _.map(data, item => {
      if (item.key === parentKey) {
        return { ...item, children: _.map(dataChildren, d => ({ ...d, level: _.get(item, "level") + 1 })) };
      }
      if (!_.isEmpty(item.children)) {
        return { ...item, children: updateChildren(item.children, parentKey, dataChildren) };
      }
      return item;
    })
  };

  const getAPIExpendChidlren = async (parentKey, notUpdateState, dataMultipleKeys) => {
    setState(prev => ({ ...prev, loadingExpened: true }))
    let newData = []
    const { error_code, data } = await client().get(`/reportStream/${_.get(queryRedux, "pathName")}`, {
      params: {
        ..._.get(queryRedux, "params"),
        parentKey
      }
    })
    if (error_code === 0) {
      const converDataChidlren = _.map(_.get(data, _.get(queryRedux, "pathName")), r => {
        if (r.hasChild) {
          return ({
            ...r,
            children: []
          })
        }
        return r
      })
      // use dataMultipleKeys -> useEffect more keys when change filter
      // use state.data -> expanded each row on table.
      newData = updateChildren(dataMultipleKeys || state.data, parentKey, converDataChidlren)
      if (!notUpdateState) {
        setState(prev => ({ ...prev, data: newData }))
      }
    }
    setState(prev => ({ ...prev, loadingExpened: false }))
    return newData
  }

  const getAPIMultiKeysExpanded = async (keys, convertData) => {
    if (!_.isEmpty(keys)) {
      let newDataRoot = await convertData
      for (let index = 0; index < keys.length; index++) {
        const k = keys[index];
        newDataRoot = await getAPIExpendChidlren(k, true, newDataRoot)
      }
      setState(prev => ({ ...prev, data: newDataRoot }))
    } else {
      setState(prev => ({ ...prev }))
    }
  }

  const onExpand = (expanded, record) => {
    if (expanded) {
      const isKeyCalledAPI = _.includes(state.keysCalledApi, record.key)
      const isExpandedRowKeys = _.includes(state.expandedRowKeys, record.key)

      const newKeys = isKeyCalledAPI ? state.keysCalledApi : [...state.keysCalledApi, record.key]
      const newExpandedRowKeys = isExpandedRowKeys ? state.expandedRowKeys : [...state.expandedRowKeys, record.key]

      setState(prev => ({ ...prev, expandedRowKeys: newExpandedRowKeys, keysCalledApi: newKeys }));

      if (!isKeyCalledAPI) {
        getAPIExpendChidlren(record.key)
      }
    } else {
      const excludeKeys = findKeysByKey(state.data, record.key)
      const newExpanded = _.filter(state.expandedRowKeys, e => !_.includes(excludeKeys, e))
      setState(prev => ({ ...prev, expandedRowKeys: newExpanded }))
    }
  };

  const expandIcon = ({ expanded, onExpand, record }) => {
    const isBold = _.get(record, "labelStyle.bold") || _.get(record, "style.bold")
    const color = _.get(record, "labelStyle.color") || _.get(record, "style.color")
    const hasChild = _.get(record, "hasChild")
    const chartStyleColor = _.get(record, "chartStyle.color")

    const styles = { fontWeight: isBold ? "bold" : "", color }
    const stylesIcon = { fontSize: 15, display: "flex", }

    const plusIcon = <PlusCircleFilled style={stylesIcon} />
    const minusIcon = <MinusCircleOutlined style={stylesIcon} />

    const squareBox = <div style={{ width: 15, height: 15, backgroundColor: chartStyleColor, borderRadius: 3 }} />

    const icon = expanded ? (
      minusIcon
    ) : (
      plusIcon
    )

    return <Box pl={_.get(record, "level") * 12} className="custom-expand-icon expanded" with="auto" flex alignItem="center" gap={5}>
      {squareBox}
      {hasChild ? <CsButtonExpanded style={{ padding: 0 }} type="text" onClick={e => onExpand(record, e)}>
        {icon}
      </CsButtonExpanded> : <div style={{ width: 16 }} />}
      <div style={{ ...styles, alignSelf: 'center' }}>{record.label}</div>
    </Box>
  };

  useEffect(() => {
    const convertData = _.map(data, d => {
      if (d.hasChild) {
        return ({
          ...d,
          level: 0,
          children: []
        })
      }
      return {
        ...d,
        level: 0
      }
    })
    const newRangeTime = _.map(_.get(data, "[0].data"), "timeFormatted")
    setState(prev => {
      const newState = {
        ...prev,
        rangeTime: newRangeTime,
        data: convertData,
        keysCalledApi: state.expandedRowKeys
      };
      getAPIMultiKeysExpanded(state.expandedRowKeys, convertData);
      return newState;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return (
    <CsTable
      rowKey="key"
      columns={columns}
      loading={loading || state.loadingExpened}
      pagination={false}
      scroll={{
        x: "max-content",
      }}
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
