/* Загрузка и подстановка текстов. Сами тексты — в папке i18n/. */

import { CONFIG } from "./config.js";

let dict = {};
let current = CONFIG.DEFAULT_LANG;

export async function loadLang(lang) {
  const chosen = CONFIG.LANGS.includes(lang) ? lang : CONFIG.DEFAULT_LANG;
  const res = await fetch(`./i18n/${chosen}.json`);
  if (!res.ok) throw new Error(`Не удалось загрузить словарь ${chosen}`);
  dict = await res.json();
  current = chosen;
  document.documentElement.lang = chosen;
  localStorage.setItem("lang", chosen);
  return chosen;
}

export function currentLang() {
  return current;
}

export function savedLang() {
  return localStorage.getItem("lang");
}

/** t("profile.bioLabel") -> строка из словаря. Если ключа нет, вернёт сам ключ,
 *  чтобы пропущенный перевод было видно сразу, а не молча пустое место. */
export function t(path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), dict) ?? path;
}
