import { useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { message } from "antd";
import { SaveOutlined } from "@ant-design/icons";

import client from "@helpers/client";
import actions from "@redux/financeReports/detail/actions";
import { HeaderButton } from "@components/page/headerComponent";

function ToolBar({ query }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [data, other] = useSelector(
    state => [state.financeReports.detail.data, state.financeReports.detail.other],
    shallowEqual
  );

  const [loading, setLoading] = useState(false);

  const { confirmedBy, state, _id, name } = other;

  const handleSave = async () => {
    if (!name) {
      return message.warning("Hãy nhập tên báo cáo!");
    }
    const body = {
      name: name,
      paidInfo: other.paidInfo,
      description: other.description,
    };
    if (!_id) {
      body.payoutType = "pay";
      body.payouts = data.map(({ _id }) => _id);
    }

    setLoading(true);

    const { data: res, error_code } = _id
      ? await client().put(`/finance/export/${_id}`, body)
      : await client().post(`/finance/export`, body);

    if (error_code === 0) {
      message.success("Đã lưu!");
      if (!_id) {
        return navigate({
          pathname: `/accounting/expense`,
          search: `?type=${query.type}`,
        });
        // navigate(`/accounting/expense`, {
        //   replace,
        // });
      }
      dispatch(actions.fetch(_id, body.payoutType || res.exports.payoutType));
    }

    setLoading(false);
  };

  return (
    <div style={{ marginRight: 12 }}>
      <HeaderButton disabled={!!confirmedBy || !!state} onClick={handleSave} loading={loading} icon={<SaveOutlined />}>
        LƯU
      </HeaderButton>
    </div>
  );
}

export default memo(ToolBar);
