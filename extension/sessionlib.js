/* Bibliothèque de capture de session, partagée entre la page (sessions.js) et
   le service worker (sw.js) : collecte tous les onglets de toutes les fenêtres,
   déballe les onglets suspendus par un gestionnaire (URL réelle dans le
   paramètre url/uri de la page de suspension) et attend que le paysage d'onglets
   soit stable — au démarrage de Chrome, l'auto-save peut se déclencher avant la
   fin de la restauration de session et ne voir qu'une fraction des fenêtres. */
"use strict";

(() => {
  // Schémas exclus de la capture (comptés comme ignorés).
  const IGNORED_SCHEME = /^(chrome|chrome-extension|edge|about):/i;
  // URL réelle d'un onglet suspendu : paramètre url= ou uri=, query ou hash,
  // encodé (The Great/Marvellous Suspender, Tablerone) ou brut.
  const SUSPENDED_PARAM = /[?#&](?:url|uri)=([^&#]+)/i;

  function unwrapSuspended(url) {
    const s = String(url || "");
    if (!IGNORED_SCHEME.test(s)) return null;
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
    for (const t of tabs) {
      let url = t.url;
      let title = t.title;
      let fav = t.favIconUrl;
      if (IGNORED_SCHEME.test(String(url || ""))) {
        const real = unwrapSuspended(url);
        if (!real) { ignored++; continue; }
        url = real.url;
        title = real.title || title;
        fav = undefined; // favicône du suspendeur : on repassera par le fallback
        unwrappedCount++;
      }
      if (!url) { ignored++; continue; }
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

  globalThis.BSSessionLib = { captureTabs, unwrapSuspended, IGNORED_SCHEME };
})();
