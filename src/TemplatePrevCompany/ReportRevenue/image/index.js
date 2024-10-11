import ChartIcon from "./chart";
import ChronicIcon from "./chronic"
import FilterIcon from "./filter";
import HomeIcon from "./home";

const icons = {
  chronic: ChronicIcon,
  filter: FilterIcon,
  home: HomeIcon,
  chart: ChartIcon
}

const IconParentMenu = ({ name }) => {
  const icon = icons[name]

  return (
    <span className="anticon anticon-bar-chart ant-menu-item-icon">
      {icon()}
    </span>

  );
}

export default IconParentMenu;