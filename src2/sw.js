import { DEFAULT_SETTINGS, emptyState, tabURL, cleanSession, allTabs, fingerprint, parseBackup, dedupe, webURL } from './core.mjs';

// One writer for every page and alarm prevents read/modify/write races across windows.
let queue = Promise.resolve();
function serial(action) {
  const next = queue.then(action);
  queue = next.catch(() => {});
  return next;
}
async function state() {
  const { library } = await chrome.storage.local.get('library');
  return library ? { ...library, settings: { ...DEFAULT_SETTINGS, ...library.settings } } : emptyState();
}
async function write(library) { await chrome.storage.local.set({ library }); }

async function live() {
  const [windows, groups] = await Promise.all([
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }), chrome.tabGroups.query({}),
  ]);
  const groupMap = new Map(groups.map(group => [group.id, group]));
  return windows.filter(win => !win.incognito).map(win => ({
    id: win.id, focused: win.focused,
    ignored: win.tabs.filter(tab => !tabURL(tab)).length,
    tabs: win.tabs.filter(tab => tabURL(tab)).map(tab => {
      const group = groupMap.get(tab.groupId);
      return {
        id: tab.id, windowId: win.id, url: tabURL(tab), originalUrl: tab.pendingUrl || tab.url,
        title: tab.title || tabURL(tab), pinned: tab.pinned, active: tab.active,
        discarded: tab.discarded, audible: tab.audible, lastAccessed: tab.lastAccessed,
        group: group ? String(group.id) : '', groupTitle: group?.title || '', groupColor: group?.color || 'grey',
      };
    }),
  }));
}

async function snapshot(library, force = false) {
  if (!force && !library.settings.autosave) return;
  const windows = (await live()).filter(win => win.tabs.length);
  if (!windows.length) return; // Never replace recoverable data with an empty browser.
  const item = cleanSession({ title: 'Sauvegarde automatique', auto: true, windows });
  const previous = library.sessions.find(session => session.auto && !session.archived);
  if (previous && fingerprint(previous) === fingerprint(item)) return;
  let count = 0;
  library.sessions = [item, ...library.sessions].filter(session => !session.auto || session.archived || ++count <= 20);
  await write(library);
}

