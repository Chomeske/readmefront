/* Экраны приложения. Вёрстка — в css/, тексты — в i18n/, цвета — в css/tokens.css. */

import { api, ApiError } from "./api.js";
import { CONFIG } from "./config.js";
import { currentLang, loadLang, savedLang, t } from "./i18n.js";
import * as chatStore from "./chat-store.js";
import { applyTheme, currentMode, watchSystemTheme } from "./theme.js";

const root = document.getElementById("root");
const tabBar = document.getElementById("tab-bar");

const state = {
  tab: "feed",
  myProfile: null,
  filters: { tags: [], keywords: [], gender: null, exclude_liked: true },
};

/* ---------- мелкие помощники ---------- */

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
};

function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = el("div", { class: "toast", text: message });
  document.body.append(node);
  setTimeout(() => node.remove(), 3200);
}

function haptic(type = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) toast(error.message);
    else toast(t("common.errorGeneric"));
    return null;
  }
}

function render(...nodes) {
  root.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function screen(children) {
  return el("div", { class: "screen" }, children);
}

/* ---------- экран приветствия ---------- */

function welcomeScreen() {
  render(screen([
    el("h1", { class: "screen-title", text: t("welcome.title") }),
    el("p", { class: "screen-lede", text: t("welcome.lede") }),
    el("p", { class: "screen-lede", text: t("welcome.privacy") }),
    el("button", {
      class: "btn btn--wide",
      text: t("welcome.start"),
      onclick: () => profileEditScreen(),
    }),
  ]));
  setTab(null);
}

/* ---------- редактирование своей анкеты ---------- */

function profileEditScreen() {
  const p = state.myProfile;
  let ownGender = p?.own_gender ?? null;
  let seeking = p?.seeking_gender ?? null;

  const genderButtons = (value, onPick, withAny) => {
    const options = [
      ["female", t("profile.genderFemale")],
      ["male", t("profile.genderMale")],
    ];
    if (withAny) options.push([null, t("profile.seekingAny")]);
    const row = el("div", { class: "choice-row" });
    options.forEach(([key, label]) => {
      const btn = el("button", {
        class: "choice",
        type: "button",
        text: label,
        "aria-pressed": String(value === key),
        onclick: () => {
          onPick(key);
          [...row.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
        },
      });
      row.append(btn);
    });
    return row;
  };

  const bio = el("textarea", {
    class: "textarea",
    maxlength: String(CONFIG.MAX_BIO),
    placeholder: t("profile.bioPlaceholder"),
    style: "min-height: 220px",
  });
  bio.value = p?.bio_text ?? "";

  const appearance = el("textarea", {
    class: "textarea",
    maxlength: String(CONFIG.MAX_APPEARANCE),
    placeholder: t("profile.appearancePlaceholder"),
  });
  appearance.value = p?.appearance_text ?? "";

  const tags = el("input", {
    class: "input",
    placeholder: t("profile.tagsPlaceholder"),
  });
  tags.value = (p?.tags ?? []).join(", ");

  const bioCounter = el("div", { class: "counter" });

  const refreshBioCounter = () => {
    const length = bio.value.trim().length;
    const short = length < CONFIG.MIN_BIO;
    bioCounter.textContent = short
      ? t("profile.bioTooShort").replace("{n}", String(CONFIG.MIN_BIO - length))
      : `${length} / ${CONFIG.MAX_BIO}`;
    bioCounter.style.color = short ? "var(--danger)" : "var(--ink-faint)";
    save.disabled = short;
  };

  const save = el("button", {
    class: "btn btn--wide",
    text: t("profile.save"),
    onclick: async () => {
      if (!ownGender) return toast(t("profile.ownGenderLabel"));
      if (bio.value.trim().length < CONFIG.MIN_BIO) return toast(t("profile.bioMinHint"));
      save.disabled = true;
      const saved = await guard(() => api.saveMyProfile({
        own_gender: ownGender,
        seeking_gender: seeking,
        bio_text: bio.value.trim(),
        appearance_text: appearance.value.trim() || null,
        tags: tags.value.split(",").map((s) => s.trim()).filter(Boolean),
      }));
      save.disabled = false;
      if (saved) {
        state.myProfile = saved;
        haptic("light");
        toast(t("profile.saved"));
        questionsScreen();
      }
    },
  });

  bio.addEventListener("input", refreshBioCounter);
  refreshBioCounter();

  render(screen([
    el("h1", { class: "screen-title", text: t("profile.editTitle") }),
    p?.is_hidden ? el("p", { class: "panel", text: t("profile.hiddenNotice") }) : null,

    el("div", { class: "field" }, [
      el("span", { class: "field__label", text: t("profile.ownGenderLabel") }),
      el("p", { class: "field__hint", text: t("profile.ownGenderHint") }),
      genderButtons(ownGender, (v) => { ownGender = v; }, false),
    ]),

    el("div", { class: "field" }, [
      el("span", { class: "field__label", text: t("profile.seekingLabel") }),
      el("p", { class: "field__hint", text: t("profile.seekingHint") }),
      genderButtons(seeking, (v) => { seeking = v; }, true),
    ]),

    el("div", { class: "field" }, [
      el("label", { class: "field__label", text: t("profile.bioLabel") }),
      el("p", { class: "field__hint", text: t("profile.bioHint") }),
      el("p", { class: "field__hint", text: t("profile.bioMinHint") }),
      bio,
      bioCounter,
    ]),

    el("div", { class: "field" }, [
      el("label", { class: "field__label", text: t("profile.appearanceLabel") }),
      el("p", { class: "field__hint", text: t("profile.appearanceHint") }),
      appearance,
    ]),

    el("div", { class: "field" }, [
      el("label", { class: "field__label", text: t("profile.tagsLabel") }),
      el("p", { class: "field__hint", text: t("profile.tagsHint") }),
      tags,
    ]),

    save,
  ]));
  setTab("me");
}

/* ---------- вопросы на совместимость ---------- */

async function questionsScreen() {
  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  const [questions, answers] = await Promise.all([
    guard(() => api.listQuestions()),
    guard(() => api.getMyAnswers()),
  ]);
  if (!questions) return;

  const answerByQuestion = new Map((answers ?? []).map((a) => [a.question_id, a.answer_text]));

  const blocks = questions.map((q) => {
    const input = el("textarea", {
      class: "textarea",
      maxlength: "1000",
      placeholder: t("profile.answerPlaceholder"),
      style: "min-height: 90px",
    });
    input.value = answerByQuestion.get(q.id) ?? "";

    return el("div", { class: "field" }, [
      el("p", { class: "qa__question", text: q.text }),
      input,
      el("button", {
        class: "btn btn--quiet",
        text: t("profile.answerSave"),
        onclick: async () => {
          const value = input.value.trim();
          const done = value
            ? await guard(() => api.saveAnswer(q.id, value))
            : await guard(() => api.deleteAnswer(q.id));
          if (done !== null) { haptic("light"); toast(t("profile.saved")); }
        },
      }),
    ]);
  });

  render(screen([
    el("button", { class: "back-link", text: `← ${t("common.back")}`, onclick: () => profileEditScreen() }),
    el("h1", { class: "screen-title", text: t("profile.questionsTitle") }),
    el("p", { class: "screen-lede", text: t("profile.questionsLede") }),
    ...blocks,
  ]));
  setTab("me");
}

/* ---------- лента ---------- */

async function feedScreen() {
  if (!state.myProfile) {
    render(screen([
      el("h1", { class: "screen-title", text: t("feed.title") }),
      el("p", { class: "empty", text: t("feed.needProfile") }),
      el("button", { class: "btn", text: t("welcome.start"), onclick: () => profileEditScreen() }),
    ]));
    setTab("feed");
    return;
  }

  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  const data = await guard(() => api.getFeed({
    tags: state.filters.tags,
    keywords: state.filters.keywords,
    gender: state.filters.gender,
    exclude_liked: state.filters.exclude_liked,
  }));
  if (!data) return;

  const items = (data.items ?? []).map((item) =>
    el("article", {
      class: "feed-item",
      onclick: () => profileReadScreen(item.id),
    }, [
      el("p", { class: "feed-item__excerpt", text: excerpt(item.bio_text, 220) }),
      el("div", { class: "feed-item__meta" },
        (item.tags ?? []).slice(0, 5).map((tag) => el("span", { class: "chip chip--muted", text: tag }))),
    ]));

  render(screen([
    el("h1", { class: "screen-title", text: t("feed.title") }),
    filterPanel(),
    ...(items.length ? items : [el("p", { class: "empty", text: t("feed.empty") })]),
  ]));
  setTab("feed");
}

function excerpt(text, limit) {
  const clean = (text ?? "").trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
}

function filterPanel() {
  const tagsInput = el("input", { class: "input", placeholder: t("feed.filterTags") });
  tagsInput.value = state.filters.tags.join(", ");

  const wordsInput = el("input", { class: "input", placeholder: t("feed.filterKeywords") });
  wordsInput.value = state.filters.keywords.join(", ");

  const genderRow = el("div", { class: "choice-row" });
  [[null, t("feed.filterAny")], ["female", t("profile.genderFemale")], ["male", t("profile.genderMale")]]
    .forEach(([key, label]) => {
      const btn = el("button", {
        class: "choice",
        type: "button",
        text: label,
        "aria-pressed": String(state.filters.gender === key),
        onclick: () => {
          state.filters.gender = key;
          [...genderRow.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
        },
      });
      genderRow.append(btn);
    });

  return el("details", { class: "panel" }, [
    el("summary", { text: t("feed.filters") }),
    el("div", { style: "margin-top: 16px" }, [
      el("label", { class: "field__label", text: t("feed.filterTags") }),
      tagsInput,
      el("label", { class: "field__label", style: "margin-top:16px", text: t("feed.filterKeywords") }),
      wordsInput,
      el("label", { class: "field__label", style: "margin-top:16px", text: t("feed.filterGender") }),
      genderRow,
      el("div", { class: "btn-row", style: "margin-top:16px" }, [
        el("button", {
          class: "btn",
          text: t("feed.filterApply"),
          onclick: () => {
            state.filters.tags = tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
            state.filters.keywords = wordsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
            feedScreen();
          },
        }),
        el("button", {
          class: "btn btn--quiet",
          text: t("feed.filterReset"),
          onclick: () => {
            state.filters = { tags: [], keywords: [], gender: null, exclude_liked: true };
            feedScreen();
          },
        }),
      ]),
    ]),
  ]);
}

/* ---------- чтение чужой анкеты: симпатия только после дочитывания ---------- */

async function profileReadScreen(profileId) {
  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  const profile = await guard(() => api.getProfile(profileId));
  if (!profile) return;

  const answers = (profile.answers ?? []).map((a) =>
    el("div", { class: "qa" }, [
      el("p", { class: "qa__question", text: a.question_text }),
      el("p", { class: "reading", text: a.answer_text }),
      commentButton(profileId, `answer:${a.question_id}`, a.answer_text),
    ]));

  const likeBtn = el("button", {
    class: "btn btn--wide",
    text: t("read.like"),
    onclick: async () => {
      likeBtn.disabled = true;
      const result = await guard(() => api.like(profileId));
      if (result) {
        haptic("medium");
        toast(result.matched ? t("read.matched") : t("read.liked"));
        if (result.matched) matchesScreen();
        else feedScreen();
      } else {
        likeBtn.disabled = false;
      }
    },
  });

  const actions = el("div", { class: "read-gate__actions" }, [
    likeBtn,
    el("button", {
      class: "btn btn--quiet btn--wide",
      style: "margin-top: 12px",
      text: t("chat.writeTo"),
      onclick: () => commentSheet(profileId, null, profile.bio_text),
    }),
    el("button", {
      class: "btn btn--danger btn--wide",
      style: "margin-top: 12px",
      text: t("read.report"),
      onclick: () => reportSheet(profileId),
    }),
  ]);

  const gate = el("div", { class: "read-gate" }, [
    el("p", { class: "read-gate__hint", text: t("read.gateHint") }),
    actions,
  ]);

  render(screen([
    el("button", { class: "back-link", text: `← ${t("common.back")}`, onclick: () => feedScreen() }),

    el("section", { class: "profile-read__section" }, [
      el("p", { class: "label", text: t("read.about") }),
      el("p", { class: "reading", text: profile.bio_text }),
      commentButton(profileId, "bio", profile.bio_text),
    ]),

    profile.appearance_text
      ? el("section", { class: "profile-read__section" }, [
          el("p", { class: "label", text: t("read.appearance") }),
          el("p", { class: "reading", text: profile.appearance_text }),
          commentButton(profileId, "appearance", profile.appearance_text),
        ])
      : null,

    (profile.tags ?? []).length
      ? el("div", { class: "feed-item__meta", style: "margin-bottom: 32px" },
          profile.tags.map((tag) => el("span", { class: "chip chip--muted", text: tag })))
      : null,

    answers.length
      ? el("section", { class: "profile-read__section" }, [
          el("p", { class: "label", text: t("read.answers") }),
          ...answers,
        ])
      : null,

    gate,
  ]));
  setTab("feed");

  // Вот она, механика: пока низ анкеты не показался на экране, симпатию поставить нельзя.
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      actions.classList.add("is-unlocked");
      observer.disconnect();
    }
  }, { threshold: 0.6 });
  observer.observe(gate);
}

