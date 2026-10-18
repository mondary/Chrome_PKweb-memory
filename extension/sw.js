importScripts("quarantine.js", "sessionlib.js", "session-core.js", "respiration.js", "vendor/sql-wasm.js");

/* ===== Archive locale de l'historique =====
   Chrome retire les anciennes visites de son historique. Une copie locale par
   mois permet à la section Historique de les garder ; les visites sont captées
   au fil de l'eau, puis le panneau d'historique importe aussi le passé encore
   consultable par Chrome lors de sa prochaine collecte. */
const HNAV_ARCHIVE_PREFIX = "bs.hnav.archive.";
const HNAV_ARCHIVE_INDEX_KEY = "bs.hnav.archive.index";
const HNAV_ARCHIVE_ENABLED_KEY = "hnavArchiveEnabled";
let hnavArchiveQueue = Promise.resolve();

function hnavArchiveMonth(ts) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function hnavStoreVisits(visits) {
  const startResult = await chrome.storage.local.get("bs.hnav.archive.start");
  const archiveStart = Number(startResult["bs.hnav.archive.start"]) || 0;
  const groups = new Map();
  for (const visit of visits) {
    if (!visit?.id || !/^https?:\/\//i.test(visit.url || "") || !Number.isFinite(visit.ts)) continue;
    if (archiveStart && visit.ts < archiveStart) continue;
    const month = hnavArchiveMonth(visit.ts);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(visit);
  }
  const writtenMonths = [];
  for (const [month, rows] of groups) {
    const key = HNAV_ARCHIVE_PREFIX + month;
    const result = await chrome.storage.local.get(key);
    const saved = Array.isArray(result[key]) ? result[key] : [];
    const byId = new Map(saved.map((visit) => [String(visit.id), visit]));
    for (const visit of rows) byId.set(String(visit.id), visit);
    await chrome.storage.local.set({ [key]: [...byId.values()].sort((a, b) => a.ts - b.ts) });
    writtenMonths.push(month);
  }
  if (writtenMonths.length) {
    const result = await chrome.storage.local.get(HNAV_ARCHIVE_INDEX_KEY);
    const index = Array.isArray(result[HNAV_ARCHIVE_INDEX_KEY]) ? result[HNAV_ARCHIVE_INDEX_KEY] : [];
    await chrome.storage.local.set({
      [HNAV_ARCHIVE_INDEX_KEY]: [...new Set([...index, ...writtenMonths])].sort(),
    });
    scheduleDatabaseBackup(60);
  }
}

async function hnavCaptureVisit(item) {
  const setting = await chrome.storage.local.get(HNAV_ARCHIVE_ENABLED_KEY);
  if (setting[HNAV_ARCHIVE_ENABLED_KEY] === false || !/^https?:\/\//i.test(item?.url || "")) return;
  const visits = await chrome.history.getVisits({ url: item.url }).catch(() => []);
  const rows = visits.map((visit) => ({
    id: String(visit.visitId),
    url: item.url,
    title: item.title || item.url,
    ts: visit.visitTime || item.lastVisitTime || Date.now(),
    ref: visit.referringVisitId && visit.referringVisitId !== "0" ? String(visit.referringVisitId) : null,
    transition: visit.transition || "link",
  }));
  hnavArchiveQueue = hnavArchiveQueue.then(() => hnavStoreVisits(rows)).catch(console.error);
  await hnavArchiveQueue;
}
chrome.history.onVisited.addListener((item) => { hnavCaptureVisit(item).catch(console.error); });

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

/* ===== Pastille de l'icône =====
   Nombre d'onglets ouverts ou d'onglets en double (même URL ouverte
   plusieurs fois), au choix dans les réglages. Débouncée : la restauration
   de session déclenche une rafale d'événements onglets. */
let badgeTimer = 0;
function scheduleBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => updateBadge().catch(console.warn), 300);
}
async function updateBadge() {
  const { settings } = await libState();
  if (settings.badge === "none") return chrome.action.setBadgeText({ text: "" });
  const tabs = await chrome.tabs.query({});
  if (settings.badge === "dupes") {
    const urls = tabs.map((tab) => PKSessionCore.tabURL(tab)).filter(Boolean);
    const count = PKSessionCore.duplicateCount(urls);
    return chrome.action.setBadgeText({ text: count ? String(count) : "" });
  }
  const count = tabs.length;
  chrome.action.setBadgeText({ text: count > 999 ? "999+" : count ? String(count) : "" });
}
chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
chrome.tabs.onCreated.addListener(scheduleBadge);
chrome.tabs.onRemoved.addListener(scheduleBadge);
chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (changes.url || changes.status === "loading") scheduleBadge();
});
chrome.windows.onCreated.addListener(scheduleBadge);
chrome.windows.onRemoved.addListener(scheduleBadge);
updateBadge().catch(console.warn);

/* ===== Bibliothèque de sessions (fusion src3) =====
   Un seul écrivain sérialisé pour la page et les alarmes ; la persistance
   précède toujours toute fermeture d'onglet. Clés :
   - bs.sessions.library  : { sessions, settings, migratedAt }
   - bs.sessions.previews : captures locales (30 jours, 60 max) */
const LIB_KEY = "bs.sessions.library";
const PREV_KEY = "bs.sessions.previews";
const OLD_KEY = "bs.sessions";
const MAX_AUTO = 20;

