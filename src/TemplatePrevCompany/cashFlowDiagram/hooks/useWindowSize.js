import { useState, useEffect } from "react";

function useScreenSize() {
  const [screenSize, setScreenSize] = useState("mobile");
  const [screenWidth, setScreenWidth] = useState(1200);

  useEffect(() => {
    function handleResize() {
      const width = window.innerWidth;
      if (width <= 768) {
        setScreenSize("mobile");
      } else if (width <= 1024) {
        setScreenSize("tablet");
      } else {
        setScreenSize("pc");
        if (width >= 1200) {
          setScreenWidth(width);
        }
      }
    }

    // Initial setup
    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return { screenSize, screenWidth };
}

export default useScreenSize;
