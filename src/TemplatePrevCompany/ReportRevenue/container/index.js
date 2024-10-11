import _ from 'lodash'
import moment from 'moment'
import { useCallback, useEffect } from 'react'
import { Route, Routes } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';

import actions from "@redux/revenueStream/actions";
import { DATE_PICKER_TYPE } from '@settings/const';

import { routes } from '../const';

const ContentRouterElement = props => {

  const dispatch = useDispatch()
  const { data, loading, query: queryRedux } = useSelector(state => state.revenueStream);

  const { query, changeSearchParams } = props

  const getDataTable = useCallback(() => {
    if (!query.timelineType || !query.from || !query.to) {
      const initFrom = moment().startOf("month").format("Y-MM-DD");
      const initTo = moment().endOf("month").format("Y-MM-DD");
      changeSearchParams({
        timelineType: _.get(query, "timelineType", "DAILY"),
        from: _.get(query, "from", initFrom),
        to: _.get(query, "to", initTo),
      });
    } else {
      dispatch(
        actions.fetch({
          pathName: _.get(props, "pathName", "revenueStream"),
          params: {
            ...query,
            from: moment(query.from).format(DATE_PICKER_TYPE[query.timelineType].format),
            to: moment(query.to).format(DATE_PICKER_TYPE[query.timelineType].format)
          },
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pathName, query]);

  useEffect(() => {
    getDataTable();
  }, [getDataTable]);

  return (
    <div className="content" style={{ minHeight: "100vh", padding: 15 }}>
      <Routes>
        {_.map(routes, route => {
          return (
            <Route
              key={route.to}
              path={`/${route.to}/*`}
              element={
                route.element && (
                  <route.element
                    data={data}
                    loading={loading}
                    queryRedux={queryRedux}
                    {...props}
                  />
                )
              }
            />
          );
        })}
      </Routes>
    </div>
  )
}

export default ContentRouterElement