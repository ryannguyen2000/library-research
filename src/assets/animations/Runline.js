import { Box } from "@components/styles";
import { motion } from "framer-motion";

const Runline = () => {
  const icon = {
    hidden: {
      pathLength: 0,
      fill: "rgba(255, 255, 255, 0)",
    },
    visible: {
      pathLength: 1,
      fill: "rgba(255, 255, 255, 1)",
    },
  };

  return (
    <Box width="50px">
      <motion.div
        
      />
    </Box>
  );
};

export default Runline;
