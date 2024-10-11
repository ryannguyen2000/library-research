export const styleTableNormol = (isSeledtedDefault, GENERAL_SIZE) => {
  return {
    fontSize: GENERAL_SIZE.TEXT_NODE,
    fontWeight: 400,
    color: isSeledtedDefault ? "#fff" : "#000",
    width: GENERAL_SIZE.WIDTH_NODE,
    height: GENERAL_SIZE.HEIGHT_NODE,
    border: "1px solid #7A8599",
    background: isSeledtedDefault ? "#18b4c9" : "white",
    borderRadius: 3,
  };
};

export const styleNodeGuest = (isSeledtedDefault, GENERAL_SIZE) => {
  return {
    width: GENERAL_SIZE.WIDTH_NODE_GUEST,
    height: GENERAL_SIZE.HEIGHT_NODE_GUEST,
    border: "1px solid black",
    color: isSeledtedDefault ? "#fff" : "#000",
    fontWeight: 500,
    letterSpacing: "2px",
    fontSize: "40px",
    background: isSeledtedDefault ? "#18b4c9" : "white",
    font: GENERAL_SIZE.TEXT_TRANSFORM,
  };
};

// Color of edges for each group
export const colorsEdgeColumns = ["#0000ff", "#d800ff", "#242124", "#0000ff"];
