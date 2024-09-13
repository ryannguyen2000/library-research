import { GoogleLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { useDispatch } from "react-redux";

import actions from "@redux/auth/signIn/actions";

const SignIn = () => {
  const dispatch = useDispatch();

  return (
    <GoogleLogin
      onSuccess={(credentialResponse) => {
        const decoded = jwtDecode(credentialResponse?.credential);
        console.log(decoded);
        dispatch(actions.setData(decoded));
      }}
      onError={() => {
        console.log("Login Failed");
      }}
    />
  );
};

export default SignIn;
