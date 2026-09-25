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

/* Capture automatique des groupes d'onglets dans la bibliothèque locale :
   Chrome n'expose aucun accès aux groupes enregistrés fermés — le seul moment
   lisible est leur ouverture. Le service worker capte donc les groupes ouverts
   nommés au fil des événements, même extension fermée. Débounce : une ouverture
   de groupe déclenche une rafale d'événements (onglets + groupe). */
const TG_KEY = "bs_tabgroups_v1";
const TG_AUTO_KEY = "bs_tabgroups_auto_v1";
let tgCaptureTimer = 0;

async function captureOpenGroups() {
  try {
    const stored = await chrome.storage.local.get([TG_AUTO_KEY, TG_KEY]);
    if (stored[TG_AUTO_KEY] === false) return; // capture automatique désactivée
    if (typeof chrome.tabGroups?.query !== "function") return;
    const [groups, tabs] = await Promise.all([chrome.tabGroups.query({}), chrome.tabs.query({})]);
    const byGroup = new Map();
    for (const t of tabs) {
      if (!Number.isInteger(t.groupId) || t.groupId === -1) continue;
      const real = BSSessionLib.unwrapSuspended(t.url);
      if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
      byGroup.get(t.groupId).push({ url: real?.url || t.url, title: real?.title || t.title });
    }
    const live = groups.map((g) => ({ group: g, tabs: byGroup.get(g.id) || [] }));
    const saved = (Array.isArray(stored[TG_KEY]) ? stored[TG_KEY] : [])
      .map(BSSessionLib.cleanSavedGroup).filter(Boolean);
    const { next, created, updated } = BSSessionLib.mergeCapturedGroups(live, saved);
    if (created || updated) await chrome.storage.local.set({ [TG_KEY]: next });
  } catch {
    // silencieux : aucune interface dans le service worker
  }
}

function scheduleGroupCapture() {
  clearTimeout(tgCaptureTimer);
  tgCaptureTimer = setTimeout(captureOpenGroups, 900);
}

for (const ev of ["onCreated", "onUpdated"]) {
  chrome.tabGroups?.[ev]?.addListener?.(scheduleGroupCapture);
}
// un onglet rejoint/quite un groupe → sa fiche change, pas le groupe lui-même
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo && ("groupId" in changeInfo || "url" in changeInfo)) scheduleGroupCapture();
});
chrome.runtime.onStartup?.addListener?.(captureOpenGroups);
