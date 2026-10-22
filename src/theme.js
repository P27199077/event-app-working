export function initializeThemeToggle() {
  const button = document.querySelector("#themeToggle");
  function apply(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    button.innerHTML = `<span aria-hidden="true">${dark ? "☀" : "☾"}</span><span class="theme-toggle-label">${dark ? "Light mode" : "Dark mode"}</span>`;
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute(
      "aria-label",
      dark ? "Switch to light mode" : "Switch to dark mode",
    );
    document.dispatchEvent(
      new CustomEvent("pinpoint:themechange", {
        detail: dark ? "dark" : "light",
      }),
    );
  }
  button.onclick = () => {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("pinpoint-theme", theme);
    } catch {}
    apply(theme);
  };
  window.addEventListener("storage", (event) => {
    if (event.key === "pinpoint-theme")
      apply(event.newValue === "dark" ? "dark" : "light");
  });
  apply(document.documentElement.dataset.theme);
}
