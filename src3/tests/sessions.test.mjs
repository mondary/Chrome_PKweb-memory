import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanSession, tabURL, parseBackup, matches, dedupe, tabCount, emptyState, fingerprint, exportText } from '../core.mjs';
import { mockChrome } from './mock-chrome.mjs';

const fake = mockChrome();
globalThis.chrome = fake.chrome;
const { dispatch } = await import('../sw.js');
const saved = changes => cleanSession({ title: 'Recherche', windows: [{ tabs: [{ url: 'https://example.com/', title: 'Exemple' }] }], ...changes });
const liveTab = (id, changes = {}) => ({ id, windowId: 1, url: `https://example.com/${id}`, title: `Onglet ${id}`, active: false, pinned: false, groupId: -1, lastAccessed: Date.now() - 7200000, ...changes });
const setup = (sessions = [], tabs = [liveTab(1)]) => fake.reset({ storage: { library: { ...emptyState(), sessions } }, windows: [{ id: 1, type: 'normal', tabs }] });
const call = (type, payload) => dispatch({ type, payload });

test('manifest references existing resources and uses only necessary permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.chrome_url_overrides, undefined);
  for (const file of [manifest.background.service_worker, manifest.icons['128'], 'index.html', 'app.js', 'style.css']) {
    assert.ok((await readFile(new URL(`../${file}`, import.meta.url))).length);
  }
});

test('rejects unsafe imported URLs, unwraps suspended web tabs and prefers pending navigation', () => {
  for (const url of ['javascript:alert(1)', 'file:///secret', 'data:text/html,bad', 'chrome://settings', 'broken']) {
    assert.throws(() => saved({ windows: [{ tabs: [{ url }] }] }));
  }
  assert.equal(tabURL({ url: 'chrome-extension://other/suspended.html#uri=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2' }), 'https://example.com/a?x=1&y=2');
  assert.equal(tabURL({ url: 'chrome://newtab' }), null);
  assert.equal(tabURL({ url: 'https://old.test', pendingUrl: 'https://new.test/' }), 'https://new.test/');
});

test('search finds titles, tags and individual tab notes; strict dedupe preserves query variants', () => {
  const session = saved({ tags: ['Travail'], windows: [{ tabs: [
    { url: 'https://example.com/', title: 'Documentation', note: 'Contrat important' },
    { url: 'https://example.com/' }, { url: 'https://example.com/?other=1' },
  ] }] });
  assert.equal(matches(session, 'TRAVAIL contrat'), true);
  assert.equal(matches(session, 'inconnu'), false);
  assert.equal(tabCount(dedupe(session)), 2);
  assert.equal(tabCount(session), 3);
  assert.ok(exportText(session, true).includes('Contrat important'));
});

test('backup validates the whole document and gives fresh IDs', () => {
  const session = saved();
  const backup = { format: 'pk-sessions', schema: 1, sessions: [session] };
  const imported = parseBackup(backup);
  assert.notEqual(imported[0].id, session.id);
  assert.equal(fingerprint(imported[0]), fingerprint(session));
  assert.throws(() => parseBackup({ ...backup, schema: 2 }));
  assert.throws(() => parseBackup({ ...backup, sessions: [session, { windows: [] }] }));
});

test('failed persistence never closes any live tab', async () => {
  setup([], [liveTab(1), liveTab(2)]);
  fake.failWrite(true);
  await assert.rejects(call('save', { close: true }), /QUOTA/);
  assert.equal(fake.inspect().windows[0].tabs.length, 2);
  assert.deepEqual(fake.events, []);
});

test('save and close persists first and preserves pinned/internal/private tabs', async () => {
  setup([], [liveTab(1), liveTab(2, { pinned: true }), liveTab(3, { url: 'chrome://settings' })]);
  const current = fake.inspect();
  current.windows.push({ id: 2, incognito: true, type: 'normal', tabs: [liveTab(4, { windowId: 2, incognito: true })] });
  fake.reset(current);
  const result = await call('save', { title: 'Capture', close: true });
  assert.ok(result.id);
  const after = fake.inspect();
  assert.equal(tabCount(after.storage.library.sessions[0]), 2);
  assert.deepEqual(after.windows[0].tabs.map(t => t.id), [2, 3]);
  assert.equal(after.windows[1].tabs.length, 1);
  assert.equal(fake.events[0], 'write');
});

test('save does not close a tab which navigated after capture', async () => {
  setup();
  const originalGet = chrome.tabs.get;
  chrome.tabs.get = async id => ({ ...await originalGet(id), url: 'https://new.test/' });
  try { await call('save', { close: true }); } finally { chrome.tabs.get = originalGet; }
  assert.equal(fake.inspect().windows[0].tabs.length, 1);
});

test('selected tabs save only the requested subset', async () => {
  setup([], [liveTab(1), liveTab(2)]);
  await call('save', { tabIds: [2] });
  assert.equal(tabCount(fake.inspect().storage.library.sessions[0]), 1);
  assert.equal(fake.inspect().storage.library.sessions[0].windows[0].tabs[0].url, 'https://example.com/2');
});

