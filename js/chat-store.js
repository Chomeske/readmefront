/* ============================================================
   ЛОКАЛЬНАЯ ИСТОРИЯ ПЕРЕПИСКИ

   Сервер работает как почтовый ящик: отдаёт новое сообщение ровно
   один раз и тут же забывает его. Поэтому история переписки живёт
   здесь, в браузере пользователя (localStorage).

   Следствия, о которых честно предупреждаем в интерфейсе:
   - очистил данные приложения → переписка пропала, восстановить неоткуда;
   - на другом устройстве истории не будет — только новые сообщения.

   Картинок нет вообще: хранится и передаётся только текст.
   ============================================================ */

const KEY_PREFIX = "chat:";
const MAX_MESSAGES_PER_THREAD = 500;

function key(threadId) {
  return `${KEY_PREFIX}${threadId}`;
}

export function loadThread(threadId) {
  try {
    return JSON.parse(localStorage.getItem(key(threadId)) ?? "[]");
  } catch {
    return [];
  }
}

function saveThread(threadId, messages) {
  const trimmed = messages.slice(-MAX_MESSAGES_PER_THREAD);
  try {
    localStorage.setItem(key(threadId), JSON.stringify(trimmed));
  } catch {
    // Место кончилось — выкидываем половину самых старых и пробуем ещё раз.
    try {
      localStorage.setItem(key(threadId), JSON.stringify(trimmed.slice(-Math.floor(MAX_MESSAGES_PER_THREAD / 2))));
    } catch {
      /* если и это не помогло — молча теряем, ронять интерфейс из-за истории не будем */
    }
  }
}

/** Добавляет сообщение в локальную историю беседы, без дублей по id. */
export function appendMessage(threadId, message) {
  const messages = loadThread(threadId);
  if (message.id && messages.some((m) => m.id === message.id)) return messages;
  messages.push(message);
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  saveThread(threadId, messages);
  return messages;
}

export function appendMany(messages) {
  const touched = new Set();
  for (const m of messages) {
    appendMessage(m.thread_id, { ...m, mine: false });
    touched.add(m.thread_id);
  }
  return touched;
}

export function unreadCount(threadId) {
  return loadThread(threadId).filter((m) => !m.mine && !m.read).length;
}

export function markThreadRead(threadId) {
  const messages = loadThread(threadId).map((m) => ({ ...m, read: true }));
  saveThread(threadId, messages);
}

export function forgetThread(threadId) {
  localStorage.removeItem(key(threadId));
}

export function lastMessagePreview(threadId) {
  const messages = loadThread(threadId);
  return messages.length ? messages[messages.length - 1].body : null;
}