let libQueue = Promise.resolve();
function libSerial(action) {
  const next = libQueue.then(action);
  libQueue = next.catch(() => {});
  return next;
}
const respiration = PKRespiration.create({ chrome, changed: () => scheduleDatabaseBackup(2),
  saveSession: async (title, tabs) => {
    const library = await libState();
    const item = PKSessionCore.cleanSession({ title: `Respiration · ${title}`, windows: [{ tabs }] });
    library.sessions.unshift(item);
    await libWrite(library);
    const saved = await libState();
    if (!saved.sessions.some((s) => s.id === item.id && PKSessionCore.fingerprint(s) === PKSessionCore.fingerprint(item)))
      throw new Error("La capsule n’a pas pu être sauvegardée. Les onglets sont conservés.");
    return item.id;
  },
});
chrome.tabs.onRemoved.addListener((id, info) => {
  if (respiration.noticeRemoval(id, info)) libSerial(() => respiration.removed(id, info)).catch(console.error);
});
chrome.tabs.onDetached.addListener((id, info) => libSerial(() => respiration.detached(id, info)).catch(console.error));
chrome.tabs.onCreated.addListener((tab) => libSerial(() => respiration.updated(tab)).catch(console.error));
chrome.tabs.onUpdated.addListener((id, changes, tab) => {
  if (changes.url || changes.title || changes.status === "complete") libSerial(() => respiration.updated(tab)).catch(console.error);
});
async function libState() {
  const stored = await chrome.storage.local.get(LIB_KEY);
  const lib = stored[LIB_KEY];
  const normalize = (lib) => {
    const settings = { ...PKSessionCore.DEFAULT_SETTINGS, ...lib.settings };
    // Migrations uniques : un défaut changé après coup ne doit pas écraser un
    // choix explicite, mais les bibliothèques qui n'ont jamais touché l'ancien
    // défaut passent au nouveau. Le marqueur pose ensuite la main au premier
    // passage : tout réglage ultérieur de l'utilisateur est respecté.
    let migrated = lib;
    if (!lib.rowThumbsMigrated) {
      if (settings.rowThumbs === "full") settings.rowThumbs = PKSessionCore.DEFAULT_SETTINGS.rowThumbs;
      migrated = { ...lib, settings, rowThumbsMigrated: 1 };
    }
    if (!lib.dailySaveMigrated) {
      // « Session quotidienne » devient active par défaut (2026.09.72).
      settings.dailySave = true;
      migrated = { ...migrated, settings, dailySaveMigrated: 1 };
    }
    if (!lib.autoBackupMigrated) {
      // La copie SQLite devient active par défaut : le stockage Chrome est
      // effacé à la désinstallation, mais le fichier choisi par l'utilisateur survit.
      settings.autoBackup = true;
      migrated = { ...migrated, settings, autoBackupMigrated: 1 };
    }
    if (migrated !== lib) libWrite(migrated).catch(() => {});
    return migrated;
  };
  return lib && Array.isArray(lib.sessions)
    ? normalize(lib)
    : { sessions: [], settings: { ...PKSessionCore.DEFAULT_SETTINGS }, migratedAt: 0 };
}
async function libWrite(library, { auto = false } = {}) {
  await chrome.storage.local.set({ [LIB_KEY]: library });
  scheduleDatabaseBackup(auto ? 60 : 2);
}

/* ----- Base SQLite durable, hors du stockage Chrome -----
   La page Sessions choisit une fois un fichier dans Application Support et
   conserve son FileSystemFileHandle dans IndexedDB. Le service worker peut
   ensuite mettre à jour ce même fichier sans rouvrir un sélecteur. */
const DB_HANDLE_DB = "pk-web-memory-file-handles";
const DB_HANDLE_STORE = "handles";
const DB_HANDLE_KEY = "main-database";
let databaseQueue = Promise.resolve();
let sqliteModulePromise;

