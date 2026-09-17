/* Клиент к бэкенду.
   Личность пользователя подтверждается подписью Telegram (initData),
   которую сюда кладёт сам Telegram — вручную ничего передавать не нужно
   и нельзя: бэкенд не примет telegram_id из тела запроса. */

import { CONFIG } from "./config.js";
import { t } from "./i18n.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
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
  } catch {
    throw new ApiError(0, t("common.errorNetwork"));
  }

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    if (res.status === 401) throw new ApiError(401, t("common.errorAuth"));
    if (res.status === 429) throw new ApiError(429, t("common.errorRateLimit"));
    const detail = typeof payload?.detail === "string" ? payload.detail : t("common.errorGeneric");
    throw new ApiError(res.status, detail);
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
