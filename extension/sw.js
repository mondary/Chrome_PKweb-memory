importScripts("quarantine.js");

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

/* Enregistrement automatique des sessions : capture seule, sans DOM. */
const SESS_KEY = "bs.sessions";
const SESS_MAX = 40;
const IGNORED_SCHEME = /^(chrome|chrome-extension|edge|about):/i;

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm || alarm.name !== "bs-sessions-autosave") return;
  try {
    const [tabs, wins] = await Promise.all([
      chrome.tabs.query({}),
      chrome.windows.getAll().catch(() => []),
    ]);
    const winType = new Map(wins.map((w) => [w.id, w.type || "normal"]));
    const byWindow = new Map();
    for (const t of tabs) {
      if (!t.url || IGNORED_SCHEME.test(t.url)) continue;
      if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
      byWindow.get(t.windowId).push({
        url: t.url,
        title: t.title || t.url,
        pinned: !!t.pinned,
        active: !!t.active,
        ...(t.favIconUrl ? { favIconUrl: t.favIconUrl } : {}),
      });
    }
    const windows = [...byWindow.entries()]
      .filter(([id]) => {
        const type = winType.get(id) || "normal";
        return type !== "devtools" && type !== "popup";
      })
      .map(([, wt]) => ({ tabs: wt }));
    if (!windows.length) return;
    const session = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      name: "Auto - " + new Date().toLocaleString("fr-FR"),
      capturedAt: Date.now(),
      auto: true,
      windows,
    };
    const data = await chrome.storage.local.get(SESS_KEY);
    const prev = Array.isArray(data?.[SESS_KEY]?.sessions)
      ? data[SESS_KEY].sessions.filter((s) => s && s.id && Array.isArray(s.windows))
      : [];
    await chrome.storage.local.set({ [SESS_KEY]: { version: 1, sessions: [session, ...prev].slice(0, SESS_MAX) } });
  } catch {
    // capture silencieuse : aucune interface dans le service worker
  }
});
