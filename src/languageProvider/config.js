import { siteConfig } from "../settings";

const { language } = siteConfig;

const config = {
  options: [
    {
      locale: "vi",
      text: "Việt Nam"
    },
    {
      locale: "en",
      text: "English"
    }
  ]
};

const currentLanguage = (localStorage && localStorage.getItem("LANG")) || language;

function changeLanguage(language) {
  localStorage && localStorage.setItem("LANG", language);
  window.location.reload();
}

export { currentLanguage, changeLanguage };
export default config;
