import _ from "lodash"
import { useEffect, useState } from 'react';
import { Bar, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, XAxis } from 'recharts';
import { Spin } from 'antd';

import { formatter } from '@helpers/utility';
import { Box } from '@components/utility/styles';

import { CsBarChart, WrapTooltip } from '../styles';
import { FOOTER_SIZE_BAR_CHART, LEFT_SIZE_BAR_CHART } from '../const';

const BarChartComponent = ({ data, loading, query, ...props }) => {
  const [state, setState] = useState({
    dataChart: [],
    keysBarColumn: [],
  })

  const timeType = _.get(query, "timelineType") || "DAILY"

  const convertData = (data) => {
    let newData = []
    let newKeysBarColumn = []

    for (let index = 0; index < data.length; index++) {
      const item = data[index]
      const label = _.get(item, "label")
      newKeysBarColumn.push({
        label,
        fill: _.get(item, "chartStyle.color")
      })
      const newItem = _.map(item.data, i => ({ [label]: i.value, timeFormatted: i.timeFormatted }))
      newData.push(newItem)
    }

    const mergedData = _(newData)
      .flatMap() // Phẳng mảng
      .groupBy('timeFormatted') // Nhóm theo timeFormatted
      .map((items, time) => {
        // Gộp các giá trị trong từng nhóm
        return {
          timeFormatted: time,
          ..._.merge({}, ...items.map(item => _.omit(item, 'timeFormatted')))
        };
      })
      .value();

    setState(prev => ({ ...prev, dataChart: mergedData, keysBarColumn: newKeysBarColumn }))
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const titleText = _.get(payload, "[0].payload.timeFormatted")
      return (
        <WrapTooltip>
          <Box flex justify="center"><strong>{titleText}</strong></Box>
          {_.map(payload, (item, key) => {
            const color = _.get(item, "fill")
            return <div key={key} style={{ color }}>
              <strong>{_.get(item, "name")}:</strong> {formatter(_.get(item, "value"))}
            </div>
          })}
        </WrapTooltip>
      );
    }
    return null;
  };

  useEffect(() => {
    convertData(data)
  }, [data])

  return (
    <Spin spinning={loading}>
      <Box minHeight="400px">
        <ResponsiveContainer minHeight={400} debounce={300}>
          <CsBarChart
            className='BarChart'
            width={500}
            height={350}
            data={state.dataChart}
            margin={{
              top: 20,
              right: 30,
              left: LEFT_SIZE_BAR_CHART[timeType],
              bottom: FOOTER_SIZE_BAR_CHART[timeType],
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis className='XAxis' dataKey="timeFormatted" tick={<CustomXAxisTick />} />
            <YAxis tickFormatter={tickFormatter} />
            <Tooltip content={<CustomTooltip />} />
            {_.map(state.keysBarColumn, (n, index) => {
              return (
                <Bar
                  key={n + index}
                  dataKey={n.label}
                  name={n.label}
                  fill={n.fill}
                  barSize={20}
                  stackId="timeFormatted"
                />
              );
            })}
          </CsBarChart>
        </ResponsiveContainer>
      </Box>

    </Spin>

  );
};

const CustomXAxisTick = ({ x, y, payload }) => {
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dx={5}
        dy={15}
        textAnchor="end"
        transform="rotate(-45)"
        fill="#666"
        fontSize={12}
      >
        {payload.value}
      </text>
    </g>
  );
};

function tickFormatter(value) {
  return formatter(value)
}

export default BarChartComponent