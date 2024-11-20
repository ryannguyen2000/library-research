import dynamic from "next/dynamic";

const DynamicMyComponent = dynamic(() => import("@/components/info"), {
  ssr: false, //Disable server-side rendering if needed
});

export default function LayzyLoading() {
  return (
    <div>
      <h1>Lazay loading test</h1>
      <DynamicMyComponent />
    </div>
  );
}
