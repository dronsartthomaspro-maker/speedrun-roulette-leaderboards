"use strict";
/*
 * Speedrun Roulette — public leaderboards.
 * Reads the same Supabase project as the mod, with the same PUBLIC (anon) key: read-only RPCs and
 * tables that the database already exposes for reading (RLS). Nothing is written from this page.
 * Every text coming from the database (names, titles, descriptions) is inserted as plain text.
 */
const SUPABASE_URL = "https://foswcmxxuacyixscikya.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvc3djbXh4dWFjeWl4c2Npa3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNzI3NDAsImV4cCI6MjEwMjc0ODc0MH0.ZX9B7lMDfYeInX4c-GFZsH0IaWw5dqwCwgyPA1mz3QU"; // public key (role anon), same as in the mod
const REFRESH_MS = 60_000;

// ------------------------------------------------------------------ i18n
const I18N = {
  en: {
    tabDaily: "Daily Challenge", tabHall: "Best players", tabChallenges: "Challenges",
    today: "Today", yesterday: "Yesterday", theChallenge: "The challenge", leaderboard: "Leaderboard",
    mostWins: "Most Daily wins", mostWinsHint: "Number of days finished in first place.",
    recentWinners: "Recent winners",
    footer: "Speedrun Roulette — a Minecraft speedrun mod (Fabric 26.3).",
    notMojang: "Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.",
    loading: "Loading…", error: "Could not reach the leaderboard server. It will retry by itself.",
    nobodyToday: "Nobody has finished today's challenge yet. Be the first!",
    nobodyYesterday: "Nobody finished yesterday's challenge.",
    nobodyChallenge: "No finished run on this challenge yet.",
    noWinners: "No Daily winner yet.",
    players: n => `(${n} ${n > 1 ? "players" : "player"})`,
    wins: n => `${n} ${n > 1 ? "wins" : "win"}`,
    next: t => `Next challenge in ${t}`,
    finalResults: "Final results",
    date: d => `Day (UTC): ${d}`,
    mode: (m, n) => `Mode: ${m} · ${n} ${n > 1 ? "objectives" : "objective"}`,
    challengeMeta: (m, n, limit) => `Mode: ${m} · ${n} ${n > 1 ? "objectives" : "objective"}${limit ? " · time limit " + limit : ""}`,
    updated: t => `· updated ${t}`,
    types: { ITEM: "item", BLOCK: "block", ADVANCEMENT: "adv.", KILL: "kill", BIOME: "biome", EAT: "eat", POTION: "effect", BREED: "breed" },
  },
  fr: {
    tabDaily: "Défi du jour", tabHall: "Meilleurs joueurs", tabChallenges: "Défis",
    today: "Aujourd'hui", yesterday: "Hier", theChallenge: "Le défi", leaderboard: "Classement",
    mostWins: "Le plus de Daily gagnés", mostWinsHint: "Nombre de jours terminés à la première place.",
    recentWinners: "Derniers vainqueurs",
    footer: "Speedrun Roulette — un mod de speedrun Minecraft (Fabric 26.3).",
    notMojang: "Produit non officiel Minecraft. Non approuvé par Mojang ou Microsoft et sans lien avec eux.",
    loading: "Chargement…", error: "Impossible de joindre le serveur des classements. Nouvel essai automatique.",
    nobodyToday: "Personne n'a encore terminé le défi du jour. Sois le premier !",
    nobodyYesterday: "Personne n'a terminé le défi d'hier.",
    nobodyChallenge: "Aucune run terminée sur ce défi pour l'instant.",
    noWinners: "Pas encore de vainqueur du Daily.",
    players: n => `(${n} joueur${n > 1 ? "s" : ""})`,
    wins: n => `${n} victoire${n > 1 ? "s" : ""}`,
    next: t => `Prochain défi dans ${t}`,
    finalResults: "Résultats définitifs",
    date: d => `Jour (UTC) : ${d}`,
    mode: (m, n) => `Mode : ${m} · ${n} objectif${n > 1 ? "s" : ""}`,
    challengeMeta: (m, n, limit) => `Mode : ${m} · ${n} objectif${n > 1 ? "s" : ""}${limit ? " · limite " + limit : ""}`,
    updated: t => `· mis à jour à ${t}`,
    types: { ITEM: "item", BLOCK: "bloc", ADVANCEMENT: "succès", KILL: "tuer", BIOME: "biome", EAT: "manger", POTION: "effet", BREED: "élevage" },
  },
};
let lang = (localStorageGet("lang") || (navigator.language || "en")).toLowerCase().startsWith("fr") ? "fr" : "en";
const t = key => I18N[lang][key];

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

// ------------------------------------------------------------------ Supabase
async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------ helpers
const $ = id => document.getElementById(id);
const utcDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

