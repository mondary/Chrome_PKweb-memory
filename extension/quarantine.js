/* Quarantaine : dossier tampon partagé page + service worker. Rien n'est supprimé
   définitivement avant 30 jours, restauration possible à l'emplacement d'origine. */
"use strict";

const TRASH_TITLE = "Quarantaine — Bookmarks Sorter";
const OLD_TRASH_TITLE = "Corbeille — Bookmarks Sorter";
const QUARANTINE_DAYS = 30;

const storage = {
  get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
  set: (obj) => chrome.storage.local.set(obj),
};

async function getTrash() {
  const root = (await chrome.bookmarks.getTree())[0];
  const other = root.children.find((c) => !c.url && c.id !== "1") || root.children[1];
  const found = (await chrome.bookmarks.search({ title: TRASH_TITLE })).find((f) => !f.url);
  if (found) return found;
  const old = (await chrome.bookmarks.search({ title: OLD_TRASH_TITLE })).find((f) => !f.url);
  if (old) {
    await chrome.bookmarks.update(old.id, { title: TRASH_TITLE });
    return old;
  }
  return chrome.bookmarks.create({ parentId: other.id, title: TRASH_TITLE });
}

async function moveToTrash(ids) {
  const trash = await getTrash();
  const q = (await storage.get("quarantine")) || {};
  const nodes = await chrome.bookmarks.get(ids).catch(() => []);
  for (const n of nodes) {
    if (n && n.url) q[n.id] = { parent: n.parentId, title: n.title, url: n.url, ts: Date.now() };
  }
  await storage.set({ quarantine: q });
  for (const id of ids) {
    try { await chrome.bookmarks.move(id, { parentId: trash.id }); } catch {}
  }
}

async function restoreFromTrash(ids) {
  const q = (await storage.get("quarantine")) || {};
  for (const id of ids) {
    const entry = q[id];
    if (!entry) continue;
    try { await chrome.bookmarks.move(id, { parentId: entry.parent }); } catch {}
    delete q[id];
  }
  await storage.set({ quarantine: q });
}

async function purgeExpired() {
  const q = (await storage.get("quarantine")) || {};
  const cutoff = Date.now() - QUARANTINE_DAYS * 86400000;
  let n = 0;
  for (const [id, entry] of Object.entries(q)) {
    if (entry.ts >= cutoff) continue;
    try { await chrome.bookmarks.remove(id); n++; } catch {}
    delete q[id];
  }
  await storage.set({ quarantine: q });
  return n;
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("quarantine-purge", { periodInMinutes: 60 * 24 });
  });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "quarantine-purge") await purgeExpired();
  });
}
