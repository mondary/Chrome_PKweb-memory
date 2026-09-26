// Test and explicit ?demo preview only. Never loaded by the installed extension.
const event = () => {
  const listeners = [];
  return { addListener: listener => listeners.push(listener), fire: (...args) => listeners.map(fn => fn(...args)) };
};
export function mockChrome(initial = {}) {
  let storage, browserWindows, groups, nextId, failWrite, failCreate;
  const events = [];
  function reset(data = {}) {
    storage = structuredClone(data.storage || {});
    browserWindows = structuredClone(data.windows || []);
    groups = structuredClone(data.groups || []);
    nextId = 10000; failWrite = false; failCreate = false; events.length = 0;
  }
  reset(initial);
  const tabs = () => browserWindows.flatMap(win => win.tabs);
  const findTab = id => {
    const tab = tabs().find(tab => tab.id === id);
    if (!tab) throw new Error('No tab with id');
    return tab;
  };
  const chrome = {
    runtime: {
      id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path.replace(/^\//, '')}`,
      getManifest: () => ({ version_name: '2026.09.1' }),
      onMessage: event(), onInstalled: event(), onStartup: event(),
    },
    storage: { local: {
      get: async key => structuredClone({ [key]: storage[key] }),
      set: async value => {
        if (failWrite) throw new Error('QUOTA_BYTES exceeded');
        events.push('write'); Object.assign(storage, structuredClone(value));
      },
    }, onChanged: event() },
    windows: {
      getAll: async () => structuredClone(browserWindows.filter(win => win.type !== 'popup')),
      create: async ({ url, focused = true }) => {
        if (failCreate) throw new Error('Window creation failed');
        const win = { id: nextId++, type: 'normal', focused, tabs: [] };
        browserWindows.push(win);
        await chrome.tabs.create({ windowId: win.id, url, active: true });
        return structuredClone(win);
      },
      update: async (id, changes) => {
        const win = browserWindows.find(win => win.id === id);
        if (!win) throw new Error('No window');
        Object.assign(win, changes); return structuredClone(win);
      },
      onFocusChanged: event(),
    },
    tabs: {
      query: async () => structuredClone(tabs()),
      get: async id => structuredClone(findTab(id)),
      create: async ({ windowId, url, active = true }) => {
        if (failCreate) throw new Error('Tab creation failed');
        const win = browserWindows.find(win => win.id === windowId) || browserWindows[0];
        if (!win) throw new Error('No window');
        const tab = { id: nextId++, windowId: win.id, url, title: new URL(url).hostname, active, pinned: false, groupId: -1 };
        win.tabs.push(tab); events.push('create'); return structuredClone(tab);
      },
      update: async (id, changes) => { Object.assign(findTab(id), changes); return structuredClone(findTab(id)); },
      remove: async id => {
        const tab = findTab(id), win = browserWindows.find(win => win.id === tab.windowId);
        win.tabs = win.tabs.filter(t => t.id !== id); events.push(`remove:${id}`);
      },
      discard: async id => { findTab(id).discarded = true; events.push(`discard:${id}`); },
      group: async ({ tabIds }) => {
        const groupId = nextId++; tabIds.forEach(id => findTab(id).groupId = groupId);
        groups.push({ id: groupId }); return groupId;
      },
      onCreated: event(), onRemoved: event(), onUpdated: event(), onMoved: event(), onAttached: event(), onDetached: event(), onActivated: event(),
    },
    tabGroups: {
      query: async () => structuredClone(groups),
      update: async (id, changes) => Object.assign(groups.find(group => group.id === id), changes),
    },
    action: { onClicked: event() }, commands: { onCommand: event() },
    alarms: { create: async () => {}, onAlarm: event() },
  };
  return {
    chrome, reset, events,
    inspect: () => structuredClone({ storage, windows: browserWindows, groups }),
    failWrite: value => failWrite = value,
    failCreate: value => failCreate = value,
  };
}
