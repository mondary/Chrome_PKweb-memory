importScripts("quarantine.js", "sessionlib.js");

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

/* Enregistrement automatique des sessions : capture via BSSessionLib (sans DOM),
   qui attend un paysage d'onglets stable — au démarrage de Chrome la restauration
   de session est progressive et une alarme trop hâtive ne voyait qu'une fraction
   des fenêtres. Purge intégrée à chaque sauvegarde : les auto de plus de 7 jours
   disparaissent (12 max), les manuelles sont plafonnées à 28 ; une capture
   identique à la dernière auto (mêmes onglets) n'est pas réenregistrée. */
const SESS_KEY = "bs.sessions";
const MAX_MANUAL = 28;
const MAX_AUTO = 12;
const AUTO_TTL = 7 * 86400000;

const sigOf = (session) => (session.windows || [])
  .map((w) => (w.tabs || []).map((t) => t.url).join("\n"))
  .join("\x1f");

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm || alarm.name !== "bs-sessions-autosave") return;
  try {
    const { windows, tabCount, ignored } = await BSSessionLib.captureTabs();
    if (!windows.length || !tabCount) return;
    const data = await chrome.storage.local.get(SESS_KEY);
    const prev = Array.isArray(data?.[SESS_KEY]?.sessions)
      ? data[SESS_KEY].sessions.filter((s) => s && s.id && Array.isArray(s.windows))
      : [];
    const session = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      name: "Auto - " + new Date().toLocaleString("fr-FR"),
      capturedAt: Date.now(),
      auto: true,
      windows,
      ...(ignored ? { ignored } : {}),
    };
    if (prev[0]?.auto && sigOf(prev[0]) === sigOf(session)) return; // rien bougé
    const now = Date.now();
    const sorted = [session, ...prev].sort((a, b) => b.capturedAt - a.capturedAt);
    let autos = 0, manuals = 0;
    const kept = [];
    for (const s of sorted) {
      if (s.auto) {
        if (autos >= MAX_AUTO || now - s.capturedAt > AUTO_TTL) continue;
        autos++;
      } else {
        if (manuals >= MAX_MANUAL) continue;
        manuals++;
      }
      kept.push(s);
    }
    await chrome.storage.local.set({ [SESS_KEY]: { version: 1, sessions: kept } });
  } catch {
    // capture silencieuse : aucune interface dans le service worker
  }
});
