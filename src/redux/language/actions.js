const changeLanguage = language => {
  localStorage.setItem("LANG", language);
  window.location.reload();
};

export default changeLanguage;
