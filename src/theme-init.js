// Apply the saved choice before styles paint, including when storage is unavailable.
(() => {
  let theme = "light";
  try {
    if (localStorage.getItem("pinpoint-theme") === "dark") theme = "dark";
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
