import _ from "lodash";
import moment from "moment";
import { useCallback, useEffect } from "react";
import { useDispatch, } from "react-redux";

import ConvertUser from "./convertUser";
import NewUser from "./newUser";

const components = {
  convert_user: ConvertUser,
  new_user: NewUser,
};

// const selector = state => [
//   state.revenueStream.data,
//   state.revenueStream.loading,
//   state.revenueStream.query,
//   state.revenueStream.showChart,
//   state.revenueStream.showTotal
// ]

const ContentRouterElement = props => {
  const dispatch = useDispatch();

  // const [data, loading, queryRedux, showChart, showTotal] = useSelector(
  //   selector,
  //   shallowEqual
  // );

  const { query, changeSearchParams, pathname, activeKey } = props;

  const getDataTable = useCallback(() => {
    if (!query.timelineType || !query.from || !query.to) {
      const initFrom = moment().startOf("month").format("Y-MM-DD");
      const initTo = moment().endOf("month").format("Y-MM-DD");
      changeSearchParams(
        {
          timelineType: _.get(query, "timelineType", "DAILY"),
          from: _.get(query, "from", initFrom),
          to: _.get(query, "to", initTo),
        },
        {
          replace: true,
        }
      );
    } else {
      // dispatch(
      //   actions.fetch({
      //     pathName: pathname || "convert_user",
      //     params: {
      //       ...query,
      //       from: moment(query.from).format(DATE_PICKER_TYPE[query.timelineType].format),
      //       to: moment(query.to).format(DATE_PICKER_TYPE[query.timelineType].format),
      //     },
      //   })
      // );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, pathname, query, changeSearchParams]);

  useEffect(() => {
    getDataTable();
  }, [getDataTable]);

  const Component = components[activeKey];

  return (
    <div className="content" style={{ minHeight: "100vh", padding: 15 }}>
      <Component
        pathname={activeKey}
        data={[]}
        loading={false}
        queryRedux={{}}
        showChart={false}
        showTotal={false}
        {...props}
      />
    </div>
  );
};

export default ContentRouterElement;