test('restore preserves window boundaries, pinned state and native groups', async () => {
  const item = saved({ windows: [
    { tabs: [{ url: 'https://a.test/', pinned: true }, { url: 'https://b.test/', group: '7', groupTitle: 'Projet', groupColor: 'blue', active: true }] },
    { tabs: [{ url: 'https://c.test/' }] },
  ] });
  setup([item]);
  await call('restore', { id: item.id });
  const data = fake.inspect();
  assert.equal(data.windows.length, 3);
  assert.equal(data.windows[1].tabs[0].pinned, true);
  assert.equal(data.groups[0].title, 'Projet');
  assert.equal(data.groups[0].color, 'blue');
  assert.equal(data.storage.library.sessions.length, 1);
  fake.failCreate(true);
  await assert.rejects(call('restore', { id: item.id }), /session reste enregistrée/);
});

test('sleep protects active, pinned, audible and already sleeping tabs', async () => {
  setup([], [liveTab(1), liveTab(2, { active: true }), liveTab(3, { pinned: true }), liveTab(4, { audible: true }), liveTab(5, { discarded: true })]);
  await call('sleep', {});
  assert.deepEqual(fake.events, ['discard:1']);
});

test('autosave deduplicates and caps only automatic versions, never manual ones', async () => {
  const manual = saved();
  const old = Array.from({ length: 22 }, (_, i) => saved({ auto: true, windows: [{ tabs: [{ url: `https://old.test/${i}` }] }] }));
  setup([manual, ...old]);
  await call('snapshot');
  let sessions = fake.inspect().storage.library.sessions;
  assert.equal(sessions.filter(s => s.auto).length, 20);
  assert.ok(sessions.some(s => s.id === manual.id));
  const count = sessions.length;
  await call('snapshot');
  assert.equal(fake.inspect().storage.library.sessions.length, count);
  const before = fake.inspect(); before.windows = []; fake.reset(before);
  await call('snapshot');
  assert.equal(fake.inspect().storage.library.sessions.length, count);
});

test('invalid import is atomic; valid import appends without replacing existing data', async () => {
  const original = saved(); setup([original]);
  const backup = { format: 'pk-sessions', schema: 1, sessions: [saved(), { windows: [] }] };
  await assert.rejects(call('import', { backup }));
  assert.equal(fake.inspect().storage.library.sessions.length, 1);
  backup.sessions.pop(); await call('import', { backup });
  assert.equal(fake.inspect().storage.library.sessions.length, 2);
  assert.ok(fake.inspect().storage.library.sessions.some(s => s.id === original.id));
});

test('tab changes keep an archived copy; stale edits are rejected', async () => {
  const original = saved(); setup([original]);
  await call('tabs', { id: original.id, revision: original.updatedAt, windows: [{ tabs: [{ url: 'https://changed.test/' }] }] });
  const data = fake.inspect().storage.library.sessions;
  assert.equal(data.length, 2);
  assert.equal(data[0].archived, true);
  assert.equal(data[0].windows[0].tabs[0].url, 'https://example.com/');
  await assert.rejects(call('edit', { id: original.id, revision: original.updatedAt, changes: { title: 'Stale' } }), /autre fenêtre/);
});

test('moving all tabs archives the source and preserves the destination', async () => {
  const source = saved(), target = saved({ title: 'Destination' }); setup([source, target]);
  await call('move', { id: source.id, target: target.id, positions: ['0:0'] });
  const sessions = fake.inspect().storage.library.sessions;
  assert.equal(sessions.find(s => s.id === source.id).archived, true);
  assert.equal(tabCount(sessions.find(s => s.id === target.id)), 2);
});

test('messages from concurrent extension pages are serialized without lost saves', async () => {
  setup();
  const send = title => new Promise(resolve => chrome.runtime.onMessage.fire({ type: 'save', payload: { title } }, { id: chrome.runtime.id, url: chrome.runtime.getURL('index.html') }, resolve));
  const results = await Promise.all([send('One'), send('Two'), send('Three')]);
  assert.ok(results.every(result => result.ok));
  assert.equal(fake.inspect().storage.library.sessions.length, 3);
});

test('manual snapshot works with autosave disabled and a favorited backup becomes permanent', async () => {
  setup();
  await call('settings', { settings: { autosave: false, sleepMinutes: 0, theme: 'dark' } });
  await call('snapshot');
  const item = fake.inspect().storage.library.sessions[0];
  assert.ok(item.auto);
  await call('favorite', { id: item.id });
  const permanent = fake.inspect().storage.library.sessions[0];
  assert.equal(permanent.favorite, true);
  assert.equal(permanent.auto, false);
});

test('deduplication retains an archived original including duplicate notes', async () => {
  const item = saved({ windows: [{ tabs: [{ url: 'https://example.com/' }, { url: 'https://example.com/', note: 'Keep this note' }] }] });
  setup([item]);
  await call('dedupe', { id: item.id });
  const sessions = fake.inspect().storage.library.sessions;
  assert.equal(tabCount(sessions.find(s => s.id === item.id)), 1);
  assert.equal(sessions.find(s => s.archived).windows[0].tabs[1].note, 'Keep this note');
});
