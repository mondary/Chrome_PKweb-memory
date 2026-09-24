/* Quarantaine : dossier tampon partagé page + service worker. Rien n'est supprimé
   définitivement avant 30 jours, restauration possible à l'emplacement d'origine. */
"use strict";

const TRASH_TITLE = "Quarantaine — Bookmarks Sorter";
const OLD_TRASH_TITLE = "Corbeille — Bookmarks Sorter";
const QUARANTINE_DAYS = 30;
const HISTORY_KEY = "bookmarkHistory";
const HISTORY_LIMIT = 30;

// Category helpers also classify older entries that predate explicit metadata.
function quarantineCategory(entry) {
  const source = entry?.source || "";
  const reason = String(entry?.reason || "").toLowerCase();
  if (source === "dedupe" || reason.includes("doublon")) return "duplicates";
  if (source === "scan" || entry?.status === "dead" || reason.includes("mort")) return "dead";
  return "other";
}

function quarantineStatusLabel(entry) {
  if (!entry) return "Origine inconnue (ancienne entrée)";
  if (entry.status === "dead") return "Lien mort confirmé · suppression après 30 jours";
  if (quarantineCategory(entry) === "duplicates") return "Doublon · restauration possible à tout moment";
  return entry.status === "quarantined" ? "En quarantaine" : String(entry.status || "Statut inconnu");
}

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

function newHistoryId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createHistorySnapshot(event = "snapshot", reason = "") {
  const tree = (await chrome.bookmarks.getTree())[0];
  const history = (await storage.get(HISTORY_KEY)) || [];
  const item = {
    id: newHistoryId(),
    timestamp: Date.now(),
    parentSnapshotId: history[0]?.id || null,
    event,
    reason,
    tree,
  };
  history.unshift(item);
  await storage.set({ [HISTORY_KEY]: history.slice(0, HISTORY_LIMIT) });
  return item;
}

async function listHistory() {
  const history = (await storage.get(HISTORY_KEY)) || [];
  return history.map(({ tree, ...item }) => item);
}

async function restoreHistorySnapshot(snapshotId) {
  const history = (await storage.get(HISTORY_KEY)) || [];
  const snapshot = history.find((item) => item.id === snapshotId);
  if (!snapshot) throw new Error("Snapshot introuvable");
  await createHistorySnapshot("restore", `Restauration de ${snapshotId}`);

  // Restore saved bookmarks into their original folders. Existing nodes are matched
  // by ID first, then by URL/title in the destination folder; unmatched current nodes
  // are left untouched so a recovery cannot erase newer bookmarks.
  async function restoreChildren(savedParent, currentParentId) {
    const current = await chrome.bookmarks.getChildren(currentParentId);
    for (const saved of savedParent.children || []) {
      let match = current.find((node) => node.id === saved.id);
      if (!match) {
        try { [match] = await chrome.bookmarks.get(saved.id); } catch {}
      }
      if (!match) match = current.find((node) => node.url === saved.url && node.title === saved.title);
      if (match) {
        if (match.parentId !== currentParentId) await chrome.bookmarks.move(match.id, { parentId: currentParentId });
        if (match.title !== saved.title) await chrome.bookmarks.update(match.id, { title: saved.title });
        if (saved.url && match.url !== saved.url) await chrome.bookmarks.update(match.id, { url: saved.url });
        if (!saved.url && saved.children?.length) await restoreChildren(saved, match.id);
      } else {
        const created = await chrome.bookmarks.create({
          parentId: currentParentId,
          title: saved.title,
          ...(saved.url ? { url: saved.url } : {}),
        });
        if (!saved.url && saved.children?.length) await restoreChildren(saved, created.id);
      }
    }
  }
  const roots = await chrome.bookmarks.getTree();
  const savedRoot = snapshot.tree;
  const savedRootChildren = savedRoot.children || [];
  for (const savedFolder of savedRootChildren) {
    const currentRootFolder = roots[0].children.find((node) => node.id === savedFolder.id)
      || roots[0].children.find((node) => node.title === savedFolder.title);
    if (currentRootFolder) await restoreChildren(savedFolder, currentRootFolder.id);
  }
  return true;
}

async function moveToTrash(ids, meta = {}) {
  await createHistorySnapshot("quarantine", meta.reason || "Mise en quarantaine");
  const trash = await getTrash();
  const q = (await storage.get("quarantine")) || {};
  const nodes = await chrome.bookmarks.get(ids).catch(() => []);
  for (const n of nodes) {
    if (n && n.url) q[n.id] = {
      parent: n.parentId, title: n.title, url: n.url, ts: Date.now(),
      reason: meta.reason || "manual", source: meta.source || "manual", status: meta.status || "quarantined",
    };
  }
  await storage.set({ quarantine: q });
  for (const id of ids) {
    try { await chrome.bookmarks.move(id, { parentId: trash.id }); } catch {}
  }
}

async function restoreFromTrash(ids) {
  await createHistorySnapshot("restore-quarantine", "Restauration depuis la quarantaine");
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
  const expired = Object.entries(q).filter(([, entry]) => entry.ts < cutoff);
  if (expired.length) await createHistorySnapshot("purge", `Suppression définitive de ${expired.length} lien(s) expiré(s)`);
  const trash = expired.length ? await getTrash() : null;
  for (const [id, entry] of expired) {
    try {
      const [bookmark] = await chrome.bookmarks.get(id);
      if (bookmark?.parentId === trash?.id) {
        await chrome.bookmarks.remove(id);
        n++;
      }
    } catch {}
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
