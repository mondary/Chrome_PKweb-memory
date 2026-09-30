/* Cœur métier des sessions (fusion src3) : validation, recherche, retraits,
   annulations, purge des captures et migration des anciens instantanés.
   Script classique partagé par la page (sessions.js) et le service worker
   (sw.js) — n'expose que globalThis.PKSessionCore, aucune dépendance. */
"use strict";

(() => {
  // dailySave/dailyHour/dailyClose : session quotidienne à heure fixe (voir sw.js).
  // badge : contenu de la pastille de l'icône (tabs = onglets ouverts,
  // dupes = onglets en double, none = aucune).
  // newtab : section ouverte au démarrage de l'app et en page « nouvel
  // onglet » (Ctrl+T, déclarée dans le manifest) ; off = ouverture sur les favoris.
  // rowThumbs : affichage de la timeline sessions (full = aperçu + miniatures
  // + favicons, preview = aperçu + favicons, thumbs = miniatures + favicons,
  // favicons = favicons seuls).
  const DEFAULT_SETTINGS = { autosave: true, sleepMinutes: 0, previews: true,
    dailySave: true, dailyHour: 7, dailyClose: false, dailyExport: false, badge: "tabs", newtab: "sessions",
    rowThumbs: "preview" };
  const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  const emptyState = () => ({ sessions: [], settings: { ...DEFAULT_SETTINGS } });
  const text = (value, limit) => (typeof value === "string" ? value.slice(0, limit) : "");

  function webURL(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function tabURL(tab) {
    const raw = tab.pendingUrl || tab.url || "";
    if (webURL(raw)) return webURL(raw);
    if (!/^(chrome|chrome-extension|edge|about):/i.test(raw)) return null;
    const match = /[?#&](?:url|uri)=([^&#]+)/i.exec(raw);
    if (!match) return null;
    try { return webURL(decodeURIComponent(match[1])); } catch { return null; }
  }

  function cleanTab(tab) {
    const url = webURL(tab?.url);
    if (!url) throw new Error("Chaque onglet doit contenir une URL http ou https valide.");
    return {
      url, title: text(tab.title, 500) || url, note: text(tab.note, 4000),
      pinned: tab.pinned === true, active: tab.active === true,
      group: text(tab.group, 100), groupTitle: text(tab.groupTitle, 200),
      groupColor: COLORS.includes(tab.groupColor) ? tab.groupColor : "grey",
    };
  }

  function cleanSession(item, now = Date.now()) {
    if (!item || !Array.isArray(item.windows) || !item.windows.length || item.windows.length > 100) {
      throw new Error("Format de session invalide.");
    }
    let total = 0;
    const windows = item.windows.map((win) => {
      if (!Array.isArray(win.tabs) || !win.tabs.length) throw new Error("Une fenêtre ne peut pas être vide.");
      total += win.tabs.length;
      if (total > 5000) throw new Error("Maximum : 5 000 onglets par session.");
      return { tabs: win.tabs.map(cleanTab) };
    });
    const date = (value) => (Number.isFinite(value) && value > 0 && value <= now ? value : now);
    return {
      id: crypto.randomUUID(), title: text(item.title, 160).trim() || "Sans titre",
      note: text(item.note, 4000), tags: [...new Set((Array.isArray(item.tags) ? item.tags : [])
        .map((tag) => text(tag, 40).trim()).filter(Boolean))].slice(0, 12),
      favorite: item.favorite === true, archived: item.archived === true,
      auto: item.auto === true, createdAt: date(item.createdAt), updatedAt: date(item.updatedAt), windows,
    };
  }

  const allTabs = (session) => session.windows.flatMap((win) => win.tabs);
  const tabCount = (session) => allTabs(session).length;
  const fingerprint = (session) => JSON.stringify(session.windows.map((win) => win.tabs.map(
    ({ url, pinned, group, groupTitle, groupColor }) => ({ url, pinned, group, groupTitle, groupColor })
  )));

  function matches(session, query) {
    const haystack = [session.title, session.note, ...session.tags,
      ...allTabs(session).flatMap((tab) => [tab.title, tab.url, tab.note])].join(" ").toLocaleLowerCase();
    return query.trim().toLocaleLowerCase().split(/\s+/).every((word) => haystack.includes(word));
  }

  function parseBackup(value) {
    if (!value || value.format !== "pk-sessions" || value.schema !== 1 || !Array.isArray(value.sessions)) {
      throw new Error("Choisissez une sauvegarde JSON Sessions (format pk-sessions, version 1).");
    }
    if (value.sessions.length > 2000) throw new Error("Maximum : 2 000 sessions par import.");
    return value.sessions.map((item) => cleanSession(item));
  }

  function dedupe(session) {
    const seen = new Set();
    return { ...session, windows: session.windows.map((win) => ({ tabs: win.tabs.filter((tab) => {
      if (seen.has(tab.url)) return false;
      seen.add(tab.url); return true;
    }) })).filter((win) => win.tabs.length) };
  }

  // Nombre de doublons d'URLs strictes (niveau 1) : chaque occurrence
  // au-delà de la première compte. Sert à la pastille de l'icône.
  function duplicateCount(urls) {
    const seen = new Map();
    for (const url of urls) seen.set(url, (seen.get(url) || 0) + 1);
    let count = 0;
    for (const n of seen.values()) if (n > 1) count += n - 1;
    return count;
  }

  // Export d'une session façon Tablerone : URLs, titres, Markdown, HTML, CSV,
  // JSON. Les notes suivent le titre quand le format les porte ; le CSV est
  // protégé par des guillemets doubles doublés, le HTML est échappé.
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  function exportText(session, format = "urls") {
    const tabs = allTabs(session);
    if (format === "titles") return tabs.map((tab) => tab.title).join("\n");
    if (format === "markdown") return tabs.map((tab) =>
      `- [${tab.title.replace(/[\[\]\\]/g, "\\$&").replace(/\s+/g, " ")}](<${tab.url.replace(/>/g, "%3E")}>)${tab.note ? ` — ${tab.note.replace(/\s+/g, " ")}` : ""}`).join("\n");
    if (format === "html") return `<ul>\n${tabs.map((tab) =>
      `  <li><a href="${escapeHTML(tab.url)}">${escapeHTML(tab.title)}</a>${tab.note ? ` — ${escapeHTML(tab.note)}` : ""}</li>`).join("\n")}\n</ul>`;
    if (format === "csv") return ["Title,URL,Note", ...tabs.map((tab) =>
      [csvCell(tab.title), csvCell(tab.url), csvCell(tab.note || "")].join(","))].join("\n");
    if (format === "json") return JSON.stringify(tabs.map(({ title, url, note, pinned }) => ({ title, url, note, pinned })), null, 2);
    return tabs.map((tab) => tab.url).join("\n");
  }

  // Nom de fichier téléchargé : titre de session slugifié, accents retirés.
  function slugFilename(title, ext) {
    const base = text(title, 60).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "session";
    return `${base}.${ext}`;
  }

  function removeTab(session, position, expectedURL) {
    const match = /^(\d+):(\d+)$/.exec(String(position));
    if (!match) throw new Error("Position d’onglet invalide.");
    const [, wi, ti] = match.map(Number);
    const tab = session.windows[wi]?.tabs[ti];
    if (!tab || tab.url !== expectedURL) throw new Error("Cette ligne a changé. Actualisez avant de la retirer.");
    return session.windows.map((win, index) => ({ tabs: win.tabs.filter((_, i) => index !== wi || i !== ti) }))
      .filter((win) => win.tabs.length);
  }

  // Fusion de plusieurs sessions dans une cible : fenêtres concaténées, tags
  // et notes concaténés, favori conservé si l'une des sessions l'était. Au-delà
  // du plafond de 100 fenêtres, les onglets sont regroupés en fenêtres égales.
  function mergeSessions(target, sources) {
    const list = [target, ...(Array.isArray(sources) ? sources : [])];
    let windows = list.flatMap((session) => session.windows);
    if (windows.length > 100) {
      const tabs = windows.flatMap((win) => win.tabs);
      const size = Math.max(1, Math.ceil(tabs.length / 100));
      windows = Array.from({ length: Math.ceil(tabs.length / size) }, (_, i) => ({ tabs: tabs.slice(i * size, (i + 1) * size) }));
    }
    return cleanSession({
      ...target, auto: false, windows,
      tags: [...new Set(list.flatMap((session) => session.tags))],
      note: list.map((session) => session.note).filter(Boolean).join("\n\n"),
      favorite: list.some((session) => session.favorite),
    });
  }

  function prunePreviews(cache, now = Date.now()) {
    // ponytail: cache local borné (60 captures / 2 Mo) ; passer à IndexedDB si un historique plus large est nécessaire.
    let size = 0;
    return Object.fromEntries(Object.entries(cache).filter(([, item]) => item.at > now - 30 * 86400000)
      .sort((a, b) => b[1].at - a[1].at).slice(0, 60)
      .filter(([, item]) => (size += item.src.length) <= 2 * 1024 * 1024));
  }

  // Anciens instantanés « bs.sessions » ({id, name, capturedAt, auto, windows}) → sessions de la bibliothèque.
  // Les entrées invalides sont ignorées une à une : la migration n'échoue jamais en bloc.
  function migrateOldSessions(list, now = Date.now()) {
    const out = [];
    for (const old of Array.isArray(list) ? list : []) {
      if (!old || !Array.isArray(old.windows)) continue;
      const windows = old.windows.filter((win) => Array.isArray(win?.tabs) && win.tabs.length)
        .map((win) => ({ tabs: win.tabs.map((tab) => ({ ...tab, groupTitle: tab.groupTitle || tab.groupName || "" })) }));
      if (!windows.length) continue;
      try {
        out.push(cleanSession({
          title: String(old.name || (old.auto ? "Sauvegarde automatique" : "Session")),
          auto: old.auto === true,
          createdAt: Number(old.capturedAt) || now,
          updatedAt: Number(old.capturedAt) || now,
          windows,
        }, now));
      } catch { /* instantané invalide : ignoré */ }
    }
    return out;
  }

  globalThis.PKSessionCore = {
    DEFAULT_SETTINGS, COLORS, emptyState, webURL, tabURL, cleanTab, cleanSession,
    allTabs, tabCount, fingerprint, matches, parseBackup, dedupe, duplicateCount, exportText, slugFilename,
    removeTab, mergeSessions, prunePreviews, migrateOldSessions,
  };
})();
