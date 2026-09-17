/* Светлая/тёмная тема. Значения цветов — в css/tokens.css. */

const STORAGE_KEY = "theme"; // "auto" | "light" | "dark"

function systemPrefersDark() {
  const tg = window.Telegram?.WebApp;
  if (tg?.colorScheme) return tg.colorScheme === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function currentMode() {
  return localStorage.getItem(STORAGE_KEY) || "auto";
}

export function applyTheme(mode = currentMode()) {
  const dark = mode === "dark" || (mode === "auto" && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem(STORAGE_KEY, mode);
}

export function watchSystemTheme() {
  window.Telegram?.WebApp?.onEvent?.("themeChanged", () => {
    if (currentMode() === "auto") applyTheme("auto");
  });
  window.matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      if (currentMode() === "auto") applyTheme("auto");
    });
}
