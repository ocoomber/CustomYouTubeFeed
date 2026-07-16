// Light/dark theme toggle, persisted to localStorage.

const THEME_KEY = "yt_feed_theme";

export function applyTheme(theme, themeBtn) {
  document.body.classList.toggle("light", theme === "light");
  themeBtn.textContent = theme === "light" ? "☾" : "☀";
  localStorage.setItem(THEME_KEY, theme);
}

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function wireThemeToggle(themeBtn) {
  themeBtn.addEventListener("click", () => {
    const next = document.body.classList.contains("light") ? "dark" : "light";
    applyTheme(next, themeBtn);
  });
}
