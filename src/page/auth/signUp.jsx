const SignUp = () => {
  return (
    <div className="w-[375px] h-[812px] relative bg-white rounded-[20px] shadow">
      <div className="w-[375px] h-[812px] left-0 top-0 absolute flex-col justify-center items-center inline-flex">
        <div className="w-[375px] h-[812px] bg-gradient-to-b from-green-500 to-sky-500" />
      </div>
      <div className="w-6 h-6 pl-2 pr-[9.01px] py-[5px] left-[24px] top-[25px] absolute justify-center items-center inline-flex" />
      <div className="w-[327px] h-[45px] left-[24px] top-[485px] absolute">
        <div className="w-[327px] h-[45px] left-0 top-0 absolute shadow justify-center items-center inline-flex">
          <div className="w-[327px] h-[45px] bg-stone-50 rounded-[10px]" />
        </div>
        <div className="left-[144px] top-[12px] absolute text-black text-sm font-semibold font-['Poppins']">
          DONE
        </div>
      </div>
      <div className="h-[71px] left-[24px] top-[190px] absolute">
        <div className="left-0 top-0 absolute text-neutral-800 text-[10px] font-normal font-['Poppins']">
          Email
        </div>
        <div className="w-[327px] h-[50px] left-0 top-[21px] absolute">
          <div className="w-[327px] h-[50px] left-0 top-0 absolute justify-center items-center inline-flex">
            <div className="w-[327px] h-[50px] bg-white/opacity-70 rounded-[10px]" />
          </div>
          <div className="left-[15px] top-[12px] absolute text-neutral-800 text-base font-semibold font-['Poppins']">
            roy@gmail.com
          </div>
        </div>
      </div>
      <div className="h-[70px] left-[24px] top-[100px] absolute">
        <div className="left-0 top-0 absolute text-neutral-800 text-[10px] font-normal font-['Poppins']">
          Phone Number
        </div>
        <div className="w-[327px] h-[50px] left-[1px] top-[20px] absolute">
          <div className="w-[327px] h-[50px] left-0 top-0 absolute justify-center items-center inline-flex">
            <div className="w-[327px] h-[50px] bg-white/opacity-70 rounded-[10px]" />
          </div>
          <div className="left-[14px] top-[13px] absolute text-neutral-800 text-base font-semibold font-['Poppins']">
            0809123123
          </div>
        </div>
      </div>
      <div className="h-[70px] left-[24px] top-[280px] absolute">
        <div className="left-0 top-0 absolute text-neutral-800 text-[10px] font-normal font-['Poppins']">
          Name
        </div>
        <div className="w-[327px] h-[50px] left-[1px] top-[20px] absolute justify-center items-center inline-flex">
          <div className="w-[327px] h-[50px] bg-white/opacity-70 rounded-[10px]" />
        </div>
      </div>
      <div className="w-[328px] h-[85px] left-[24px] top-[370px] absolute">
        <div className="left-0 top-0 absolute text-neutral-800 text-[10px] font-normal font-['Poppins']">
          Password
        </div>
        <div className="left-[1px] top-[70px] absolute text-white text-[10px] font-medium font-['Poppins']">
          Minimum 8 Character
        </div>
        <div className="w-[327px] h-[50px] left-[1px] top-[20px] absolute justify-center items-center inline-flex">
          <div className="w-[327px] h-[50px] bg-white/opacity-70 rounded-[10px]" />
        </div>
        <div className="left-[17px] top-[33px] absolute text-black text-base font-semibold font-['Poppins']">
          •••••••
        </div>
        <div className="w-[15px] h-[15px] py-[1.54px] left-[296px] top-[38px] absolute justify-center items-center inline-flex">
          <div className="w-[15px] h-[11.91px] relative"></div>
        </div>
      </div>
      <div className="left-[158px] top-[27px] absolute text-neutral-800 text-sm font-medium font-['Poppins']">
        Register
      </div>
      <div className="left-[87px] top-[550px] absolute text-center">
        <span className="text-neutral-800 text-[10px] font-normal font-['Poppins']">
          By Register, I agree
          <br />
        </span>
        <span className="text-sky-600 text-[10px] font-normal font-['Poppins'] underline">
          Terms and Conditions
        </span>
        <span className="text-neutral-800 text-[10px] font-normal font-['Poppins']">
          {" "}
          and{" "}
        </span>
        <span className="text-sky-600 text-[10px] font-normal font-['Poppins'] underline">
          Privacy Policy
        </span>
        <span className="text-neutral-800 text-[10px] font-normal font-['Poppins']">
          {" "}
        </span>
      </div>
    </div>
  );
};

export default SignUp;
