// Pure data helpers shared by the worker, interface and checks.
export const DEFAULT_SETTINGS = { autosave: true, sleepMinutes: 0, theme: 'light', previews: true };
export const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export const emptyState = () => ({ sessions: [], settings: { ...DEFAULT_SETTINGS } });
const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';

export function webURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function tabURL(tab) {
  const raw = tab.pendingUrl || tab.url || '';
  if (webURL(raw)) return webURL(raw);
  // Same suspended-tab convention as extension/sessionlib.js, restricted to web URLs.
  if (!/^(chrome|chrome-extension|edge|about):/i.test(raw)) return null;
  const match = /[?#&](?:url|uri)=([^&#]+)/i.exec(raw);
  if (!match) return null;
  try { return webURL(decodeURIComponent(match[1])); } catch { return null; }
}

export function cleanTab(tab) {
  const url = webURL(tab?.url);
  if (!url) throw new Error('Chaque onglet doit contenir une URL http ou https valide.');
  return {
    url, title: text(tab.title, 500) || url, note: text(tab.note, 4000),
    pinned: tab.pinned === true, active: tab.active === true,
    group: text(tab.group, 100), groupTitle: text(tab.groupTitle, 200),
    groupColor: COLORS.includes(tab.groupColor) ? tab.groupColor : 'grey',
  };
}

export function cleanSession(item, now = Date.now()) {
  if (!item || !Array.isArray(item.windows) || !item.windows.length || item.windows.length > 100) {
    throw new Error('Format de session invalide.');
  }
  let total = 0;
  const windows = item.windows.map(win => {
    if (!Array.isArray(win.tabs) || !win.tabs.length) throw new Error('Une fenêtre ne peut pas être vide.');
    total += win.tabs.length;
    if (total > 5000) throw new Error('Maximum : 5 000 onglets par session.');
    return { tabs: win.tabs.map(cleanTab) };
  });
  const date = value => Number.isFinite(value) && value > 0 && value <= now ? value : now;
  return {
    id: crypto.randomUUID(), title: text(item.title, 160).trim() || 'Sans titre',
    note: text(item.note, 4000), tags: [...new Set((Array.isArray(item.tags) ? item.tags : [])
      .map(tag => text(tag, 40).trim()).filter(Boolean))].slice(0, 12),
    favorite: item.favorite === true, archived: item.archived === true,
    auto: item.auto === true, createdAt: date(item.createdAt), updatedAt: date(item.updatedAt), windows,
  };
}

export const allTabs = session => session.windows.flatMap(win => win.tabs);
export const tabCount = session => allTabs(session).length;
export const fingerprint = session => JSON.stringify(session.windows.map(win => win.tabs.map(
  ({ url, pinned, group, groupTitle, groupColor }) => ({ url, pinned, group, groupTitle, groupColor })
)));

export function matches(session, query) {
  const haystack = [session.title, session.note, ...session.tags,
    ...allTabs(session).flatMap(tab => [tab.title, tab.url, tab.note])].join(' ').toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every(word => haystack.includes(word));
}

export function parseBackup(value) {
  if (!value || value.format !== 'pk-sessions' || value.schema !== 1 || !Array.isArray(value.sessions)) {
    throw new Error('Choisissez une sauvegarde JSON Sessions (format pk-sessions, version 1).');
  }
  if (value.sessions.length > 2000) throw new Error('Maximum : 2 000 sessions par import.');
  // Validate everything before the caller writes anything. Imported IDs are never trusted.
  return value.sessions.map(item => cleanSession(item));
}

export function dedupe(session) {
  const seen = new Set();
  return { ...session, windows: session.windows.map(win => ({ tabs: win.tabs.filter(tab => {
    if (seen.has(tab.url)) return false;
    seen.add(tab.url); return true;
  }) })).filter(win => win.tabs.length) };
}

export function exportText(session, markdown = false) {
  return allTabs(session).map(tab => markdown
    ? `- [${tab.title.replace(/[\[\]\\]/g, '\\$&').replace(/\s+/g, ' ')}](<${tab.url.replace(/>/g, '%3E')}>)${tab.note ? ` — ${tab.note.replace(/\s+/g, ' ')}` : ''}`
    : tab.url).join('\n');
}

// Session rows keep their window/tab position even when some previous windows are empty.
export function removeTab(session, position, expectedURL) {
  const match = /^(\d+):(\d+)$/.exec(String(position));
  if (!match) throw new Error('Position d’onglet invalide.');
  const [, wi, ti] = match.map(Number);
  const tab = session.windows[wi]?.tabs[ti];
  if (!tab || tab.url !== expectedURL) throw new Error('Cette ligne a changé. Actualisez avant de la retirer.');
  return session.windows.map((win, index) => ({ tabs: win.tabs.filter((_, i) => index !== wi || i !== ti) }))
    .filter(win => win.tabs.length);
}

export function prunePreviews(cache, now = Date.now()) {
  // ponytail: bounded local cache (60 captures / 2 MB); IndexedDB if a larger history is needed.
  let size = 0;
  return Object.fromEntries(Object.entries(cache).filter(([, item]) => item.at > now - 30 * 86400000)
    .sort((a, b) => b[1].at - a[1].at).slice(0, 60).filter(([, item]) => (size += item.src.length) <= 2 * 1024 * 1024));
}