function reportSheet(profileId) {
  const reasons = ["empty_or_stub", "not_about_person", "wrong_gender", "abuse"];
  const panel = el("div", { class: "panel" }, [
    el("p", { class: "field__label", text: t("report.title") }),
    ...reasons.map((reason) =>
      el("button", {
        class: "btn btn--quiet btn--wide",
        style: "margin-bottom: 8px",
        text: t(`report.${reason}`),
        onclick: async () => {
          const done = await guard(() => api.report(profileId, reason));
          if (done !== null) { toast(t("report.sent")); feedScreen(); }
        },
      })),
    el("button", { class: "btn btn--quiet btn--wide", text: t("common.cancel"), onclick: () => panel.remove() }),
  ]);
  root.querySelector(".screen")?.append(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- матчи ---------- */

async function matchesScreen() {
  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  const matches = await guard(() => api.listMatches());
  if (!matches) return;

  const rows = matches.map((m) => {
    const actions = el("div", { class: "btn-row", style: "margin-top: 12px" });

    if (m.both_consented && m.other_username) {
      actions.append(el("a", {
        class: "btn",
        href: `https://t.me/${m.other_username}`,
        target: "_blank",
        rel: "noopener",
        text: t("matches.openChat"),
      }));
    } else if (m.i_consented) {
      actions.append(el("span", { class: "chip chip--muted", text: t("matches.consentPending") }));
      actions.append(el("button", {
        class: "btn btn--quiet",
        text: t("matches.revoke"),
        onclick: async () => { await guard(() => api.revokeConsent(m.match_id)); matchesScreen(); },
      }));
    } else {
      actions.append(el("button", {
        class: "btn",
        text: t("matches.consent"),
        onclick: async () => { await guard(() => api.consentShareUsername(m.match_id)); matchesScreen(); },
      }));
    }

    return el("div", { class: "panel" }, [
      m.other_profile_id
        ? el("button", {
            class: "btn btn--quiet",
            text: t("read.about"),
            onclick: () => profileReadScreen(m.other_profile_id),
          })
        : null,
      actions,
    ]);
  });

  render(screen([
    el("h1", { class: "screen-title", text: t("matches.title") }),
    ...(rows.length ? rows : [el("p", { class: "empty", text: t("matches.empty") })]),
  ]));
  setTab("matches");
}

/* ---------- игры ---------- */

async function gamesScreen() {
  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  const [games, matches] = await Promise.all([
    guard(() => api.listGames()),
    guard(() => api.listMatches()),
  ]);
  if (!games) return;

  const playable = (matches ?? []).filter((m) => m.other_profile_id);

  const blocks = games.map((game) =>
    el("div", { class: "panel" }, [
      el("p", { class: "field__label", text: game.title }),
      el("p", { class: "field__hint", text: game.description }),
      ...(playable.length
        ? playable.map((m) => el("button", {
            class: "btn btn--quiet",
            style: "margin-right: 8px; margin-top: 8px",
            text: `${t("games.start")} #${m.other_profile_id}`,
            onclick: async () => {
              const session = await guard(() => api.startGame(game.id, m.other_profile_id));
              if (session) gameSessionScreen(session);
            },
          }))
        : [el("p", { class: "empty", text: t("games.empty") })]),
    ]));

  render(screen([
    el("h1", { class: "screen-title", text: t("games.title") }),
    el("p", { class: "screen-lede", text: t("games.lede") }),
    ...blocks,
  ]));
  setTab("games");
}

function gameSessionScreen(session) {
  const input = el("input", { class: "input", placeholder: t("games.messagePlaceholder"), maxlength: "1000" });

  const send = el("button", {
    class: "btn",
    text: t("games.send"),
    disabled: session.finished ? "" : null,
    onclick: async () => {
      const text = input.value.trim();
      if (!text) return;
      send.disabled = true;
      const next = await guard(() => api.sendGameMessage(session.session_id, text));
      send.disabled = false;
      input.value = "";
      if (next) gameSessionScreen(next);
    },
  });

  const statusText = session.finished
    ? t("games.finished")
    : session.my_turn ? t("games.yourTurn") : t("games.waiting");

  render(screen([
    el("button", { class: "back-link", text: `← ${t("common.back")}`, onclick: () => gamesScreen() }),
    el("div", { class: "game-log" }, (session.log ?? []).map((line) => el("p", { class: "game-line", text: line }))),
    el("p", { class: "label", text: statusText }),
    session.finished ? null : el("div", { class: "btn-row" }, [input, send]),
    el("button", {
      class: "btn btn--quiet",
      style: "margin-top: 16px",
      text: t("common.retry"),
      onclick: async () => {
        const fresh = await guard(() => api.getGameSession(session.session_id));
        if (fresh) gameSessionScreen(fresh);
      },
    }),
  ]));
  setTab("games");
}

/* ---------- микроблог ---------- */

const blogFilters = { tags: [], keywords: [] };

async function blogScreen() {
  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  const posts = await guard(() => api.listPosts({
    tags: blogFilters.tags,
    keywords: blogFilters.keywords,
  }));
  if (!posts) return;

  const tagsInput = el("input", { class: "input", placeholder: t("blog.filterTags") });
  tagsInput.value = blogFilters.tags.join(", ");
  const wordsInput = el("input", { class: "input", placeholder: t("blog.filterKeywords") });
  wordsInput.value = blogFilters.keywords.join(", ");

  const filters = el("details", { class: "panel" }, [
    el("summary", { text: t("feed.filters") }),
    el("div", { style: "margin-top: 16px" }, [
      el("p", { class: "field__hint", text: t("blog.filterHint") }),
      tagsInput,
      el("div", { style: "height: 12px" }),
      wordsInput,
      el("div", { class: "btn-row", style: "margin-top: 16px" }, [
        el("button", {
          class: "btn",
          text: t("feed.filterApply"),
          onclick: () => {
            blogFilters.tags = tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
            blogFilters.keywords = wordsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
            blogScreen();
          },
        }),
        el("button", {
          class: "btn btn--quiet",
          text: t("feed.filterReset"),
          onclick: () => { blogFilters.tags = []; blogFilters.keywords = []; blogScreen(); },
        }),
      ]),
    ]),
  ]);

  const input = el("textarea", { class: "textarea", maxlength: String(CONFIG.MAX_POST), placeholder: t("blog.placeholder") });

  render(screen([
    el("button", { class: "back-link", text: `← ${t("common.back")}`, onclick: () => meScreen() }),
    el("h1", { class: "screen-title", text: t("blog.title") }),
    el("p", { class: "screen-lede", text: t("blog.lede") }),
    filters,
    input,
    el("button", {
      class: "btn",
      style: "margin: 12px 0 32px",
      text: t("blog.publish"),
      onclick: async () => {
        const text = input.value.trim();
        if (!text) return;
        const done = await guard(() => api.createPost(text));
        if (done) { haptic("light"); blogScreen(); }
      },
    }),
    ...(posts.length
      ? posts.map((post) => el("div", { class: "panel" }, [
          el("p", { class: "reading", text: post.content }),
          post.is_mine
            ? el("button", {
                class: "btn btn--danger",
                style: "margin-top: 12px",
                text: t("blog.delete"),
                onclick: async () => { await guard(() => api.deletePost(post.id)); blogScreen(); },
              })
            : null,
        ]))
      : [el("p", { class: "empty", text: t("blog.empty") })]),
  ]));
  setTab("me");
}

/* ---------- "Я": анкета, блог, настройки ---------- */

function meScreen() {
  const themeRow = el("div", { class: "choice-row" });
  [["auto", t("settings.themeAuto")], ["light", t("settings.themeLight")], ["dark", t("settings.themeDark")]]
    .forEach(([mode, label]) => {
      const btn = el("button", {
        class: "choice",
        type: "button",
        text: label,
        "aria-pressed": String(currentMode() === mode),
        onclick: () => {
          applyTheme(mode);
          [...themeRow.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
        },
      });
      themeRow.append(btn);
    });

  const langRow = el("div", { class: "choice-row" });
  CONFIG.LANGS.forEach((lang) => {
    const btn = el("button", {
      class: "choice",
      type: "button",
      text: lang.toUpperCase(),
      "aria-pressed": String(currentLang() === lang),
      onclick: async () => {
        await loadLang(lang);
        meScreen();
      },
    });
    langRow.append(btn);
  });

  render(screen([
    el("h1", { class: "screen-title", text: t("settings.title") }),

    el("div", { class: "setting-row" }, [
      el("span", { text: t("profile.editTitle") }),
      el("button", { class: "btn btn--quiet", text: t("settings.openBlog"), onclick: () => profileEditScreen() }),
    ]),
    el("div", { class: "setting-row" }, [
      el("span", { text: t("profile.questionsTitle") }),
      el("button", { class: "btn btn--quiet", text: t("settings.openBlog"), onclick: () => questionsScreen() }),
    ]),
    el("div", { class: "setting-row" }, [
      el("span", { text: t("settings.blog") }),
      el("button", { class: "btn btn--quiet", text: t("settings.openBlog"), onclick: () => blogScreen() }),
    ]),

    el("div", { class: "field", style: "margin-top: 24px" }, [
      el("span", { class: "field__label", text: t("settings.theme") }),
      themeRow,
    ]),
    el("div", { class: "field" }, [
      el("span", { class: "field__label", text: t("settings.language") }),
      langRow,
    ]),

    el("button", {
      class: "btn btn--danger btn--wide",
      style: "margin-top: 24px",
      text: t("profile.deleteProfile"),
      onclick: async () => {
        if (!confirm(t("profile.deleteConfirm"))) return;
        const done = await guard(() => api.deleteMyProfile());
        if (done !== null) { state.myProfile = null; welcomeScreen(); }
      },
    }),
  ]));
  setTab("me");
}


/* ---------- беседы: история локальна, сервер только доставляет ---------- */

async function syncInbox() {
  const incoming = await guard(() => api.fetchInbox());
  if (!incoming || !incoming.length) return new Set();
  return chatStore.appendMany(incoming);
}

async function threadsScreen() {
  render(screen([el("p", { class: "empty", text: t("common.loading") })]));

  await syncInbox();
  const threads = await guard(() => api.listThreads());
  if (!threads) return;

  const rows = threads.map((thread) => {
    const preview = chatStore.lastMessagePreview(thread.thread_id);
    const unread = chatStore.unreadCount(thread.thread_id);
    return el("div", { class: "feed-item", onclick: () => chatScreen(thread) }, [
      el("p", { class: "feed-item__excerpt", text: preview ? excerpt(preview, 120) : "—" }),
      el("div", { class: "feed-item__meta" }, [
        unread ? el("span", { class: "chip", text: String(unread) }) : null,
        thread.both_consented && thread.other_username
          ? el("span", { class: "chip chip--muted", text: `@${thread.other_username}` })
          : null,
      ]),
    ]);
  });

  render(screen([
    el("h1", { class: "screen-title", text: t("chat.title") }),
    el("p", { class: "screen-lede", text: t("chat.localWarning") }),
    ...(rows.length ? rows : [el("p", { class: "empty", text: t("chat.empty") })]),
  ]));
  setTab("chat");
}

function consentBlock(thread) {
  if (!thread.match_id) {
    return el("p", { class: "field__hint", text: t("chat.needMatch") });
  }
  if (thread.both_consented && thread.other_username) {
    return el("a", {
      class: "btn",
      href: `https://t.me/${thread.other_username}`,
      target: "_blank",
      rel: "noopener",
      text: `@${thread.other_username}`,
    });
  }
  if (thread.i_consented) {
    return el("div", { class: "btn-row" }, [
      el("span", { class: "chip chip--muted", text: t("chat.consentPending") }),
      el("button", {
        class: "btn btn--quiet",
        text: t("chat.revoke"),
        onclick: async () => { await guard(() => api.revokeConsent(thread.match_id)); threadsScreen(); },
      }),
    ]);
  }
  return el("button", {
    class: "btn",
    text: t("chat.consent"),
    onclick: async () => { await guard(() => api.consentShareUsername(thread.match_id)); threadsScreen(); },
  });
}

async function chatScreen(thread) {
  await syncInbox();
  chatStore.markThreadRead(thread.thread_id);

  const messages = chatStore.loadThread(thread.thread_id);
  const input = el("input", {
    class: "input",
    placeholder: t("chat.placeholder"),
    maxlength: String(CONFIG.MAX_MESSAGE),
  });

  const send = async () => {
    const body = input.value.trim();
    if (!body) return;
    if (!thread.other_profile_id) return toast(t("common.errorGeneric"));
    input.value = "";
    const sent = await guard(() => api.sendMessage({ toProfileId: thread.other_profile_id, body }));
    if (sent) {
      chatStore.appendMessage(thread.thread_id, {
        id: `local-${Date.now()}`,
        body,
        mine: true,
        read: true,
        created_at: new Date().toISOString(),
      });
      chatScreen(thread);
    }
  };

  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  render(screen([
    el("button", { class: "back-link", text: `← ${t("common.back")}`, onclick: () => threadsScreen() }),

    el("div", { class: "panel" }, [
      el("p", { class: "field__label", text: t("chat.consentTitle") }),
      el("p", { class: "field__hint", text: t("chat.consentHint") }),
      consentBlock(thread),
    ]),

    el("div", { class: "game-log" }, messages.map((m) =>
      el("div", { class: "game-line", style: m.mine ? "margin-left: 24px; opacity: .85" : "" }, [
        m.quote ? el("p", { class: "qa__question", text: `« ${excerpt(m.quote, 140)} »` }) : null,
        el("p", { class: "reading", text: m.body }),
      ]))),

    messages.length ? null : el("p", { class: "empty", text: t("chat.empty") }),

    el("div", { class: "btn-row" }, [
      input,
      el("button", { class: "btn", text: t("chat.send"), onclick: send }),
    ]),
  ]));
  setTab("chat");
}

/** Комментарий к конкретному блоку анкеты — превращается в беседу с автором. */
function commentSheet(profileId, anchor, quoteText) {
  const input = el("textarea", {
    class: "textarea",
    style: "min-height: 110px",
    maxlength: String(CONFIG.MAX_MESSAGE),
    placeholder: t("comment.placeholder"),
  });

  const isComment = Boolean(anchor);

  const panel = el("div", { class: "panel" }, [
    el("p", { class: "field__label", text: isComment ? t("comment.title") : t("chat.writeTo") }),
    isComment ? el("p", { class: "qa__question", text: `« ${excerpt(quoteText, 200)} »` }) : null,
    input,
    el("div", { class: "btn-row", style: "margin-top: 12px" }, [
      el("button", {
        class: "btn",
        text: isComment ? t("comment.send") : t("chat.send"),
        onclick: async () => {
          const body = input.value.trim();
          if (!body) return;
          const sent = await guard(() => api.sendMessage({
            toProfileId: profileId,
            body,
            anchor,
            quote: isComment ? excerpt(quoteText, 270) : null,
          }));
          if (sent) {
            chatStore.appendMessage(sent.thread_id, {
              id: `local-${Date.now()}`,
              body,
              quote: isComment ? excerpt(quoteText, 270) : null,
              mine: true,
              read: true,
              created_at: new Date().toISOString(),
            });
            haptic("light");
            toast(t("comment.sent"));
            threadsScreen();
          }
        },
      }),
      el("button", { class: "btn btn--quiet", text: t("common.cancel"), onclick: () => panel.remove() }),
    ]),
  ]);

  root.querySelector(".screen")?.append(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Кнопка "прокомментировать" под блоком анкеты. */
function commentButton(profileId, anchor, quoteText) {
  return el("button", {
    class: "btn btn--quiet",
    style: "margin-top: 8px",
    text: t("comment.action"),
    onclick: () => commentSheet(profileId, anchor, quoteText),
  });
}

/* ---------- навигация ---------- */

const TABS = [
  ["feed", () => feedScreen()],
  ["chat", () => threadsScreen()],
  ["matches", () => matchesScreen()],
  ["games", () => gamesScreen()],
  ["me", () => meScreen()],
];

function buildTabBar() {
  tabBar.replaceChildren(...TABS.map(([key, go]) =>
    el("button", {
      class: "tab",
      text: t(`tabs.${key}`),
      "data-tab": key,
      onclick: () => { haptic("light"); go(); },
    })));
}

function setTab(key) {
  state.tab = key;
  [...tabBar.children].forEach((btn) => {
    if (btn.dataset.tab === key) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

/* ---------- запуск ---------- */

async function boot() {
  const tg = window.Telegram?.WebApp;
  tg?.ready?.();
  tg?.expand?.();

  applyTheme();
  watchSystemTheme();

  const preferred = savedLang() || tg?.initDataUnsafe?.user?.language_code || CONFIG.DEFAULT_LANG;
  await loadLang(preferred);
  buildTabBar();

  const profile = await guard(() => api.getMyProfile());
  state.myProfile = profile;

  if (profile) feedScreen();
  else welcomeScreen();

  // Забираем новые сообщения, пока приложение открыто. Сервер отдаёт их
  // один раз, дальше они живут в локальной истории.
  setInterval(() => { syncInbox(); }, 20000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncInbox();
  });
}

boot();
