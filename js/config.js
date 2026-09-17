/* ============================================================
   НАСТРОЙКИ ПОДКЛЮЧЕНИЯ
   Единственное, что обязательно поменять перед запуском, — API_BASE.
   ============================================================ */

export const CONFIG = {
  // Адрес бэкенда на Render, без слэша на конце.
  API_BASE: "https://readme-mmc1.onrender.com",

  // Язык по умолчанию, если у пользователя ещё нет выбора и Telegram молчит.
  DEFAULT_LANG: "ru",

  // Доступные языки: имена файлов в папке i18n/ без расширения.
  LANGS: ["ru", "en"],

  // Лимиты длины. Должны совпадать с бэкендом (app/schemas.py):
  // MIN_BIO_CHARS / MAX_BIO_CHARS / MAX_APPEARANCE_CHARS.
  MIN_BIO: 300,
  MAX_BIO: 10000,
  MAX_APPEARANCE: 2000,
  MAX_POST: 5000,
  MAX_MESSAGE: 4000,
  MAX_NAME: 80,
  MAX_CITY: 80,
  MIN_AGE: 18,
  MAX_AGE: 99,

  // ТОЛЬКО для локальной отладки в обычном браузере, без Telegram.
  // Должно совпадать с DEV_AUTH_BYPASS=1 на бэкенде.
  // Перед публикацией обязательно вернуть в null.
  DEV_TELEGRAM_ID: null,
};
