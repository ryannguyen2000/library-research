const fetchDataWithDelay = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Data loaded");
    }, 2000);
  });
};

export default async function LoadingPage() {
  const result = await fetchDataWithDelay();

  return <div>Loading Page</div>;
}
