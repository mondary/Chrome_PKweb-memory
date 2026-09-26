import { DEFAULT_SETTINGS, emptyState, tabURL, cleanSession, allTabs, fingerprint, parseBackup, dedupe, webURL, removeTab, prunePreviews } from './core.mjs';

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
  if (message.type === 'preview') {
    if (!library.settings.previews) return { src: null };
    const { previews = {} } = await chrome.storage.local.get('previews');
    const hit = previews[payload.url];
    return { src: hit?.at > Date.now() - 30 * 86400000 ? hit.src : null };
  }
  if (message.type === 'close-tab') {
    const tab = (await live()).flatMap(win => win.tabs).find(tab => tab.id === payload.tabId);
    if (!tab || tab.originalUrl !== payload.expectedURL) throw new Error('Cet onglet a changé ou est déjà fermé. Actualisez la liste.');
    const backup = cleanSession({ title: tab.title, archived: true, windows: [{ tabs: [tab] }] });
    library.sessions.unshift(backup);
    await write(library);
    const current = await chrome.tabs.get(tab.id);
    if (current.incognito || (current.pendingUrl || current.url) !== payload.expectedURL) {
      throw new Error('L’onglet a changé de page pendant l’enregistrement ; il n’a pas été fermé.');
    }
    // An explicit row close also applies to pinned tabs, unlike bulk cleanup.
    await chrome.tabs.remove(tab.id);
    return { message: 'Onglet fermé.', undo: { type: 'restore', payload: { id: backup.id }, label: 'Rouvrir' } };
  }
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
    if (settings.previews !== undefined && typeof settings.previews !== 'boolean') throw new Error('Réglage d’aperçu invalide.');
    library.settings = { autosave: settings.autosave, sleepMinutes: settings.sleepMinutes, theme: settings.theme, previews: settings.previews ?? library.settings.previews };
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
    throw new Error('Cette session a changé dans une autre fenêtre. Actualisez la liste avant de modifier.');
  }
  if (message.type === 'remove-tab') {
    const remaining = removeTab(item, payload.position, payload.expectedURL);
    const backup = { ...item, id: crypto.randomUUID(), title: `${item.title} · avant retrait`, archived: true, favorite: false };
    library.sessions.unshift(backup);
    const updated = { ...item, windows: remaining.length ? remaining : item.windows,
      archived: remaining.length ? item.archived : true, auto: false, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
    library.sessions[index + 1] = updated;
    await write(library);
    return { message: 'Lien retiré de cette session.', undo: { type: 'undo-remove',
      payload: { id: item.id, backupId: backup.id, revision: updated.updatedAt, archived: item.archived, auto: item.auto }, label: 'Annuler' } };
  }
  if (message.type === 'undo-remove') {
    const backup = library.sessions.find(s => s.id === payload.backupId && s.archived);
    if (!backup) throw new Error('La copie de récupération n’est plus disponible.');
    library.sessions[index] = { ...item, windows: backup.windows, archived: payload.archived === true,
      auto: payload.auto === true, updatedAt: Math.max(Date.now(), item.updatedAt + 1) };
    await write(library); return { message: 'Lien rétabli.' };
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

// Capture only pages the user actually views. Never activate a tab to take a screenshot,
// and never send its URL or pixels to an external thumbnail service.
let captureTimer, capturing = false, lastCapture = 0;
export async function capturePreview(windowId, expectedId) {
  if (capturing || Date.now() - lastCapture < 1000) return;
  const library = await state();
  if (!library.settings.previews) return;
  const win = await chrome.windows.get(windowId, { populate: true });
  const tab = win.tabs?.find(tab => tab.active);
  if (!win.focused || win.type !== 'normal' || win.incognito || !tab || tab.incognito
    || tab.id !== expectedId || tab.pendingUrl || !webURL(tab.url) || tab.status === 'loading') return;
  capturing = true; lastCapture = Date.now();
  try {
    const dataURL = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 });
    const current = await chrome.tabs.get(tab.id);
    if (!current.active || current.incognito || current.windowId !== windowId || current.url !== tab.url || current.pendingUrl) return;
    const image = await createImageBitmap(await (await fetch(dataURL)).blob());
    const canvas = new OffscreenCanvas(440, Math.round(image.height * 440 / image.width));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.55 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    const src = `data:image/jpeg;base64,${btoa(binary)}`;
    await serial(async () => {
      if (!(await state()).settings.previews) return;
      const { previews = {} } = await chrome.storage.local.get('previews');
      previews[tab.url] = { src, at: Date.now() };
      await chrome.storage.local.set({ previews: prunePreviews(previews) });
    });
  } finally { capturing = false; }
}
function scheduleCapture(windowId, tabId) {
  clearTimeout(captureTimer);
  captureTimer = setTimeout(() => capturePreview(windowId, tabId).catch(console.warn), 1100);
}
chrome.tabs.onActivated.addListener(({ windowId, tabId }) => scheduleCapture(windowId, tabId));
chrome.tabs.onUpdated.addListener((tabId, changes, tab) => {
  if (changes.status === 'complete' && tab.active) scheduleCapture(tab.windowId, tabId);
});
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId < 0) return;
  chrome.tabs.query({ windowId, active: true }).then(tabs => {
    if (tabs[0]) scheduleCapture(windowId, tabs[0].id);
  }).catch(console.warn);
});