function fmtTime(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const total = Math.floor(ms / 1000), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  const cs = Math.floor((ms % 1000) / 10);
  const p = n => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}.${p(cs)}` : `${p(m)}:${p(s)}.${p(cs)}`;
}

/** "minecraft:light_gray_stained_glass_pane" → "Light Gray Stained Glass Pane" */
function humanize(id) {
  const last = String(id || "?").split(/[/:]/).pop();
  return last.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function objectiveLabel(o) {
  const id = String(o.id || "");
  const type = String(o.type || "ITEM").toUpperCase();
  return { type, name: humanize(id) };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function headUrl(uuid, size) {
  return uuid ? `https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/${size}` : "";
}
function setHead(img, uuid, size) {
  const url = headUrl(uuid, size);
  if (!url) { img.style.visibility = "hidden"; return; }
  img.src = url;
  img.onerror = () => { img.style.visibility = "hidden"; };
}

function setState(id, text) { $(id).textContent = text || ""; }

/** Podium (top 3) + the full list. rows: [{uuid, name, value}] */
function renderBoard(podiumId, boardId, rows, valueClass) {
  const podium = $(podiumId), board = $(boardId);
  podium.replaceChildren();
  board.replaceChildren();
  const medals = ["🥇", "🥈", "🥉"];
  rows.slice(0, 3).forEach((r, i) => {
    const step = el("div", `step p${i + 1}`);
    step.append(el("div", "medal", medals[i]));
    const img = el("img"); img.alt = ""; img.width = 40; img.height = 40; setHead(img, r.uuid, 40);
    step.append(img, el("div", "pname", r.name), el("div", "ptime", r.value));
    podium.append(step);
  });
  const tpl = $("row-tpl");
  rows.forEach((r, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.querySelector(".rank").textContent = `${i + 1}.`;
    setHead(li.querySelector(".head"), r.uuid, 24);
    li.querySelector(".name").textContent = r.name;
    const v = li.querySelector(".time");
    v.textContent = r.value;
    if (valueClass) v.classList.add(valueClass);
    board.append(li);
  });
}

// ------------------------------------------------------------------ Daily
let dailyDay = "today";

async function loadDaily() {
  const day = dailyDay === "today" ? utcDay(0) : utcDay(-1);
  document.querySelectorAll(".seg").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === dailyDay)));
  $("daily-date").textContent = t("date")(day);
  setState("daily-state", t("loading"));
  try {
    const [cfgRows, lb] = await Promise.all([
      rpc("get_today_challenge", { p_day: day }),
      rpc("get_daily_leaderboard", { p_day: day, p_limit: 200 }),
    ]);
    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : null;
    const list = $("daily-objectives");
    list.replaceChildren();
    const objectives = (cfg && Array.isArray(cfg.objectives)) ? cfg.objectives : [];
    // The day's titles are the objective name in French and in English. Older rows carry the
    // name in the language of the player who published them (the same text twice): not used.
    const titled = cfg && objectives.length === 1 && cfg.special_title_fr && cfg.special_title_en
        && cfg.special_title_fr !== cfg.special_title_en;
    $("daily-title").hidden = true;
    for (const o of objectives) {
      const { type } = objectiveLabel(o);
      const name = titled ? (lang === "fr" ? cfg.special_title_fr : cfg.special_title_en) : objectiveLabel(o).name;
      const li = el("li");
      li.append(el("span", "otype", t("types")[type] || type.toLowerCase()), el("span", "oname", name));
      list.append(li);
    }
    $("daily-mode").textContent = cfg ? t("mode")(cfg.mini_game_mode || "CLASSIC", objectives.length || cfg.objective_count || 1) : "";

    const winners = (lb || []).filter(r => r && r.won && !r.aborted_creative);
    $("daily-count").textContent = winners.length ? t("players")(winners.length) : "";
    renderBoard("daily-podium", "daily-board", winners.map(r => ({ uuid: r.player_uuid, name: r.player_name || "?", value: fmtTime(r.time_ms) })));
    setState("daily-state", winners.length ? (dailyDay === "yesterday" ? t("finalResults") : "") : t(dailyDay === "today" ? "nobodyToday" : "nobodyYesterday"));
  } catch (e) {
    console.warn(e);
    setState("daily-state", t("error"));
  }
}

function tickCountdown() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const s = Math.max(0, Math.floor((next - now.getTime()) / 1000));
  const p = n => String(n).padStart(2, "0");
  $("daily-countdown").textContent = t("next")(`${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`);
  if (s === 0) setTimeout(loadDaily, 3000);
}

// ------------------------------------------------------------------ Best players
async function loadHall() {
  setState("hall-state", t("loading"));
  setState("history-state", t("loading"));
  try {
    const players = await rest("players?select=uuid,display_name,daily_first_place_count,banned_until"
      + "&daily_first_place_count=gt.0&order=daily_first_place_count.desc,display_name.asc&limit=50");
    const rows = players.filter(p => !p.banned_until || new Date(p.banned_until) < new Date())
      .map(p => ({ uuid: p.uuid, name: p.display_name || "?", value: t("wins")(p.daily_first_place_count) }));
    renderBoard("hall-podium", "hall-board", rows);
    setState("hall-state", rows.length ? "" : t("noWinners"));
  } catch (e) {
    console.warn(e);
    setState("hall-state", t("error"));
  }
  try {
    const recent = await rpc("get_recent_daily_winners_public", { p_limit: 30 });
    const board = $("hall-history");
    board.replaceChildren();
    const tpl = $("row-tpl");
    for (const r of recent || []) {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector(".rank").textContent = r.day_date || "";
      setHead(li.querySelector(".head"), r.winner_uuid, 24);
      li.querySelector(".name").textContent = r.winner_name || "?";
      li.querySelector(".time").textContent = fmtTime(r.winning_time_ms);
      board.append(li);
    }
    setState("history-state", (recent || []).length ? "" : t("noWinners"));
  } catch (e) {
    console.warn(e);
    setState("history-state", t("error"));
  }
}

// ------------------------------------------------------------------ Challenges
let challenges = [];
let selectedChallenge = localStorageGet("challenge");

async function loadChallenges() {
  try {
    const list = await rpc("get_published_challenges_i18n_public", { p_lang: lang });
    challenges = (list || []).filter(c => c && !c.retired_at).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!challenges.some(c => c.id === selectedChallenge)) selectedChallenge = challenges[0] && challenges[0].id;
    const chips = $("challenge-chips");
    chips.replaceChildren();
    for (const c of challenges) {
      const b = el("button", "chip", c.name_localized || c.name);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(c.id === selectedChallenge));
      b.addEventListener("click", () => { selectedChallenge = c.id; localStorageSet("challenge", c.id); loadChallenges(); });
      chips.append(b);
    }
    await loadChallengeBoard();
  } catch (e) {
    console.warn(e);
    setState("challenge-state", t("error"));
  }
}

function difficultyClass(raw) {
  const d = String(raw || "").toLowerCase();
  if ((d.startsWith("e") && !d.startsWith("ex")) || d.startsWith("f")) return "easy";        // Easy / Facile
  if (d.startsWith("m")) return "medium";                                                   // Medium / Moyen
  if (d.startsWith("ex")) return "extreme";                                                 // Extreme / Extrême+
  return "hard";
}

async function loadChallengeBoard() {
  const c = challenges.find(x => x.id === selectedChallenge);
  if (!c) return;
  $("challenge-name").textContent = c.name_localized || c.name;
  const badge = $("challenge-difficulty");
  badge.textContent = c.difficulty_localized || c.difficulty || "";
  badge.className = `badge ${difficultyClass(c.difficulty)}`;
  $("challenge-description").textContent = c.description_localized || c.description || "";
  const limit = c.time_limit_sec > 0 ? fmtTime(c.time_limit_sec * 1000).replace(/\.\d+$/, "") : "";
  $("challenge-meta").textContent = t("challengeMeta")(c.mini_game_mode || "CLASSIC", c.objective_count || 1, limit);
  setState("challenge-state", t("loading"));
  try {
    const rows = await rpc("get_challenge_leaderboard", { p_challenge_id: c.id, p_limit: 100 });
    const winners = (rows || []).filter(r => r && r.won && !r.creative_abort)
      .sort((a, b) => a.time_ms - b.time_ms);
    $("challenge-count").textContent = winners.length ? t("players")(winners.length) : "";
    renderBoard("challenge-podium", "challenge-board", winners.map(r => ({ uuid: r.player_uuid, name: r.player_name || "?", value: fmtTime(r.time_ms) })));
    setState("challenge-state", winners.length ? "" : t("nobodyChallenge"));
  } catch (e) {
    console.warn(e);
    setState("challenge-state", t("error"));
  }
}

// ------------------------------------------------------------------ tabs, language, refresh
const loaders = { daily: loadDaily, hall: loadHall, challenges: loadChallenges };
let current = "daily";

function showTab(name) {
  if (!loaders[name]) name = "daily";
  current = name;
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
  loaders[name]();
  stamp();
}

function applyLang() {
  document.documentElement.lang = lang;
  $("lang").textContent = lang === "fr" ? "EN" : "FR";
  document.querySelectorAll("[data-i18n]").forEach(e => {
    const v = t(e.dataset.i18n);
    if (typeof v === "string") e.textContent = v;
  });
  tickCountdown();
}

function stamp() {
  const time = new Date().toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  $("updated").textContent = t("updated")(time);
}

// the "Best players" list gets a podium too (created here, it has no element in the HTML)
(function addHallPodium() {
  const board = $("hall-board");
  const podium = el("div", "podium");
  podium.id = "hall-podium";
  board.before(podium);
})();

document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.querySelectorAll(".seg").forEach(b => b.addEventListener("click", () => { dailyDay = b.dataset.day; loadDaily(); }));
$("lang").addEventListener("click", () => {
  lang = lang === "fr" ? "en" : "fr";
  localStorageSet("lang", lang);
  applyLang();
  showTab(current);
});
window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

applyLang();
showTab(location.hash.slice(1) || "daily");
setInterval(tickCountdown, 1000);
setInterval(() => { if (!document.hidden) { loaders[current](); stamp(); } }, REFRESH_MS);
