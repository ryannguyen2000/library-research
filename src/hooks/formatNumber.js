export function formatNumber(value) {
  if (value === undefined || value === null || value === "") return "";
  const num = Number(value);
  return `${(Number.isInteger(num) ? num : num.toFixed(2))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