function databaseSerial(action) {
  const next = databaseQueue.then(action);
  databaseQueue = next.catch(() => {});
  return next;
}
function openHandleStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getDatabaseHandle() {
  const db = await openHandleStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DB_HANDLE_STORE, "readonly").objectStore(DB_HANDLE_STORE).get(DB_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function scheduleDatabaseBackup(delayMinutes = 2) {
  const next = Date.now() + delayMinutes * 60000;
  const alarm = await chrome.alarms.get("bs-session-backup").catch(() => null);
  if (alarm && alarm.scheduledTime <= next) return;
  chrome.alarms.create("bs-session-backup", { when: next }).catch(() => {});
}
function sqlModule() {
  if (!sqliteModulePromise) sqliteModulePromise = initSqlJs({
    locateFile: (name) => chrome.runtime.getURL(`vendor/${name}`),
  });
  return sqliteModulePromise;
}
function createDatabaseSchema(db) {
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS visits(
      visit_id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      visited_at REAL NOT NULL, referring_visit_id TEXT, transition TEXT NOT NULL DEFAULT 'link'
    );
    CREATE INDEX IF NOT EXISTS visits_time ON visits(visited_at DESC);
    CREATE INDEX IF NOT EXISTS visits_url_time ON visits(url, visited_at DESC);
    CREATE INDEX IF NOT EXISTS visits_ref ON visits(referring_visit_id);
    CREATE TABLE IF NOT EXISTS pages(
      url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', last_visit_at REAL NOT NULL, visit_count INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pages_last_visit ON pages(last_visit_at DESC);
    CREATE TABLE IF NOT EXISTS sessions(
      session_id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      created_at REAL NOT NULL, updated_at REAL NOT NULL, favorite INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0, automatic INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]', raw_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_windows(
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      window_index INTEGER NOT NULL, PRIMARY KEY(session_id, window_index)
    );
    CREATE TABLE IF NOT EXISTS session_tabs(
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      window_index INTEGER NOT NULL, tab_index INTEGER NOT NULL, url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 0, group_title TEXT NOT NULL DEFAULT '', group_color TEXT NOT NULL DEFAULT 'grey',
      PRIMARY KEY(session_id, window_index, tab_index),
      FOREIGN KEY(session_id, window_index) REFERENCES session_windows(session_id, window_index) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS session_tabs_url ON session_tabs(url);
    CREATE INDEX IF NOT EXISTS sessions_created ON sessions(created_at DESC);
    PRAGMA user_version = 1;
  `);
}
async function runDatabaseBackup({ force = false } = {}) {
  if (databaseBackupBusy) return;
  databaseBackupBusy = true;
  let restoredCount = 0;
  try {
    const stored = await chrome.storage.local.get(LIB_KEY);
    const library = stored[LIB_KEY];
    if (!force && library?.settings?.autoBackup === false) return;
    const handle = await getDatabaseHandle();
    if (!handle) return;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("L'autorisation d'écriture SQLite doit être renouvelée depuis les réglages Sessions.");

    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const SQL = await sqlModule();
    const db = bytes.length ? new SQL.Database(bytes) : new SQL.Database();
    try {
      createDatabaseSchema(db);
      const { [HNAV_ARCHIVE_INDEX_KEY]: months = [] } =
        await chrome.storage.local.get(HNAV_ARCHIVE_INDEX_KEY);
      let { [LIB_KEY]: currentLibrary } = await chrome.storage.local.get(LIB_KEY);
      const savedSessions = db.exec("SELECT raw_json FROM sessions ORDER BY created_at DESC");
      const restoredSessions = savedSessions[0]?.values.map(([raw]) => {
        try { return JSON.parse(raw); } catch { return null; }
      }).filter(Boolean) || [];
      if (restoredSessions.length) {
        const localSessions = Array.isArray(currentLibrary?.sessions) ? currentLibrary.sessions : [];
        const localIds = new Set(localSessions.map((session) => session.id));
        const missingSessions = restoredSessions.filter((session) => session?.id && !localIds.has(session.id));
        if (missingSessions.length) {
          currentLibrary = { ...currentLibrary, sessions: [...localSessions, ...missingSessions], migratedAt: currentLibrary?.migratedAt || Date.now() };
          await chrome.storage.local.set({ [LIB_KEY]: currentLibrary });
          restoredCount = missingSessions.length;
        }
      }
      let breathing = (await chrome.storage.local.get(PKRespiration.KEY))[PKRespiration.KEY];
      if (!breathing) {
        const row = db.exec("SELECT value FROM metadata WHERE key='respiration'")[0]?.values[0]?.[0];
        try {
          const recovered = row ? JSON.parse(row) : null;
          if (recovered?.version === 1 && Array.isArray(recovered.entries) && Array.isArray(recovered.capsules)
            && recovered.entries.every((e) => PKSessionCore.webURL(e.url))) {
            recovered.paused = true; recovered.windowId = null;
            recovered.reason = "Tournée restaurée depuis SQLite. Reprenez dans la fenêtre de votre choix.";
            for (const e of recovered.entries) if (!["done", "outside"].includes(e.state)) { e.state = "pending"; e.tabId = null; }
            await chrome.storage.local.set({ [PKRespiration.KEY]: recovered });
            breathing = recovered;
          }
        } catch { /* une métadonnée invalide ne bloque pas la récupération des sessions */ }
      }
      const monthKeys = (Array.isArray(months) ? months : []).map((month) => HNAV_ARCHIVE_PREFIX + month);
      const monthData = monthKeys.length ? await chrome.storage.local.get(monthKeys) : {};
      const visitRows = [];
      const appendVisit = (visit) => {
        if (visit?.id == null || !/^https?:\/\//i.test(visit.url || "") || !Number.isFinite(Number(visit.ts))) return;
        visitRows.push([String(visit.id), visit.url, visit.title || visit.url, Number(visit.ts),
          visit.ref && visit.ref !== "0" ? String(visit.ref) : null, visit.transition || "link"]);
      };
      for (const key of monthKeys) for (const visit of monthData[key] || []) appendVisit(visit);
      const persisted = await chrome.storage.local.get("bs.hnav.persisted");
      for (const visit of persisted["bs.hnav.persisted"]?.visits || []) appendVisit(visit);
      db.run("BEGIN");
      const upsertVisit = db.prepare(`INSERT INTO visits VALUES(?,?,?,?,?,?)
        ON CONFLICT(visit_id) DO UPDATE SET url=excluded.url,title=excluded.title,
        visited_at=excluded.visited_at,referring_visit_id=excluded.referring_visit_id,transition=excluded.transition`);
      for (const row of visitRows) upsertVisit.run(row);
      upsertVisit.free();
      db.run("DELETE FROM pages");
      db.run(`INSERT INTO pages(url,title,last_visit_at,visit_count)
        SELECT v.url,
          (SELECT latest.title FROM visits latest WHERE latest.url=v.url ORDER BY latest.visited_at DESC LIMIT 1),
          MAX(v.visited_at), COUNT(*) FROM visits v GROUP BY v.url`);

      db.run("DELETE FROM sessions");
      const sessions = Array.isArray(currentLibrary?.sessions) ? currentLibrary.sessions : [];
      const insertSession = db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)");
      const insertWindow = db.prepare("INSERT INTO session_windows VALUES(?,?)");
      const insertTab = db.prepare("INSERT INTO session_tabs VALUES(?,?,?,?,?,?,?,?,?,?)");
      for (const session of sessions) {
        insertSession.run([session.id, session.title || "", session.note || "", session.createdAt || 0,
          session.updatedAt || 0, Number(!!session.favorite), Number(!!session.archived), Number(!!session.auto),
          JSON.stringify(session.tags || []), JSON.stringify(session)]);
        (session.windows || []).forEach((win, wi) => {
          insertWindow.run([session.id, wi]);
          (win.tabs || []).forEach((tab, ti) => {
            insertTab.run([session.id, wi, ti, tab.url, tab.title || "", tab.note || "",
              Number(!!tab.pinned), Number(!!tab.active), tab.groupTitle || "", tab.groupColor || "grey"]);
          });
        });
      }
      insertSession.free(); insertWindow.free(); insertTab.free();
      const totalVisits = db.exec("SELECT COUNT(*) FROM visits")[0]?.values[0]?.[0] || 0;
      const metadata = [
        ["format", "pk-web-memory-sqlite"], ["schema_version", "1"],
        ["updated_at", String(Date.now())], ["visit_count", String(totalVisits)],
        ["session_count", String(sessions.length)],
        ["respiration", JSON.stringify(breathing || null)],
      ];
      const putMeta = db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)");
      metadata.forEach((row) => putMeta.run(row)); putMeta.free();
      db.run("COMMIT");
      const output = db.export();
      const writer = await handle.createWritable({ keepExistingData: false });
      try { await writer.write(output); await writer.close(); }
      catch (error) { await writer.abort().catch(() => {}); throw error; }
      return { restoredCount, visits: visitRows.length, sessions: sessions.length };
    } finally { db.close(); }
  } finally { databaseBackupBusy = false; }
}
let databaseBackupBusy = false;


async function libLive() {
  const [windows, groups] = await Promise.all([
    chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }),
    chrome.tabGroups.query({}),
  ]);
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  return windows.filter((win) => !win.incognito).map((win) => ({
    id: win.id, focused: win.focused,
    ignored: win.tabs.filter((tab) => !PKSessionCore.tabURL(tab)).length,
    tabs: win.tabs.filter((tab) => PKSessionCore.tabURL(tab)).map((tab) => {
      const group = groupMap.get(tab.groupId);
      return {
        id: tab.id, windowId: win.id, url: PKSessionCore.tabURL(tab), originalUrl: tab.pendingUrl || tab.url,
        title: tab.title || PKSessionCore.tabURL(tab), pinned: tab.pinned, active: tab.active,
        discarded: tab.discarded, audible: tab.audible, lastAccessed: tab.lastAccessed,
        group: group ? String(group.id) : "", groupTitle: group?.title || "", groupColor: group?.color || "grey",
      };
    }),
  }));
}

async function libSnapshot(library, force = false) {
  if (!force && !library.settings.autosave) return;
  const windows = (await libLive()).filter((win) => win.tabs.length);
  if (!windows.length) return;
  const item = PKSessionCore.cleanSession({ title: "Sauvegarde automatique", auto: true, windows });
  const previous = library.sessions.find((session) => session.auto && !session.archived);
  if (previous && PKSessionCore.fingerprint(previous) === PKSessionCore.fingerprint(item)) return;
  let count = 0;
  library.sessions = [item, ...library.sessions].filter((session) => !session.auto || session.archived || ++count <= MAX_AUTO);
  await libWrite(library, { auto: true });
}

async function libRestore(session) {
  // Une seule nouvelle fenêtre pour toute la session, focalisée à la fin :
  // la structure multi-fenêtres reste enregistrée, la réouverture est compacte.
  let opened = 0;
  let target;
  try {
    const groups = new Map();
    let active;
    for (const win of session.windows) {
      for (const tab of win.tabs) {
        if (!PKSessionCore.webURL(tab.url)) throw new Error("URL non restaurable.");
        let created;
        if (!target) {
          target = await chrome.windows.create({ url: tab.url, focused: false });
          created = target.tabs[0];
        } else created = await chrome.tabs.create({ windowId: target.id, url: tab.url, active: false });
        opened++;
        if (tab.pinned) await chrome.tabs.update(created.id, { pinned: true });
        if (tab.active) active = created.id;
        if (tab.group && !tab.pinned) {
          if (!groups.has(tab.group)) groups.set(tab.group, { ids: [], title: tab.groupTitle, color: tab.groupColor });
          groups.get(tab.group).ids.push(created.id);
        }
      }
    }
    for (const group of groups.values()) {
      const groupId = await chrome.tabs.group({ tabIds: group.ids });
      await chrome.tabGroups.update(groupId, { title: group.title, color: group.color });
    }
    if (active) await chrome.tabs.update(active, { active: true });
    if (target) await chrome.windows.update(target.id, { focused: true });
  } catch (error) {
    if (target) await chrome.windows.update(target.id, { focused: true }).catch(() => {});
    throw new Error(`${opened} onglet(s) rouvert(s) avant interruption. La session reste enregistrée. ${error.message}`);
  }
  return { message: `${opened} onglet(s) rouvert(s) dans une nouvelle fenêtre.` };
}

async function libSave(library, payload) {
  const windows = (await libLive()).filter((win) => payload.windowId == null || win.id === payload.windowId)
    .map((win) => ({ ...win, tabs: win.tabs.filter((tab) => !payload.tabIds || payload.tabIds.includes(tab.id)) }))
    .filter((win) => win.tabs.length);
  if (!windows.length) throw new Error("Aucun onglet web à enregistrer dans cette sélection.");
  const item = PKSessionCore.cleanSession({ title: payload.title || `Session du ${new Date().toLocaleDateString("fr-FR")}`,
    tags: payload.tags, note: payload.note, windows });
  library.sessions.unshift(item);
  await libWrite(library);
  let closed = 0;
  if (payload.close === true) {
    await respiration.externalClose(windows.flatMap((win) => win.tabs.map((tab) => tab.id)));
    for (const tab of windows.flatMap((win) => win.tabs)) {
      try {
        const current = await chrome.tabs.get(tab.id);
        if (!current.pinned && !current.incognito && (current.pendingUrl || current.url) === tab.originalUrl) {
          await chrome.tabs.remove(tab.id); closed++;
        }
      } catch { /* déjà fermé : l'onglet reste dans la session enregistrée */ }
    }
  }
  return { id: item.id, message: `${PKSessionCore.allTabs(item).length} onglet(s) enregistré(s)${payload.close ? ` · ${closed} fermé(s), onglets épinglés conservés` : ""}.` };
}

async function libSleep(windows, ids, cutoff) {
  let count = 0;
  for (const tab of windows.flatMap((win) => win.tabs)) {
    if (ids && !ids.includes(tab.id)) continue;
    if (cutoff && (!tab.lastAccessed || tab.lastAccessed > cutoff)) continue;
    try {
      const current = await chrome.tabs.get(tab.id);
      if (current.active || current.pinned || current.audible || current.discarded || current.incognito) continue;
      if (cutoff && (!current.lastAccessed || current.lastAccessed > cutoff)) continue;
      await chrome.tabs.discard(tab.id); count++;
    } catch { /* Chrome peut refuser de dormir un onglet occupé */ }
  }
  return { message: `${count} onglet(s) mis en veille. Les onglets actifs, épinglés ou audibles sont conservés.` };
}

/* ----- Session quotidienne -----
   À l'heure choisie, les onglets ouverts deviennent une session datée (une
   seule par jour, garde-fou lastDailyAt) ; « repartir à vide » ferme ensuite
   les onglets enregistrés en laissant un onglet neuf par fenêtre. L'alarme
   est reprogrammée au lendemain à chaque exécution. */
async function scheduleDaily(library) {
  await chrome.alarms.clear("bs-session-daily");
  if (!library.settings.dailySave) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(library.settings.dailyHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  await chrome.alarms.create("bs-session-daily", { when: next.getTime() });
}

async function runDaily() {
  await libSerial(async () => {
    const library = await libState();
    if (!library.settings.dailySave) return;
    const now = new Date();
    if (library.lastDailyAt && new Date(library.lastDailyAt).toDateString() === now.toDateString()) {
      await scheduleDaily(library); return; // déjà enregistré aujourd'hui
    }
    const windows = (await libLive()).filter((win) => win.tabs.length);
    if (windows.length) {
      library.sessions.unshift(PKSessionCore.cleanSession({
        title: `Session du ${now.toLocaleDateString("fr-FR")}`, windows,
      }));
    }
    library.lastDailyAt = Date.now();
    await libWrite(library);
    if (library.settings.dailyExport && windows.length) {
      // Copie fichier de la session du jour dans le dossier de téléchargements
      // (sous-dossier « PK Web Memory ») : pointable vers Google Drive ou un
      // lien symbolique pour une sauvegarde cloud. Format ré-importable.
      try {
        const payload = JSON.stringify({ format: "pk-sessions", schema: 1, sessions: [library.sessions[0]] }, null, 1);
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        await chrome.downloads.download({
          url: `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`,
          filename: `PK Web Memory/session-${stamp}.json`,
          conflictAction: "uniquify", saveAs: false,
        });
      } catch (error) { console.warn("Export fichier de la session quotidienne impossible :", error); }
    }
    if (library.settings.dailyClose) {
      await respiration.externalClose(windows.flatMap((win) => win.tabs.map((tab) => tab.id)));
      for (const win of windows) {
        try {
          await chrome.tabs.create({ windowId: win.id }); // la fenêtre reste ouverte sur un onglet neuf
          for (const tab of win.tabs) {
            try {
              const current = await chrome.tabs.get(tab.id);
              if (!current.pinned && !current.incognito) await chrome.tabs.remove(tab.id);
            } catch { /* déjà fermé */ }
          }
        } catch { /* fenêtre fermée entre-temps */ }
      }
    }
    await scheduleDaily(library);
  });
}

async function libDispatch(message) {
  const library = await libState();
  const payload = message.payload || {};
  if (message.type === "get") return { library, windows: await libLive(), respiration: await respiration.get(), respirationProtocol: 2 };
  if (message.type?.startsWith("respiration-")) {
    const type = message.type.slice("respiration-".length);
    const session = type === "enqueue" ? library.sessions.find((s) => s.id === payload.id) : undefined;
    return respiration.command(type, { ...payload, session });
  }
  if (message.type === "database-backup") {
    const result = await databaseSerial(() => runDatabaseBackup({ force: true }));
    return { message: result?.restoredCount
      ? `Base SQLite connectée · ${result.restoredCount} sessions restaurées depuis le fichier.`
      : "Base SQLite connectée et mise à jour." };
  }
  if (message.type === "save") return libSave(library, payload);
  if (message.type === "create") {
    const item = PKSessionCore.cleanSession(payload.session);
    library.sessions.unshift(item);
    await libWrite(library); return { id: item.id, message: "Session créée." };
  }
  if (message.type === "snapshot") { await libSnapshot(library, true); return { message: "Sauvegarde vérifiée (sans doublon)." }; }
  if (message.type === "sleep") return libSleep(await libLive(), payload.tabIds);
  if (message.type === "focus") {
    const tab = await chrome.tabs.get(payload.id);
    if (tab.incognito) throw new Error("Fenêtre privée exclue.");
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true }); return {};
  }
  if (message.type === "preview") {
    if (!library.settings.previews) return { src: null };
    const stored = await chrome.storage.local.get(PREV_KEY);
    const hit = (stored[PREV_KEY] || {})[payload.url];
    return { src: hit?.at > Date.now() - 30 * 86400000 ? hit.src : null };
  }
  if (message.type === "previews") {
    // Lecture groupée pour les miniatures par ligne : une seule requête stockage.
    if (!library.settings.previews) return { sources: {} };
    const urls = [...new Set((Array.isArray(payload.urls) ? payload.urls : [])
      .filter((url) => typeof url === "string" && url.length > 0 && url.length < 2000))].slice(0, 600);
    const stored = await chrome.storage.local.get(PREV_KEY);
    const cache = stored[PREV_KEY] || {};
    const cutoff = Date.now() - 30 * 86400000;
    return { sources: Object.fromEntries(urls.map((url) => [url, cache[url]?.at > cutoff ? cache[url].src : null])) };
  }
  if (message.type === "dedupe-live") {
    // Dédoublonnage des onglets ouverts : la première occurrence de chaque
    // URL est gardée, les suivantes sont fermées — jamais l'onglet actif ni
    // les épinglés. Annulation = rouverture des URL fermées.
    const live = (await libLive()).filter((win) => !payload.windowId || win.id === payload.windowId);
    const kept = new Set();
    const removed = [];
    for (const win of live) {
      for (const tab of win.tabs) {
        if (tab.active || tab.pinned) { kept.add(tab.url); continue; }
        if (kept.has(tab.url)) { removed.push({ id: tab.id, url: tab.url }); continue; }
        kept.add(tab.url);
      }
    }
    if (!removed.length) return { message: "Aucun onglet en double : tous distincts." };
    await respiration.externalClose(removed.map((tab) => tab.id));
    for (const { id } of removed) await chrome.tabs.remove(id).catch(() => { /* déjà fermé */ });
    return { message: `${removed.length} onglet(s) en double fermé(s).`,
      undo: { type: "undo-dedupe-live", payload: { urls: removed.map((r) => r.url) }, label: "Rouvrir" } };
  }
  if (message.type === "undo-dedupe-live") {
    for (const url of Array.isArray(payload.urls) ? payload.urls : []) {
      await chrome.tabs.create({ url, active: false }).catch(() => { /* URL invalide */ });
    }
    return { message: "Onglets rouverts." };
  }
  if (message.type === "close-tab") {
    const tab = (await libLive()).flatMap((win) => win.tabs).find((tab) => tab.id === payload.tabId);
    if (!tab || tab.originalUrl !== payload.expectedURL) throw new Error("Cet onglet a changé ou est déjà fermé. Actualisez la liste.");
    const backup = PKSessionCore.cleanSession({ title: tab.title, archived: true, windows: [{ tabs: [tab] }] });
    library.sessions.unshift(backup);
    await libWrite(library);
    const current = await chrome.tabs.get(tab.id);
    if (current.incognito || (current.pendingUrl || current.url) !== payload.expectedURL) {
      throw new Error("L’onglet a changé de page pendant l’enregistrement ; il n’a pas été fermé.");
    }
    await chrome.tabs.remove(tab.id);
    return { message: "Onglet fermé.", undo: { type: "restore", payload: { id: backup.id }, label: "Rouvrir" } };
  }
  if (message.type === "settings") {
    const settings = payload.settings;
    const dailyHour = Number(settings?.dailyHour);
    if (!settings || typeof settings.autosave !== "boolean" || typeof settings.previews !== "boolean"
      || ![0, 15, 30, 60].includes(settings.sleepMinutes)
      || typeof settings.dailySave !== "boolean" || typeof settings.dailyClose !== "boolean"
      || !["tabs", "dupes", "none"].includes(settings.badge)
      || !["off", "bookmarks", "gallery", "historynav", "tabgroups", "sessions", "dashboard"].includes(settings.newtab)
      || !["full", "preview", "thumbs", "favicons"].includes(settings.rowThumbs)
      || !Number.isInteger(dailyHour) || dailyHour < 0 || dailyHour > 23
      || typeof settings.autoBackup !== "boolean") throw new Error("Réglages invalides.");
    library.settings = { autosave: settings.autosave, previews: settings.previews, sleepMinutes: settings.sleepMinutes,
      dailySave: settings.dailySave, dailyHour, dailyClose: settings.dailyClose, dailyExport: settings.dailyExport === true,
      autoBackup: settings.autoBackup === true,
      badge: settings.badge, newtab: settings.newtab, rowThumbs: settings.rowThumbs };
    await libWrite(library);
    await scheduleDaily(library);
    updateBadge().catch(console.warn);
    return { message: "Réglages enregistrés." };
  }
  if (message.type === "recover-closed") {
    // Filet de récupération : Chrome garde les 25 dernières fenêtres/onglets
    // fermés — de quoi reconstituer une session après un accident.
    const entries = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
    const item = PKSessionCore.cleanSession(PKSessionCore.sessionFromClosed(entries));
    library.sessions.unshift(item);
    await libWrite(library);
    return { id: item.id, message: `${PKSessionCore.allTabs(item).length} onglet(s) récupéré(s) : fenêtres et onglets fermés récemment devenus une session.` };
  }
  if (message.type === "import") {
    const imported = PKSessionCore.parseBackup(payload.backup);
    library.sessions.unshift(...imported);
    await libWrite(library); return { message: `${imported.length} session(s) importée(s), sans remplacer les existantes.` };
  }
  if (message.type === "merge-live") {
    // Fusion vers la session en cours : les onglets des sources s'ouvrent dans
    // la fenêtre choisie, les sources sont archivées (annulation possible).
    const live = (await libLive()).find((win) => win.id === payload.windowId);
    if (!live) throw new Error("Cette fenêtre n’existe plus. Actualisez la section.");
    const sourceIds = [...new Set(Array.isArray(payload.sourceIds) ? payload.sourceIds : [])];
    if (!sourceIds.length) throw new Error("Cochez au moins une session à fusionner.");
    const sources = sourceIds.map((sourceId) => {
      const source = library.sessions.find((session) => session.id === sourceId && !session.archived && !session.auto);
      if (!source) throw new Error("Une session source est introuvable ou déjà archivée. Actualisez la liste.");
      return source;
    });
    const created = [];
    for (const source of sources) {
      for (const tab of PKSessionCore.allTabs(source)) {
        const opened = await chrome.tabs.create({ windowId: live.id, url: tab.url, active: false });
        created.push(opened.id);
      }
    }
    for (const source of sources) {
      source.archived = true; source.favorite = false; source.auto = false;
      source.updatedAt = Math.max(Date.now(), source.updatedAt + 1);
    }
    await libWrite(library);
    return { message: `${created.length} onglet(s) ajouté(s) à la fenêtre en cours.`,
      undo: { type: "undo-merge-live", payload: { tabIds: created, sourceIds }, label: "Annuler" } };
  }
  if (message.type === "undo-merge-live") {
    await respiration.externalClose(Array.isArray(payload.tabIds) ? payload.tabIds : []);
    for (const tabId of Array.isArray(payload.tabIds) ? payload.tabIds : []) {
      await chrome.tabs.remove(tabId).catch(() => { /* déjà fermé */ });
    }
    for (const sourceId of Array.isArray(payload.sourceIds) ? payload.sourceIds : []) {
      const source = library.sessions.find((session) => session.id === sourceId);
      if (source) source.archived = false;
    }
    await libWrite(library); return { message: "Fusion annulée. Les sessions sources sont rétablies." };
  }
  const index = library.sessions.findIndex((session) => session.id === payload.id);
  if (index < 0) throw new Error("Cette session n’existe plus. Actualisez la page.");
  const item = library.sessions[index];
  if (message.type === "restore") return libRestore(item);
  if (payload.revision !== undefined && payload.revision !== item.updatedAt) {
    throw new Error("Cette session a changé ailleurs. Actualisez la liste avant de modifier.");
  }
  if (message.type === "remove-tab") {
    const remaining = PKSessionCore.removeTab(item, payload.position, payload.expectedURL);
    const backup = { ...item, id: crypto.randomUUID(), title: `${item.title} · avant retrait`, archived: true, favorite: false };
    library.sessions.unshift(backup);
    const updated = { ...item, windows: remaining.length ? remaining : item.windows,
      archived: remaining.length ? item.archived : true, auto: false, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
    library.sessions[index + 1] = updated;
    await libWrite(library);
    return { message: "Lien retiré de cette session.", undo: { type: "undo-remove",
      payload: { id: item.id, backupId: backup.id, revision: updated.updatedAt, archived: item.archived, auto: item.auto }, label: "Annuler" } };
  }
  if (message.type === "undo-remove") {
    const backup = library.sessions.find((session) => session.id === payload.backupId && session.archived);
    if (!backup) throw new Error("La copie de récupération n’est plus disponible.");
    library.sessions[index] = { ...item, windows: backup.windows, archived: payload.archived === true,
      auto: payload.auto === true, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
    await libWrite(library); return { message: "Lien rétabli." };
  }
  if (message.type === "merge") {
    const sourceIds = [...new Set(Array.isArray(payload.sourceIds) ? payload.sourceIds : [])];
    if (!sourceIds.length) throw new Error("Cochez au moins une session à fusionner.");
    const sources = sourceIds.map((sourceId) => {
      const source = library.sessions.find((session) => session.id === sourceId && !session.archived && !session.auto);
      if (!source || source.id === item.id) throw new Error("Une session source est introuvable ou déjà archivée. Actualisez la liste.");
      return source;
    });
    const merged = PKSessionCore.mergeSessions(item, sources);
    const backup = { ...item, id: crypto.randomUUID(), title: `${item.title} · avant fusion`, archived: true, favorite: false };
    library.sessions.unshift(backup);
    item.windows = merged.windows; item.tags = merged.tags; item.note = merged.note;
    item.favorite = merged.favorite; item.auto = false;
    item.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
    for (const source of sources) {
      source.archived = true; source.favorite = false; source.auto = false;
      source.updatedAt = Math.max(Date.now(), source.updatedAt + 1);
    }
    await libWrite(library);
    const total = PKSessionCore.allTabs(merged).length;
    return { message: `${sources.length + 1} session(s) fusionnées · ${total} onglet(s) au total.`,
      undo: { type: "undo-merge", payload: { id: item.id, targetBackupId: backup.id, sourceIds }, label: "Annuler" } };
  }
  if (message.type === "undo-merge") {
    const backup = library.sessions.find((session) => session.id === payload.targetBackupId && session.archived);
    if (!backup) throw new Error("La copie de récupération n’est plus disponible.");
    item.windows = backup.windows; item.tags = backup.tags; item.note = backup.note;
    item.favorite = backup.favorite; item.auto = false;
    item.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
    for (const sourceId of Array.isArray(payload.sourceIds) ? payload.sourceIds : []) {
      const source = library.sessions.find((session) => session.id === sourceId);
      if (source) { source.archived = false; source.updatedAt = Math.max(Date.now(), source.updatedAt + 1); }
    }
    await libWrite(library); return { message: "Fusion annulée. Les sessions sources sont rétablies." };
  }
  if (message.type === "undo-dedupe") {
    const backup = library.sessions.find((session) => session.id === payload.backupId && session.archived);
    if (!backup) throw new Error("La copie de récupération n’est plus disponible.");
    item.windows = backup.windows; item.auto = false;
    item.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
    await libWrite(library); return { message: "Dédoublonnage annulé." };
  }
  if (message.type === "delete") {
    if (!item.archived) throw new Error("Seules les copies archivées peuvent être supprimées.");
    library.sessions.splice(index, 1);
    await libWrite(library); return { message: "Copie supprimée définitivement." };
  }
  if (message.type === "edit") {
    library.sessions[index] = { ...PKSessionCore.cleanSession({ ...item, ...payload.changes, windows: item.windows }), id: item.id,
      auto: false, archived: item.archived, createdAt: item.createdAt, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
  } else if (message.type === "favorite") {
    item.favorite = !item.favorite;
    if (item.favorite) item.auto = false;
    item.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
    await libWrite(library);
    return { message: item.favorite
      ? "Session ajoutée aux favoris — groupe « Favoris », en tête de la timeline."
      : "Session retirée des favoris ; elle retrouve sa place par jour." };
  } else if (message.type === "archive") {
    item.archived = typeof payload.archived === "boolean" ? payload.archived : !item.archived;
  } else if (message.type === "dedupe") {
    const before = PKSessionCore.allTabs(item).length;
    const deduped = PKSessionCore.dedupe(item);
    const after = PKSessionCore.allTabs(deduped).length;
    if (after === before) {
      await libWrite(library);
      return { message: `Aucun doublon : ${before} onglets tous distincts.` };
    }
    const backup = { ...item, id: crypto.randomUUID(), title: `${item.title} · avant dédoublonnage`, archived: true, favorite: false };
    library.sessions.unshift(backup);
    item.windows = deduped.windows; item.auto = false;
    item.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
    await libWrite(library);
    return { message: `${before - after} doublon(s) retiré(s) : ${before} → ${after} onglets.`,
      undo: { type: "undo-dedupe", payload: { id: item.id, backupId: backup.id }, label: "Annuler" } };
  } else if (message.type === "move") {
    const target = library.sessions.find((session) => session.id === payload.target && !session.archived && !session.auto);
    if (!target || target.id === item.id || !Array.isArray(payload.positions)) throw new Error("Destination invalide.");
    const positions = new Set(payload.positions);
    const moved = item.windows.map((win, wi) => ({ tabs: win.tabs.filter((tab, ti) => positions.has(`${wi}:${ti}`)) })).filter((win) => win.tabs.length);
    if (!moved.length) throw new Error("Sélectionnez au moins un onglet.");
    const remaining = item.windows.map((win, wi) => ({ tabs: win.tabs.filter((tab, ti) => !positions.has(`${wi}:${ti}`)) })).filter((win) => win.tabs.length);
    target.windows = PKSessionCore.cleanSession({ ...target, windows: [...target.windows, ...moved] }).windows;
    target.updatedAt = Math.max(Date.now(), target.updatedAt + 1);
    if (remaining.length) item.windows = remaining;
    else item.archived = true;
    item.auto = false;
    item.updatedAt = Date.now();
  } else if (message.type === "tabs") {
    const replacement = PKSessionCore.cleanSession({ ...item, windows: payload.windows });
    library.sessions.unshift({ ...item, id: crypto.randomUUID(), title: `${item.title} · avant modification`, archived: true, favorite: false });
    library.sessions[index + 1] = { ...replacement, id: item.id, auto: false, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
  } else throw new Error("Action inconnue.");
  const updated = library.sessions.find((session) => session.id === item.id);
  if (updated) updated.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
  await libWrite(library);
  return { message: message.type === "archive" ? (item.archived
    ? "Session archivée — section « Archives », en bas de la timeline."
    : "Session restaurée dans la timeline.") : "Session mise à jour." };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL("index.html"))) return;
  libSerial(() => libDispatch(message)).then(
    (data) => respond({ ok: true, data }),
    (error) => respond({ ok: false, error: error.message })
  );
  return true;
});

/* Migration unique des anciens instantanés « bs.sessions » vers la bibliothèque,
   puis alarmes. L'ancienne clé reste en place : filet de sécurité jamais relu. */
async function migrateAndSchedule() {
  await chrome.alarms.clear("bs-sessions-autosave");
  await chrome.alarms.create("bs-session-snapshot", { delayInMinutes: 1, periodInMinutes: 5 });
  await chrome.alarms.create("bs-session-sleep", { periodInMinutes: 1 });
  await chrome.alarms.create("bs-respiration-budget", { periodInMinutes: 0.5 });
  await libSerial(async () => {
    const library = await libState();
    if (library.migratedAt) return;
    const stored = await chrome.storage.local.get(OLD_KEY);
    const old = Array.isArray(stored?.[OLD_KEY]?.sessions) ? stored[OLD_KEY].sessions : [];
    const migrated = PKSessionCore.migrateOldSessions(old);
    library.sessions = [...library.sessions.filter((session) => !session.auto), ...migrated.filter((session) => session.auto)];
    library.sessions.unshift(...migrated.filter((session) => !session.auto).slice(0, 200));
    let autos = 0;
    library.sessions = library.sessions.filter((session) => !session.auto || ++autos <= MAX_AUTO);
    library.migratedAt = Date.now();
    await libWrite(library);
  });
  // Reprogrammation systématique, hors de la file (runDaily y entre lui-même) :
  // un rechargement d'extension efface les alarmes, il faut les recréer à
  // chaque démarrage/installation. Rattrapage ensuite : Chrome fermé à
  // l'heure choisie → la session du jour est enregistrée à l'ouverture
  // (runDaily a ses propres garde-fous : déjà faite aujourd'hui = simple
  // reprogrammation).
  const library = await libState();
  await scheduleDaily(library);
  // Rattrapage SQLite au démarrage. Si un fichier est déjà relié, il est
  // restauré avant toute nouvelle session automatique ; aucune copie n'est
  // créée sans choix explicite.
  await databaseSerial(runDatabaseBackup).catch(console.warn);
  if (library.settings.dailySave && new Date().getHours() >= library.settings.dailyHour) await runDaily();
}
chrome.runtime.onInstalled.addListener(() => migrateAndSchedule().catch(console.error));
chrome.runtime.onStartup.addListener(() => migrateAndSchedule().catch(console.error));

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === "bs-respiration-budget") { libSerial(() => respiration.tick()).catch(console.error); return; }
  if (alarm?.name === "bs-session-daily") { runDaily().catch(console.error); return; }
  if (alarm?.name === "bs-session-backup") { databaseSerial(runDatabaseBackup).catch(console.warn); return; }
  if (alarm?.name === "bs-session-snapshot" || alarm?.name === "bs-session-sleep") {
    libSerial(async () => {
      const library = await libState();
      if (alarm.name === "bs-session-snapshot") await libSnapshot(library);
      if (alarm.name === "bs-session-sleep" && library.settings.sleepMinutes) {
        await libSleep(await libLive(), null, Date.now() - library.settings.sleepMinutes * 60000);
      }
    }).catch(console.error);
    return;
  }
  if (alarm?.name === "bs-sessions-autosave") migrateAndSchedule().catch(console.error);
});

/* ===== Captures locales des pages visitées =====
   Seul l'onglet visible d'une fenêtre normale focalisée est photographié,
   après ~1,1 s d'affichage stable. Jamais en navigation privée, jamais
   activé artificiellement, jamais envoyé à un service externe. */
let captureTimer = 0, capturing = false, lastCapture = 0;
async function capturePreview(windowId, expectedId) {
  if (capturing || Date.now() - lastCapture < 1000) return;
  const library = await libState();
  if (!library.settings.previews) return;
  const win = await chrome.windows.get(windowId, { populate: true });
  const tab = win.tabs?.find((tab) => tab.active);
  if (!win.focused || win.type !== "normal" || win.incognito || !tab || tab.incognito
    || tab.id !== expectedId || tab.pendingUrl || !PKSessionCore.webURL(tab.url) || tab.status === "loading") return;
  capturing = true; lastCapture = Date.now();
  try {
    const dataURL = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 50 });
    const current = await chrome.tabs.get(tab.id);
    if (!current.active || current.incognito || current.windowId !== windowId || current.url !== tab.url || current.pendingUrl) return;
    const image = await createImageBitmap(await (await fetch(dataURL)).blob());
    const canvas = new OffscreenCanvas(440, Math.round(image.height * 440 / image.width));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.55 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
    const src = `data:image/jpeg;base64,${btoa(binary)}`;
    await libSerial(async () => {
      if (!(await libState()).settings.previews) return;
      const stored = await chrome.storage.local.get(PREV_KEY);
      const previews = stored[PREV_KEY] || {};
      previews[tab.url] = { src, at: Date.now() };
      await chrome.storage.local.set({ [PREV_KEY]: PKSessionCore.prunePreviews(previews) });
    });
  } catch { /* capture refusée (page non autorisée, fenêtre masquée…) */ }
  finally { capturing = false; }
}
function scheduleCapture(windowId, tabId) {
  clearTimeout(captureTimer);
  captureTimer = setTimeout(() => capturePreview(windowId, tabId).catch(console.warn), 1100);
}
chrome.tabs.onActivated.addListener(({ windowId, tabId }) => scheduleCapture(windowId, tabId));
chrome.tabs.onUpdated.addListener((tabId, changes, tab) => {
  if (changes.status === "complete" && tab.active) scheduleCapture(tab.windowId, tabId);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId < 0) return;
  chrome.tabs.query({ windowId, active: true }).then((tabs) => {
    if (tabs[0]) scheduleCapture(windowId, tabs[0].id);
  }).catch(console.warn);
});

/* ===== Capture automatique des groupes d'onglets dans la bibliothèque locale =====
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
    if (stored[TG_AUTO_KEY] === false) return;
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