async function restore(session) {
  let opened = 0;
  try {
    for (const win of session.windows) {
      let target;
      const groups = new Map();
      let active;
      for (const tab of win.tabs) {
        if (!webURL(tab.url)) throw new Error('URL non restaurable.');
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
      for (const group of groups.values()) {
        const groupId = await chrome.tabs.group({ tabIds: group.ids });
        await chrome.tabGroups.update(groupId, { title: group.title, color: group.color });
      }
      if (active) await chrome.tabs.update(active, { active: true });
    }
  } catch (error) {
    throw new Error(`${opened} onglet(s) rouvert(s) avant interruption. La session reste enregistrée. ${error.message}`);
  }
  return { message: `${opened} onglet(s) rouvert(s) dans de nouvelles fenêtres.` };
}

async function saveLive(library, payload) {
  const windows = (await live()).filter(win => payload.windowId == null || win.id === payload.windowId)
    .map(win => ({ ...win, tabs: win.tabs.filter(tab => !payload.tabIds || payload.tabIds.includes(tab.id)) }))
    .filter(win => win.tabs.length);
  if (!windows.length) throw new Error('Aucun onglet web à enregistrer dans cette sélection.');
  const item = cleanSession({ title: payload.title || `Session du ${new Date().toLocaleDateString('fr-FR')}`, windows });
  library.sessions.unshift(item);
  await write(library); // Persistence MUST succeed before any tab is closed.
  let closed = 0;
  if (payload.close === true) {
    for (const tab of windows.flatMap(win => win.tabs)) {
      try {
        const current = await chrome.tabs.get(tab.id);
        // Preserve pinned tabs and tabs which navigated since capture.
        if (!current.pinned && !current.incognito && (current.pendingUrl || current.url) === tab.originalUrl) {
          await chrome.tabs.remove(tab.id); closed++;
        }
      } catch { /* A tab already closed is still safely present in the saved session. */ }
    }
  }
  return { id: item.id, message: `${allTabs(item).length} onglet(s) enregistré(s)${payload.close ? ` · ${closed} fermé(s), onglets épinglés conservés` : ''}.` };
}

async function sleepTabs(windows, ids, cutoff) {
  let count = 0;
  for (const tab of windows.flatMap(win => win.tabs)) {
    if (ids && !ids.includes(tab.id)) continue;
    if (cutoff && (!tab.lastAccessed || tab.lastAccessed > cutoff)) continue;
    try {
      const current = await chrome.tabs.get(tab.id);
      if (current.active || current.pinned || current.audible || current.discarded || current.incognito) continue;
      if (cutoff && (!current.lastAccessed || current.lastAccessed > cutoff)) continue;
      await chrome.tabs.discard(tab.id); count++;
    } catch { /* Chrome may refuse to discard a busy tab. */ }
  }
  return { message: `${count} onglet(s) mis en veille. Les onglets actifs, épinglés ou audibles sont conservés.` };
}

export async function dispatch(message) {
  const library = await state();
  const payload = message.payload || {};
  if (message.type === 'get') return { library, windows: await live() };
  if (message.type === 'save') return saveLive(library, payload);
  if (message.type === 'create') {
    const item = cleanSession(payload.session);
    library.sessions.unshift(item);
    await write(library); return { id: item.id, message: 'Collection créée.' };
  }
  if (message.type === 'snapshot') { await snapshot(library, true); return { message: 'Sauvegarde vérifiée (sans doublon).' }; }
  if (message.type === 'sleep') return sleepTabs(await live(), payload.tabIds);
  if (message.type === 'focus') {
    const tab = await chrome.tabs.get(payload.id);
    if (tab.incognito) throw new Error('Fenêtre privée exclue.');
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true }); return {};
  }
  if (message.type === 'settings') {
    const settings = payload.settings;
    if (!settings || typeof settings.autosave !== 'boolean' || ![0, 15, 30, 60].includes(settings.sleepMinutes)
      || !['light', 'dark', 'system'].includes(settings.theme)) throw new Error('Réglages invalides.');
    library.settings = { autosave: settings.autosave, sleepMinutes: settings.sleepMinutes, theme: settings.theme };
    await write(library); return { message: 'Réglages enregistrés.' };
  }
  if (message.type === 'import') {
    const imported = parseBackup(payload.backup);
    library.sessions.unshift(...imported);
    await write(library); return { message: `${imported.length} session(s) importée(s), sans remplacer les existantes.` };
  }
  const index = library.sessions.findIndex(session => session.id === payload.id);
  if (index < 0) throw new Error('Cette session n’existe plus. Actualisez la page.');
  const item = library.sessions[index];
  if (message.type === 'restore') return restore(item);
  if (payload.revision !== undefined && payload.revision !== item.updatedAt) {
    throw new Error('Cette session a changé dans une autre fenêtre. Fermez le détail et rouvrez-le avant de modifier.');
  }
  if (message.type === 'edit') {
    library.sessions[index] = { ...cleanSession({ ...item, ...payload.changes, windows: item.windows }), id: item.id,
      auto: false, archived: item.archived, createdAt: item.createdAt, updatedAt: Date.now() };
  } else if (message.type === 'favorite') {
    item.favorite = !item.favorite;
    if (item.favorite) item.auto = false;
  }
  else if (message.type === 'archive') item.archived = typeof payload.archived === 'boolean' ? payload.archived : !item.archived;
  else if (message.type === 'dedupe') {
    library.sessions[index] = { ...dedupe(item), updatedAt: Date.now(), auto: false };
    if (allTabs(library.sessions[index]).length !== allTabs(item).length) {
      library.sessions.unshift({ ...item, id: crypto.randomUUID(), title: `${item.title} · avant dédoublonnage`, archived: true, favorite: false });
    }
  }
  else if (message.type === 'move') {
    const target = library.sessions.find(session => session.id === payload.target && !session.archived && !session.auto);
    if (!target || target.id === item.id || !Array.isArray(payload.positions)) throw new Error('Destination invalide.');
    const positions = new Set(payload.positions);
    const moved = item.windows.map((win, wi) => ({ tabs: win.tabs.filter((tab, ti) => positions.has(`${wi}:${ti}`)) })).filter(win => win.tabs.length);
    if (!moved.length) throw new Error('Sélectionnez au moins un onglet.');
    const remaining = item.windows.map((win, wi) => ({ tabs: win.tabs.filter((tab, ti) => !positions.has(`${wi}:${ti}`)) })).filter(win => win.tabs.length);
    // Keep original grouping isolated from any same-named group in the destination.
    target.windows = cleanSession({ ...target, windows: [...target.windows, ...moved] }).windows;
    target.updatedAt = Math.max(Date.now(), target.updatedAt + 1);
    if (remaining.length) item.windows = remaining;
    else item.archived = true;
    item.auto = false;
    item.updatedAt = Date.now();
  }
  else if (message.type === 'tabs') {
    // Keep a recoverable copy before editing the content of a saved session.
    const replacement = cleanSession({ ...item, windows: payload.windows });
    library.sessions.unshift({ ...item, id: crypto.randomUUID(), title: `${item.title} · avant modification`, archived: true, favorite: false });
    library.sessions[index + 1] = { ...replacement, id: item.id, auto: false, updatedAt: Date.now() };
  } else throw new Error('Action inconnue.');
  const updated = library.sessions.find(session => session.id === item.id);
  updated.updatedAt = Math.max(Date.now(), item.updatedAt + 1);
  await write(library);
  return { message: message.type === 'archive' ? (item.archived ? 'Session archivée. Retrouvez-la dans les archives.' : 'Session sortie des archives.') : 'Session mise à jour.' };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('index.html'))) return;
  serial(() => dispatch(message)).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});

async function openApp() {
  const url = chrome.runtime.getURL('index.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url === url);
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
  } else await chrome.tabs.create({ url });
}
chrome.action.onClicked.addListener(() => openApp().catch(console.error));
chrome.commands.onCommand.addListener(command => { if (command === 'open-sessions') openApp().catch(console.error); });

async function alarms() {
  await chrome.alarms.create('snapshot', { delayInMinutes: 1, periodInMinutes: 5 });
  await chrome.alarms.create('sleep', { periodInMinutes: 1 });
}
chrome.runtime.onInstalled.addListener(() => alarms().catch(console.error));
chrome.runtime.onStartup.addListener(() => alarms().catch(console.error));
chrome.alarms.onAlarm.addListener(alarm => {
  serial(async () => {
    const library = await state();
    if (alarm.name === 'snapshot') await snapshot(library);
    if (alarm.name === 'sleep' && library.settings.sleepMinutes) {
      await sleepTabs(await live(), null, Date.now() - library.settings.sleepMinutes * 60000);
    }
  }).catch(console.error);
});
