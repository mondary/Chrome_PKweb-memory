/* Bibliothèque de capture de session, partagée entre la page (sessions.js) et
   le service worker (sw.js) : collecte tous les onglets de toutes les fenêtres,
   déballe les onglets suspendus par un gestionnaire (URL réelle dans le
   paramètre url/uri de la page de suspension) et attend que le paysage d'onglets
   soit stable — au démarrage de Chrome, l'auto-save peut se déclencher avant la
   fin de la restauration de session et ne voir qu'une fraction des fenêtres. */
"use strict";

(() => {
  // Les pages appartenant au navigateur ou portant un schéma que Chrome ne
  // peut pas rouvrir ne sont pas enregistrables. Les pages de suspension sont
  // traitées à part avant cette exclusion, quand leur URL web est récupérable.
  const SUSPENDED_SCHEME = /^(chrome|chrome-extension|edge|about):/i;
  const BLOCKED_SCHEME = /^(chrome|chrome-untrusted|chrome-extension|edge|about|devtools|view-source|javascript|data|file):/i;
  // URL réelle d'un onglet suspendu : paramètre url= ou uri=, query ou hash,
  // encodé (The Great/Marvellous Suspender, Tablerone) ou brut.
  const SUSPENDED_PARAM = /[?#&](?:url|uri)=([^&#]+)/i;

  function unwrapSuspended(url) {
    const s = String(url || "");
    if (!SUSPENDED_SCHEME.test(s)) return null;
    const m = SUSPENDED_PARAM.exec(s);
    if (!m) return null;
    let real = m[1];
    try {
      const dec = decodeURIComponent(real);
      if (/^https?:/i.test(dec)) real = dec;
    } catch { /* valeur non encodée : gardée telle quelle */ }
    if (!/^https?:/i.test(real)) return null;
    const tm = /[?&](?:title|t)=([^&#]+)/i.exec(s);
    let title;
    if (tm) { try { title = decodeURIComponent(tm[1]); } catch {} }
    return { url: real, title };
  }

  async function snapshotTabs() {
    const [tabs, wins, groups] = await Promise.all([
      chrome.tabs.query({}),
      chrome.windows.getAll().catch(() => []), // types de fenêtres, sans populate
      typeof chrome.tabGroups?.query === "function"
        ? chrome.tabGroups.query({}).catch(() => [])
        : Promise.resolve([]),
    ]);
    const winType = new Map(wins.map((w) => [w.id, w.type || "normal"]));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const byWindow = new Map();
    let ignored = 0;
    let unwrappedCount = 0;
    const excludedTabs = [];
    for (const t of tabs) {
      const type = winType.get(t.windowId) || "normal";
      if (type === "devtools" || type === "popup") continue;
      let url = t.url;
      let title = t.title;
      let fav = t.favIconUrl;
      if (SUSPENDED_SCHEME.test(String(url || ""))) {
        const real = unwrapSuspended(url);
        if (real) {
          url = real.url;
          title = real.title || title;
          fav = undefined; // favicône du suspendeur : on repassera par le fallback
          unwrappedCount++;
        }
      }
      if (!url || BLOCKED_SCHEME.test(String(url))) {
        ignored++;
        excludedTabs.push({ title: title || "", url: String(url || "") });
        continue;
      }
      if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
      const g = t.groupId && t.groupId !== -1 ? groupById.get(t.groupId) : null;
      byWindow.get(t.windowId).push({
        url,
        title: title || url,
        pinned: !!t.pinned,
        active: !!t.active,
        ...(fav ? { favIconUrl: fav } : {}),
        ...(g && g.title ? { groupName: g.title, groupColor: g.color } : {}),
      });
    }
    const windows = [...byWindow.entries()]
      .filter(([id]) => {
        const type = winType.get(id) || "normal";
        return type !== "devtools" && type !== "popup"; // exclues du comptage affiché
      })
      .map(([, wt]) => ({ tabs: wt }));
    return {
      windows,
      tabCount: windows.reduce((n, w) => n + w.tabs.length, 0),
      windowCount: windows.length,
      rawCount: tabs.length,
      ignored,
      excludedTabs,
      unwrappedCount,
    };
  }

  // Attend que le paysage d'onglets soit stable : la restauration de session au
  // démarrage de Chrome est progressive (60 onglets reviennent fenêtre par
  // fenêtre) ; capturer trop tôt ne voyait que « 4 onglets, 2 fenêtres ».
  async function captureTabs({ settleTries = 4, settleDelay = 1500 } = {}) {
    let snap = await snapshotTabs();
    for (let i = 0; i < settleTries; i++) {
      await new Promise((resolve) => setTimeout(resolve, settleDelay));
      const next = await snapshotTabs();
      const stable = next.rawCount === snap.rawCount && next.windowCount === snap.windowCount;
      snap = next;
      if (stable) break;
    }
    return snap;
  }

  /* ----- Groupes d'onglets : capture en bibliothèque locale (page + sw) ----- */

  // Les 9 couleurs reconnues par chrome.tabGroups.
  const GROUP_COLORS = {
    grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00",
    green: "#188038", pink: "#d01884", orange: "#fa7b17", purple: "#a142f4", cyan: "#24c1e0",
  };

  function cleanGroupEntry(entry) {
    const url = String(entry?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return { url, title: String(entry?.title || "").trim().slice(0, 300) };
  }

  function cleanSavedGroup(item) {
    if (!item || typeof item !== "object" || !Array.isArray(item.tabs)) return null;
    const tabs = item.tabs.map(cleanGroupEntry).filter(Boolean);
    if (!tabs.length) return null;
    return {
      id: String(item.id || crypto.randomUUID()),
      title: String(item.title || "Groupe sans nom").trim().slice(0, 200),
      color: GROUP_COLORS[item.color] ? item.color : "grey",
      tabs,
      updatedAt: Number(item.updatedAt) || Date.now(),
    };
  }

  function snapshotGroup(title, color, entries) {
    const tabs = (entries || []).map(cleanGroupEntry).filter(Boolean);
    if (!tabs.length) return null;
    return {
      id: crypto.randomUUID(),
      title: String(title || "Groupe sans nom").trim().slice(0, 200),
      color: GROUP_COLORS[color] ? color : "grey",
      tabs,
      updatedAt: Date.now(),
    };
  }

  // ponytail: identité d'un groupe = titre + couleur + recouvrement d'URLs (aucun
  // GUID stable exposé par chrome.tabGroups) ; deux groupes homonymes aux contenus
  // différents restent deux copies distinctes, un groupe renommé devient une copie
  // neuve. Sans écriture si rien n'a changé (les événements tabs arrivent souvent).
  function sameGroup(a, b) {
    if (a.title !== b.title || a.color !== b.color) return false;
    const urls = new Set(b.tabs.map((t) => t.url));
    const overlap = a.tabs.filter((t) => urls.has(t.url)).length;
    return overlap >= Math.max(1, Math.floor(Math.min(a.tabs.length, b.tabs.length) / 2));
  }

  // Fusionne les groupes ouverts NOMMÉS (les sans-nom sont du bruit éphémère)
  // dans la bibliothèque : mise à jour en place si déjà connu, création sinon.
  // live : [{ group: { title, color }, tabs: [{ url, title }] }]
  function mergeCapturedGroups(live, savedList) {
    const next = [...savedList];
    let created = 0;
    let updated = 0;
    for (const item of live || []) {
      const title = String(item.group?.title || "").trim();
      if (!title) continue;
      const snap = snapshotGroup(title, item.group?.color, item.tabs);
      if (!snap) continue;
      const index = next.findIndex((g) => sameGroup(g, snap));
      if (index >= 0) {
        const urlsOf = (g) => g.tabs.map((t) => t.url).join("\n");
        if (urlsOf(next[index]) !== urlsOf(snap)) {
          next[index] = { ...next[index], tabs: snap.tabs, updatedAt: Date.now() };
          updated++;
        }
      } else {
        next.unshift(snap);
        created++;
      }
    }
    return { next, created, updated };
  }

  globalThis.BSSessionLib = {
    captureTabs, unwrapSuspended, SUSPENDED_SCHEME, BLOCKED_SCHEME,
    GROUP_COLORS, cleanGroupEntry, cleanSavedGroup, snapshotGroup, sameGroup, mergeCapturedGroups,
  };
})();
