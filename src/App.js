import { RouterProvider } from "react-router-dom";
import router from "./routes";
import { Suspense } from "react";

function App() {
  return (
    <Suspense fallback={"...loading"}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

export default App;
