/* Клиент к бэкенду.
   Личность пользователя подтверждается подписью Telegram (initData),
   которую сюда кладёт сам Telegram — вручную ничего передавать не нужно
   и нельзя: бэкенд не примет telegram_id из тела запроса. */

import { CONFIG } from "./config.js";
import { t } from "./i18n.js";

export class ApiError extends Error {
  /**
   * status: HTTP-код ответа, либо 0 — если ответа вообще не было
   *   (fetch() упал раньше, чем дошёл до сервера/браузер заблокировал ответ).
   * code: короткий машинный код причины — показываем его в UI как есть,
   *   а не прячем за общей фразой "проверь соединение", чтобы можно было
   *   искать по нему в логах или гуглить.
   * errorId: если бэкенд прислал error_id (см. app/main.py), кладём сюда —
   *   по нему можно найти конкретную ошибку в логах сервера.
   */
  constructor(status, message, { code = null, errorId = null, cause = null } = {}) {
    super(message);
    this.status = status;
    this.code = code ?? `HTTP_${status}`;
    this.errorId = errorId;
    if (cause) this.cause = cause;
  }

  /** Строка для показа пользователю: код ошибки + текст, без заглушек. */
  get displayMessage() {
    const parts = [`[${this.code}]`, this.message];
    if (this.errorId) parts.push(`(id: ${this.errorId})`);
    return parts.join(" ");
  }
}

function authHeaders() {
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) return { Authorization: `tma ${initData}` };
  if (CONFIG.DEV_TELEGRAM_ID) return { "X-Dev-Telegram-Id": String(CONFIG.DEV_TELEGRAM_ID) };
  return {};
}

async function request(method, path, { body, query } = {}) {
  const url = new URL(CONFIG.API_BASE + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
      else url.searchParams.set(key, value);
    }
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...authHeaders(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Сюда попадают ДВА разных случая, которые браузер не различает:
    // 1) реальный обрыв сети/DNS/сервер лежит;
    // 2) сервер ОТВЕТИЛ (иногда даже 200), но браузер не отдал ответ в JS,
    //    потому что в нём не было CORS-заголовков (например, необработанное
    //    исключение на бэкенде — см. app/main.py про ServerErrorMiddleware).
    // Раньше оба случая показывались одной фразой "проверь соединение" —
    // теперь показываем настоящее имя и сообщение ошибки браузера, чтобы
    // было по чему искать причину, а не гадать вслепую.
    const name = err?.name || "Error";
    const detail = err?.message || String(err);
    throw new ApiError(0, `${t("common.errorNetwork")} Браузер сообщил: ${name}: ${detail}.`, {
      code: "NETWORK",
      cause: err,
    });
  }

  if (res.status === 204) return null;

  let payload = null;
  let parseError = null;
  try {
    payload = await res.json();
  } catch (err) {
    parseError = err;
  }

  if (!res.ok) {
    const errorId = typeof payload?.error_id === "string" ? payload.error_id : null;
    let detail;
    if (typeof payload?.detail === "string") {
      detail = payload.detail;
    } else if (parseError) {
      detail = `Сервер ответил ${res.status}, но тело ответа не JSON (${parseError.message}).`;
    } else {
      detail = t("common.errorGeneric");
    }
    throw new ApiError(res.status, detail, { errorId });
  }

  return payload;
}

export const api = {
  health: () => request("GET", "/health"),

  // Анкеты
  getMyProfile: () => request("GET", "/profiles/me"),
  saveMyProfile: (data) => request("PUT", "/profiles/me", { body: data }),
  deleteMyProfile: () => request("DELETE", "/profiles/me"),
  getProfile: (id) => request("GET", `/profiles/${id}`),
  listQuestions: () => request("GET", "/profiles/questions/list"),
  getMyAnswers: () => request("GET", "/profiles/me/answers"),
  saveAnswer: (questionId, answerText) =>
    request("PUT", "/profiles/me/answers", { body: { question_id: questionId, answer_text: answerText } }),
  deleteAnswer: (questionId) => request("DELETE", `/profiles/me/answers/${questionId}`),

  // Лента
  getFeed: (params) => request("GET", "/feed", { query: params }),

  // Симпатии и матчи
  like: (targetProfileId) => request("POST", "/matches/like", { body: { target_profile_id: targetProfileId } }),
  unlike: (targetProfileId) => request("DELETE", `/matches/like/${targetProfileId}`),
  listMatches: () => request("GET", "/matches"),
  consentShareUsername: (matchId) =>
    request("POST", "/matches/consent-share-username", { body: { match_id: matchId } }),
  revokeConsent: (matchId) => request("DELETE", `/matches/consent-share-username/${matchId}`),

  // Жалобы
  report: (targetProfileId, reason) =>
    request("POST", "/reports", { body: { target_profile_id: targetProfileId, reason } }),

  // Игры
  listGames: () => request("GET", "/games"),
  startGame: (gameId, opponentProfileId) =>
    request("POST", `/games/${gameId}/start`, { body: { opponent_profile_id: opponentProfileId } }),
  getGameSession: (sessionId) => request("GET", `/games/session/${sessionId}`),
  sendGameMessage: (sessionId, message) =>
    request("POST", "/games/message", { body: { session_id: sessionId, message } }),

  // Личные сообщения и комментарии
  sendMessage: ({ toProfileId, body, anchor = null, quote = null }) =>
    request("POST", "/chat/messages", { body: { to_profile_id: toProfileId, body, anchor, quote } }),
  fetchInbox: () => request("GET", "/chat/inbox"),
  listThreads: () => request("GET", "/chat/threads"),

  // Микроблог
  listPosts: (params) => request("GET", "/blog", { query: params }),
  createPost: (content) => request("POST", "/blog", { body: { content } }),
  deletePost: (postId) => request("DELETE", `/blog/${postId}`),
};
