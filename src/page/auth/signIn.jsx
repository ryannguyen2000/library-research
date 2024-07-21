const SignIn = () => {
  return (
    <div className="p-2 w-[375px] h-[812px] relative bg-gradient-to-b from-green-500 to-sky-500 rounded-[20px] shadow">
      <div className="w-full h-[250px] flex items-center justify-center">
        <img src="./images/iconic_sign-in.png" />
      </div>

      <div className="flex flex-col items-center justify-center gap-[15px]">
        <div className="w-full flex items-start text-neutral-800 text-[10px] font-normal font-['Poppins']">
          Phone Number
        </div>
        <div className="w-[327px]">
          <div className="text-neutral-800 text-base font-semibold font-['Poppins']">
            0809123123
          </div>
        </div>
        <div className="text-sky-600 text-xs font-semibold font-['Poppins'] underline">
          Any problems Login?
        </div>
        <div className="">
          <div className="text-black text-sm font-semibold font-['Poppins']">
            Next
          </div>
        </div>
      </div>

      <div className="text-black text-xs font-normal font-['Poppins']">Or</div>
      <div className="w-[327px]">
        <div className="text-neutral-800 text-sm font-normal font-['Poppins']">
          Login with Facebook
        </div>
      </div>
      <div className="w-[327px]">
        <div className="text-neutral-800 text-sm font-normal font-['Poppins']">
          Login with Google
        </div>
      </div>
    </div>
  );
};

export default SignIn;
