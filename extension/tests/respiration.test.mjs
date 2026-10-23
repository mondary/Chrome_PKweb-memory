import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../respiration.js', import.meta.url), 'utf8');
const copy = (x) => structuredClone(x);
const chromeClone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item));
function setup(count = 100, overrides = {}) {
  const context = vm.createContext({ crypto: globalThis.crypto, URL, console });
  vm.runInContext(source, context);
  const local = {}, session = {}, saved = [], created = [], removed = [], events = [];
  let nextId = 1000, engine, failWrite = false, failCreate = false, failBackup = false;
  const windows = new Set([1]);
  const tabs = new Map(Array.from({ length: count }, (_, i) => [i + 1, {
    id: i + 1, windowId: 1, index: i, url: `https://example.test/${i + 1}`, title: `Page ${i + 1}`,
    active: i === count - 1, pinned: false, audible: false, incognito: false,
    autoDiscardable: true, discarded: false, groupId: -1, lastAccessed: i + 1, status: 'complete', ...(overrides[i + 1] || {}),
  }]));
  const list = (id = 1) => [...tabs.values()].filter((t) => t.windowId === id).sort((a, b) => a.index - b.index);
  const normalize = (id) => list(id).forEach((t, i) => { t.index = i; });
  const storage = (object) => ({
    get: async (key) => ({ [key]: copy(object[key]) }),
    set: async (values) => { if (object === local && failWrite) throw Error('storage full'); Object.assign(object, chromeClone(values)); },
  });
  const chrome = {
    storage: { local: storage(local), session: storage(session) },
    windows: { get: async (id) => {
      if (!windows.has(id)) throw Error('window gone');
      return { id, type: 'normal', incognito: false, tabs: copy(list(id)) };
    }, update: async (id) => { if (!windows.has(id)) throw Error("window gone"); return {id}; } },
    tabGroups: { query: async () => [{ id: 1, title: 'Projet A', color: 'blue' }, { id: 2, title: 'Projet B', color: 'red' }] },
    scripting: { executeScript: async ({ target }) => {
      const t = tabs.get(target.tabId); if (t.probeFails) throw Error('restricted');
      return [{ result: t.playing ? 'media' : null }];
    } },
    tabs: {
      get: async (id) => { if (!tabs.has(id)) throw Error('tab gone'); return copy(tabs.get(id)); },
      update: async (id, data) => {
        const t = tabs.get(id); if (!t) throw Error('tab gone');
        if (data.active) for (const item of list(t.windowId)) item.active = false;
        Object.assign(t, data, {lastAccessed:Date.now()});
        if (data.active) t.discarded = false; // Chrome recharge un suspendu activé
        return copy(t);
      },
      discard: async (id) => {
        const t = tabs.get(id); if (!t) throw Error('tab gone');
        if (t.active) return copy(t); // Chrome ne suspend jamais l'actif
        if (t.refuseDiscard) throw Error('discard refused');
        t.discarded = true; return copy(t);
      },
      remove: async (id) => {
        const t = tabs.get(id); if (!t) throw Error('tab gone');
        if (t.refuseClose) throw Error('close refused');
        const state = local['bs.respiration'];
        // Production must already hold this URL in durable pending storage.
        assert.ok(state?.entries.some((e) => e.url === t.url && e.state === 'parking'));
        removed.push(id); remove(id);
      },
      query: async () => copy(list(1).filter((t) => t.active)),
      create: async (data) => {
        if (failCreate || !windows.has(data.windowId)) throw Error('create failed');
        assert.equal(data.active, false, 'refill must not steal focus');
        assert.ok(local['bs.respiration'].entries.some((e) => e.url === data.url && e.state === 'opening'));
        const index = data.index ?? list(data.windowId).length;
        list(data.windowId).filter((t) => t.index >= index).forEach((t) => { t.index++; });
        const t = { id: nextId++, ...data, title: data.url, status: 'complete', pinned: false, groupId: -1, autoDiscardable: true, discarded: false };
        tabs.set(t.id, t); created.push(copy(t)); return copy(t);
      },
    },
  };
  const createEngine = () => context.PKRespiration.create({ chrome, saveSession: async (title, entries) => {
    if (failBackup) throw Error('backup failed');
    const id = `session-${saved.length}`; saved.push({ id, title, entries: copy(entries) }); return id;
  } });
  engine = createEngine();
  function remove(id, isWindowClosing = false) {
    const tab = tabs.get(id); tabs.delete(id); normalize(tab.windowId);
    const info = { windowId: tab.windowId, isWindowClosing };
    if (engine.noticeRemoval(id, info)) events.push(() => engine.removed(id, info));
  }
  return {
    get engine() { return engine; }, tabs, local, session, saved, created, removed, list, windows,
    start: (extra = {}) => engine.command('start', { windowId: 1, target: 10, ...extra }),
    remove, flush: async () => { while (events.length) await events.shift()(); },
    state: () => copy(local['bs.respiration']),
    failWrite: () => { failWrite = true; }, failCreate: () => { failCreate = true; }, failBackup: () => { failBackup = true; },
    restartWorker: () => { engine = createEngine(); },
    restartBrowser: () => { delete session['bs.respiration.boot']; engine = createEngine(); },
  };
}

test('100 onglets → 91…100 ; fermer 100 ramène 90, puis 89 à gauche sans focus', async () => {
  const h = setup(); await h.start(); await h.flush();
  assert.deepEqual(h.list().map((t) => t.id), [91,92,93,94,95,96,97,98,99,100]);
  assert.equal(h.state().entries.filter((e) => e.state === 'pending').length, 90);
  assert.equal(h.saved.flatMap((s) => s.entries).length, 100);
  h.remove(100); await h.flush();
  assert.deepEqual(h.list().map((t) => Number(t.url.split('/').at(-1))), [90,91,92,93,94,95,96,97,98,99]);
  h.remove(99); await h.flush();
  assert.deepEqual(h.list().map((t) => Number(t.url.split('/').at(-1))), [89,90,91,92,93,94,95,96,97,98]);
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 2);
});

test('rafale de fermetures : chaque page est traitée une fois et aucun dépassement', async () => {
  const h = setup(); await h.start(); h.remove(100); h.remove(99); h.remove(98); await h.flush();
  assert.equal(h.list().length, 10);
  assert.deepEqual(h.created.map((t) => t.url), [90,89,88].map((i) => `https://example.test/${i}`));
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 3);
});

test('pause : les ⌘W restent traités, reprise complète seulement les places libres', async () => {
  const h = setup(); await h.start(); await h.engine.command('pause');
  h.remove(100); h.remove(99); await h.flush(); assert.equal(h.list().length, 8);
  await h.engine.command('resume'); assert.equal(h.list().length, 10);
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 2);
});

test('fermer une fenêtre conserve les pages non traitées et ne crée aucune fenêtre', async () => {
  const h = setup(); await h.start(); h.windows.delete(1);
  for (const t of h.list()) h.remove(t.id, true);
  await h.flush(); assert.equal(h.created.length, 0); assert.equal(h.state().paused, true);
  assert.equal(h.state().windowId, null); assert.equal(h.state().entries.filter((e) => e.state === 'pending').length, 100);
});

test('rechargement extension : la tournée reprend seule si la fenêtre est intacte', async () => {
  const h = setup(); await h.start(); h.restartBrowser();
  const q = await h.engine.get(); assert.equal(q.paused, false); assert.equal(q.windowId, 1);
  assert.equal(h.created.length, 0);
  h.remove(100); await h.flush(); assert.equal(h.created[0].url, 'https://example.test/90');
});

test('rechargement extension : une pause demandée est conservée', async () => {
  const h = setup(); await h.start(); await h.engine.command('pause'); h.restartBrowser();
  const q = await h.engine.get(); assert.equal(q.paused, true); assert.equal(q.pausedBy, 'user');
  await h.engine.command('resume', { windowId: 1 }); assert.equal(h.list().length, 10);
});

test('réveil du service worker : la tournée et les ids sont conservés', async () => {
  const h = setup(); await h.start(); h.restartWorker();
  assert.equal((await h.engine.get()).paused, false);
  h.remove(100); await h.flush(); assert.equal(h.created[0].url, 'https://example.test/90');
});

test('mode suspendre : 12 onglets, cible 4 → 8 suspendus, aucun fermé', async () => {
  const h = setup(12); await h.start({ target: 4, mode: 'suspend' });
  assert.equal(h.list().length, 12);
  assert.equal(h.list().filter((t) => !t.discarded).length, 4);
  assert.equal(h.list().filter((t) => t.discarded).length, 8);
  assert.equal(h.created.length, 0);
  assert.equal(h.removed.length, 0);
  assert.equal(h.state().mode, 'suspend');
  assert.equal(h.state().compaction.discarded, 8);
  assert.equal(h.state().entries.filter((e) => e.state === 'open').length, 12);
  assert.equal(h.state().entries.filter((e) => e.discarded).length, 8);
});

test('mode suspendre : cliquer un suspendu le recharge et en suspend un autre', async () => {
  const h = setup(12); await h.start({ target: 4, mode: 'suspend' });
  const sleeping = h.state().entries.find((e) => e.discarded);
  const result = await h.engine.command('select', { id: sleeping.id });
  assert.match(result.message, /rechargé/);
  assert.equal(h.list().length, 12);
  assert.equal(h.list().filter((t) => !t.discarded).length, 4);
  const selected = h.list().find((t) => t.url === sleeping.url);
  assert.equal(selected.discarded, false);
  assert.equal(selected.active, true);
});

test('mode suspendre : fermer un onglet reste traité et ne rouvre aucune page', async () => {
  const h = setup(12); await h.start({ target: 4, mode: 'suspend' });
  const active = h.list().find((t) => t.active);
  h.remove(active.id); await h.flush();
  assert.equal(h.list().length, 11);
  assert.equal(h.created.length, 0);
  assert.equal(h.state().entries.find((e) => e.url === active.url).state, 'done');
});

test('mode suspendre : rouvrir les pages à revenir les affiche suspendues sans en fermer', async () => {
  const h = setup(12); await h.start({ target: 10 });
  assert.equal(h.list().length, 10);
  assert.equal(h.state().entries.filter((e) => e.state === 'pending').length, 2);
  const removedBefore = h.removed.length;
  const result = await h.engine.command('reopen-suspend', { windowId: 1 });
  assert.match(result.message, /2 page\(s\) rouvertes/);
  assert.match(result.message, /2 suspendue\(s\)/);
  assert.equal(h.list().length, 12);
  assert.equal(h.list().filter((t) => !t.discarded).length, 10);
  assert.equal(h.list().filter((t) => t.discarded).length, 2);
  assert.equal(h.list().slice(0, 10).every((t) => !t.discarded), true, 'onglets ouverts gardés en tête');
  assert.equal(h.list().slice(-2).every((t) => t.discarded), true, 'pages rouvertes suspendues en bas');
  assert.equal(h.state().mode, 'suspend');
  assert.equal(h.state().entries.every((e) => e.state === 'open'), true);
  assert.equal(h.created.length, 2);
  assert.equal(h.removed.length, removedBefore);
});

test('mode suspendre : réparer un onglet suspendu vide restaure son URL', async () => {
  const h = setup(12); await h.start({ target: 10 });
  await h.engine.command('reopen-suspend', { windowId: 1 });
  const entry = h.state().entries.find((e) => e.discarded);
  const tab = h.tabs.get(entry.tabId);
  tab.url = 'about:blank'; tab.discarded = false; tab.title = '';
  const result = await h.engine.command('repair-suspend', { windowId: 1 });
  assert.match(result.message, /1\/1/);
  assert.equal(h.tabs.get(entry.tabId).url, entry.url);
  assert.equal(h.tabs.get(entry.tabId).discarded, true);
});

test('aucune fermeture si la sauvegarde de session échoue', async () => {
  const h = setup(); h.failBackup(); await assert.rejects(h.start(), /backup failed/);
  assert.equal(h.list().length, 100); assert.equal(h.removed.length, 0);
});

test('aucune fermeture si la file ne peut pas être persistée', async () => {
  const h = setup(); h.failWrite(); await assert.rejects(h.start(), /storage full/);
  assert.equal(h.removed.length, 0);
});

test('une création échouée laisse la page en attente et suspend la tournée', async () => {
  const h = setup(); await h.start(); h.failCreate(); h.remove(100); await h.flush();
  assert.equal(h.state().paused, true);
  assert.equal(h.state().entries.find((e) => e.url.endsWith('/90')).state, 'pending');
});

test('seule une lecture en cours est conservée : actif, épinglé, saisie, site autrefois exclu et page inaccessible sont fermés', async () => {
  const h = setup(20, { 1: { pinned: true }, 2: { audible: true }, 3: { unsaved: true },
    4: { probeFails: true }, 5: { playing: true }, 6: { url: 'https://docs.example.org/a' },
    7: { active: true }, 8: { url: 'chrome://settings/' }, 9: { status: 'loading' } });
  await h.start({ excluded: 'example.org' });
  for (const id of [1,2,3,4,6,7,9,10]) assert.ok(!h.tabs.has(id), `l'onglet ${id} devait être fermé`);
  assert.ok(h.tabs.has(5), 'la lecture en cours reste ouverte');
  assert.ok(h.tabs.has(8), 'les pages internes restent ouvertes, hors budget');
  assert.equal(h.state().entries.find((e) => e.url.endsWith('/5')).keepReason, 'media');
});

test('les pages déjà déchargées sont parquées sans injection qui les réveillerait', async () => {
  const h = setup(11, { 1: { discarded: true, probeFails: true } });
  await h.start(); assert.ok(!h.tabs.has(1));
});

test('ouvrir soi-même une page occupe une place et retarde le remplissage', async () => {
  const h = setup(); await h.start();
  h.tabs.set(900, { id:900, index:10, windowId:1, url:'https://manual.test/' });
  h.remove(100); await h.flush(); assert.equal(h.created.length, 0);
  h.remove(99); await h.flush(); assert.equal(h.created.length, 1); assert.equal(h.list().length, 10);
});

test('une page ouverte manuellement attend le contrôle périodique : sauvegardée puis l’onglet le plus ancien sort', async () => {
  const h = setup(); await h.start();
  h.tabs.set(900, { id:900, index:10, windowId:1, url:'https://manual.test/', title:'Manuelle' });
  await h.engine.updated({ id:900, windowId:1, url:'https://manual.test/' });
  assert.ok(h.tabs.has(900), 'la page manuelle reste jusqu’au contrôle périodique');
  await h.engine.tick();
  assert.ok(h.tabs.has(900), 'la page manuelle est l’un des 10 derniers onglets');
  assert.ok(!h.tabs.has(91), 'l’onglet le plus ancien des 10 est sorti');
  assert.equal(h.saved.length, 2, 'capsule dédiée aux pages ajoutées');
  assert.equal(h.state().entries.find((e) => e.url === 'https://manual.test/').state, 'open');
  assert.equal(h.state().entries.find((e) => e.url.endsWith('/91')).state, 'pending');
  assert.equal(h.list().length, 10);
});

test('les anciens lots « Pages ajoutées à la fenêtre » fusionnent en un seul lot système', async () => {
  const h = setup(12); await h.start();
  const q = h.local['bs.respiration'];
  const extra = { id: crypto.randomUUID(), title: 'Pages ajoutées à la fenêtre' };
  q.capsules.unshift(extra);
  q.entries[0].capsuleId = extra.id;
  h.restartWorker();
  const after = await h.engine.get();
  const system = after.capsules.filter((c) => /Onglets de la fenêtre|Pages ajoutées/.test(c.title));
  assert.equal(system.length, 1);
  assert.equal(system[0].title, 'Onglets de la fenêtre');
  assert.equal(after.entries[0].capsuleId, system[0].id);
});

test('rafale d’ouvertures : updatedMany adopte plusieurs pages de la file en une passe', async () => {
  const h = setup(12); await h.start(); // ouverts 3..12, en attente 1..2
  h.tabs.set(900, { id:900, index:10, windowId:1, url:'https://example.test/1', title:'Page 1' });
  h.tabs.set(901, { id:901, index:11, windowId:1, url:'https://example.test/2', title:'Page 2' });
  await h.engine.updatedMany([
    { id:900, windowId:1, url:'https://example.test/1' },
    { id:901, windowId:1, url:'https://example.test/2' },
  ]);
  const one = h.state().entries.find((e) => e.url.endsWith('/1'));
  const two = h.state().entries.find((e) => e.url.endsWith('/2'));
  assert.equal(one.state, 'open'); assert.equal(one.tabId, 900);
  assert.equal(two.state, 'open'); assert.equal(two.tabId, 901);
});

test('un média en lecture au-delà de la cible est conservé, puis fermé à l’arrêt', async () => {
  const h = setup(12, { 1: { playing: true } }); await h.start();
  assert.ok(h.tabs.has(1));
  h.tabs.get(1).playing = false;
  await h.engine.command('compact');
  assert.ok(!h.tabs.has(1));
  assert.equal(h.list().length, 10);
});

test('fin de file : pas de recyclage des pages traitées', async () => {
  const h = setup(12); await h.start();
  for (let i = 0; i < 12; i++) { const t = h.list().at(-1); assert.ok(t); h.remove(t.id); await h.flush(); }
  assert.equal(h.list().length, 0); assert.equal(h.created.length, 2);
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 12);
});

test('les groupes deviennent des capsules dans l’ordre inverse de la pile', async () => {
  const overrides = Object.fromEntries(Array.from({ length:20 }, (_,i) => [i+1,{ groupId:i<10?1:2 }]));
  const h = setup(20, overrides); await h.start({ target: 3 });
  assert.deepEqual(h.state().capsules.map((c) => c.title), ['Projet B','Projet A']);
  for (const id of [20,19,18,1000,1001,1002,1003,1004]) { h.remove(id); await h.flush(); }
  assert.ok(h.created.some((t) => t.url === 'https://example.test/10'));
});

test('ajout de session : la capsule suivante fournit seulement les places libres', async () => {
  const h = setup(2); await h.start({ target: 2 });
  await h.engine.command('enqueue', { session: { id:'extra', title:'À lire', windows:[{ tabs:[{url:'https://other.test/1'}, {url:'https://other.test/2'}] }] } });
  assert.equal(h.created.length, 0); h.remove(2); await h.flush();
  assert.equal(h.created[0].url, 'https://other.test/2'); assert.equal(h.list().length, 2);
  await assert.rejects(h.engine.command('enqueue', { session: { id:'extra', windows:[{ tabs:[] }] } }), /déjà/);
});

test('déplacement dans une autre fenêtre : pause, aucune ouverture, état distinct de traité', async () => {
  const h = setup(); await h.start(); h.tabs.get(100).windowId = 2;
  await h.engine.detached(100, { oldWindowId:1 }); assert.equal(h.state().paused, true);
  assert.equal(h.created.length, 0); assert.equal(h.state().entries.at(-1).state, 'outside');
});

test('fermeture groupée de la bibliothèque : pause et conservation des pages en attente', async () => {
  const h = setup(); await h.start(); await h.engine.externalClose([100,99]);
  h.remove(100); h.remove(99); await h.flush();
  assert.equal(h.created.length, 0); assert.equal(h.state().paused, true);
  assert.equal(h.state().entries.at(-1).state, 'pending');
});

test('page de la file rouverte manuellement : adoption, pas de seconde ouverture', async () => {
  const h = setup(); await h.start();
  const tab = { id:900, windowId:1, index:10, url:'https://example.test/90', title:'Page 90' };
  h.tabs.set(900,tab); await h.engine.updated(tab);
  assert.equal(h.state().entries.find((e) => e.url === tab.url).tabId, 900);
  h.remove(100); h.remove(99); await h.flush();
  assert.equal(h.created[0].url, 'https://example.test/89');
});

test('navigation dans un onglet de la tournée : URL à jour dans la file', async () => {
  const h = setup(); await h.start(); const tab = h.tabs.get(100);
  tab.url = 'https://example.test/edited'; tab.title = 'Suite'; await h.engine.updated(tab);
  assert.equal(h.state().entries.at(-1).url, tab.url);
});

test('terminer désactive le remplissage et garde la file et les sessions', async () => {
  const h = setup(); await h.start(); await h.engine.command('stop'); h.remove(100); await h.flush();
  assert.equal(h.created.length, 0); assert.equal(h.state().entries.length, 100); assert.equal(h.saved.length, 1);
});

test('capsule suivante : les pages mises de côté restent en attente, même l’onglet actif est fermé', async () => {
  const overrides = Object.fromEntries(Array.from({ length:20 }, (_,i) => [i+1,{ groupId:i<10?1:2 }]));
  const h = setup(20, overrides); await h.start({ target:3 });
  await h.engine.command('next'); await h.flush();
  assert.equal(h.list().length,3);
  assert.deepEqual(h.created.map((t) => t.url),['https://example.test/10','https://example.test/9','https://example.test/8']);
  assert.ok(!h.tabs.has(20));
  assert.equal(h.state().entries.filter((e) => e.state==='done').length,0);
  assert.equal(h.state().entries.find((e) => e.url.endsWith('/19')).state,'pending');
});

test('réordonner les capsules change la prochaine page sans toucher les onglets ouverts', async () => {
  const h = setup(2); await h.start({ target:2 });
  for (const name of ['a','b']) await h.engine.command('enqueue',{ session:{ id:name, title:name, windows:[{ tabs:[{ url:`https://next.test/${name}` }] }] } });
  const b=h.state().capsules.at(-1).id;
  await h.engine.command('up',{ id:b });
  assert.equal(h.created.length,0); h.remove(2); await h.flush();
  assert.equal(h.created[0].url,'https://next.test/b');
});

test('interruption entre sauvegarde et fermeture : reprise sans rouvrir la page déjà présente', async () => {
  const h=setup(12); await h.start();
  const entry=h.local['bs.respiration'].entries.find((e) => e.tabId===3);
  entry.state='parking'; h.restartWorker();
  const q=await h.engine.get(); assert.equal(q.paused,false);
  assert.equal(q.entries.find((e) => e.url.endsWith('/3')).state,'open');
  await h.engine.command('resume'); assert.equal(h.created.length,0); assert.equal(h.list().length,10);
});

test('interruption après création Chrome : reprise adopte la page créée sans la dupliquer', async () => {
  const h=setup(12); await h.start();
  const entry=h.local['bs.respiration'].entries.find((e) => e.url.endsWith('/2'));
  entry.state='opening';
  h.tabs.set(900,{ id:900, windowId:1, index:0, url:entry.url, title:'Page 2' });
  h.restartWorker(); assert.equal((await h.engine.get()).paused,false);
  await h.engine.command('resume'); assert.equal(h.created.length,0);
  assert.equal(h.list().length,10);
  assert.equal(h.state().entries.find((e) => e.url.endsWith('/2')).tabId,900);
});

test('106 onglets dont 80 non vérifiables : la cible est tenue d’emblée, puis reprise stable après redémarrage', async () => {
  const h = setup(106, Object.fromEntries(Array.from({length:80},(_,i)=>[i+1,{probeFails:true}])));
  await h.start();
  assert.equal(h.list().length,10);
  assert.equal(h.state().entries.filter((e)=>e.state==='pending').length,96);
  assert.equal(h.saved.length,1);
  const originalId=h.state().id;
  h.restartBrowser(); await h.engine.get();
  await h.engine.command('resume',{windowId:1}); await h.flush();
  assert.equal(h.list().length,10);
  assert.equal(h.state().id,originalId);
  assert.equal(h.state().entries.length,106);
  h.remove(106); await h.flush();
  assert.equal(h.created.at(-1).url,'https://example.test/96');
});

test('formulaire non enregistré et page non vérifiable sont fermés comme les autres, avec sauvegarde', async () => {
  const h=setup(12,{1:{unsaved:true},2:{probeFails:true}}); await h.start();
  assert.equal(h.list().length,10);
  assert.equal(h.state().compaction.closed,2);
  assert.equal(h.state().entries[0].keepReason,undefined);
  assert.equal(h.state().entries[1].keepReason,undefined);
});

test('redémarrage avec de nouveaux ids : reprise rapproche les URL dans la fenêtre choisie', async () => {
  const h=setup(); await h.start();
  const restored=h.list().map((t)=>({...t,id:t.id+2000,windowId:2}));
  h.tabs.clear(); h.windows.delete(1); h.windows.add(2);
  for (const tab of restored) h.tabs.set(tab.id,tab);
  h.restartBrowser(); const q=await h.engine.get();
  assert.equal(q.paused,true); assert.equal(q.windowId,null);
  await h.engine.command('resume',{windowId:2});
  assert.equal(h.created.length,0); assert.equal(h.list(2).length,10);
});

test('réparer après rechargement utilise la fenêtre d’origine même depuis un autre dashboard', async () => {
  const h=setup(20,Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,{probeFails:true}])));
  await h.start(); for (const t of h.tabs.values()) t.probeFails=false;
  h.windows.add(2); h.restartBrowser(); await h.engine.get();
  await h.engine.command('resume',{windowId:2});
  assert.equal(h.state().windowId,1); assert.equal(h.list(1).length,10); assert.equal(h.list(2).length,0);
});

const entryFor = (h, number) => h.state().entries.find((e) => e.url === `https://example.test/${number}`);
test('échange explicite : LRU remis en réserve, sélection active, fermeture traitée ensuite', async () => {
  const h = setup(12); await h.start({target:3});
  h.tabs.get(10).lastAccessed = 300; h.tabs.get(11).lastAccessed = 100;
  await h.engine.command('select', {id:entryFor(h,1).id}); await h.flush();
  assert.equal(h.list().length,3);
  assert.equal(entryFor(h,11).state,'pending');
  assert.equal(entryFor(h,10).state,'open');
  assert.equal(h.tabs.get(entryFor(h,1).tabId).active,true);
  assert.equal(h.state().entries.filter((e)=>e.state==='done').length,0);
  await h.engine.command('select', {id:entryFor(h,1).id});
  assert.equal(h.created.length,1, 'deux clics sur la même page ne dupliquent pas');
  h.remove(entryFor(h,1).tabId); await h.flush();
  assert.equal(entryFor(h,1).state,'done');
  assert.equal(entryFor(h,11).state,'open');
  assert.equal(h.list().length,3);
  assert.equal(h.created.at(-1).active,false, 'le retour automatique reste en arrière-plan');
});
test('échanges répétés et pause : budget maintenu, anciennes pages toujours accessibles', async () => {
  const h=setup(12); await h.start({target:3}); await h.engine.command('pause');
  for (const n of [1,2,3,4,5,1,12]) {
    await h.engine.command('select',{id:entryFor(h,n).id}); await h.flush();
    assert.equal(h.list().length,3); assert.equal(h.state().paused,true);
    assert.equal(h.tabs.get(entryFor(h,n).tabId).active,true);
  }
  assert.equal(h.state().entries.filter((e)=>e.state==='done').length,0);
  h.remove(entryFor(h,12).tabId); await h.flush(); assert.equal(h.list().length,2);
  await h.engine.command('select',{id:entryFor(h,12).id});
  assert.equal(h.list().length,3); assert.equal(entryFor(h,12).state,'open');
});
test('échange : lecture protégée en plus du budget, puis tick conserve la sélection', async () => {
  const h=setup(12,{1:{playing:true}}); await h.start({target:3});
  await h.engine.command('select',{id:entryFor(h,2).id}); await h.flush();
  assert.equal(h.list().length,4); assert.equal(entryFor(h,1).state,'open');
  assert.equal(entryFor(h,10).state,'pending');
  await h.engine.tick(); assert.equal(entryFor(h,2).state,'open');
  h.tabs.get(1).playing=false; await h.engine.tick();
  assert.equal(h.list().length,3); assert.equal(entryFor(h,2).state,'open');
});
test('échange cible 1 et échec de création : aucune fermeture prématurée', async () => {
  const h=setup(3); await h.start({target:1});
  await h.engine.command('select',{id:entryFor(h,1).id}); await h.flush();
  assert.equal(h.list().length,1); assert.equal(entryFor(h,3).state,'pending');
  h.failCreate(); const before=h.removed.length;
  await assert.rejects(h.engine.command('select',{id:entryFor(h,2).id}),/Ouverture impossible/);
  assert.equal(h.removed.length,before); assert.equal(entryFor(h,2).state,'pending');
  assert.equal(entryFor(h,1).state,'open'); assert.equal(h.state().paused,false);
});
test('échange : écriture impossible, fermetures refusées et fenêtre perdue', async () => {
  const h=setup(12); await h.start();
  h.failWrite(); await assert.rejects(h.engine.command('select',{id:entryFor(h,1).id}),/storage full/);
  assert.equal(h.created.length,0); assert.equal(h.list().length,10);
  const other=setup(3); await other.start({target:1}); other.tabs.get(3).refuseClose=true;
  await assert.rejects(other.engine.command('select',{id:entryFor(other,1).id}),/Échange annulé/);
  await other.flush(); assert.equal(other.list().length,1);
  assert.equal(entryFor(other,1).state,'pending'); assert.equal(other.state().paused,true);
  other.windows.delete(1);
  await assert.rejects(other.engine.command('select',{id:entryFor(other,1).id}),/fenêtre.*fermée/);
});
test('⌘⌥W : onglet actif part « à revenir » (jamais traité) et la page suivante arrive', async () => {
  const h = setup(); await h.start();
  const res = await h.engine.command('closeActive'); await h.flush();
  assert.match(res.message, /À revenir/);
  assert.equal(entryFor(h,100).state,'pending');          // fermé… à revenir
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 0); // jamais traité
  assert.equal(h.list().length,10);                        // budget tenu
  assert.equal(h.created.at(-1).url,'https://example.test/90'); // rappel de la suivante, pas de la fermée
  assert.equal(entryFor(h,90).state,'open');
  assert.equal(entryFor(h,100).state,'pending');           // la fermée reste en réserve
});
test('⌘⌥W en lecture : aucune fermeture, la lecture est conservée', async () => {
  const h = setup(100, { 100: { playing: true } }); await h.start();
  const res = await h.engine.command('closeActive'); await h.flush();
  assert.match(res.message, /lecture/i);
  assert.ok(h.tabs.has(100));                              // l'onglet est toujours là
  assert.equal(entryFor(h,100).state,'open');
  assert.equal(entryFor(h,100).keepReason,'media');
  assert.equal(h.created.length,0);
});
test('⌘⌥W en pause : rangé en réserve sans remplissage, reprise complète', async () => {
  const h = setup(); await h.start(); await h.engine.command('pause');
  const res = await h.engine.command('closeActive'); await h.flush();
  assert.match(res.message, /À revenir/);
  assert.equal(entryFor(h,100).state,'pending');
  assert.equal(h.list().length,9);                         // pas de rappel en pause
  await h.engine.command('resume'); await h.flush();
  assert.equal(h.list().length,10);
  assert.equal(entryFor(h,90).state,'open');
});

test('à revenir : la page passe après les autres capsules, sans revenir immédiatement', async () => {
  const h = setup(5, { 4: { groupId: 2 }, 5: { groupId: 2 } });
  await h.start({ target: 2 }); // 4 et 5 ouverts ; toute la réserve est dans un autre lot
  await h.engine.command('closeActive', { tabId: 5 }); await h.flush();
  assert.equal(entryFor(h,5).state, 'pending');
  assert.equal(h.created.at(-1).url, 'https://example.test/3');
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 0);
  h.remove(4); await h.flush();
  assert.equal(h.created.at(-1).url, 'https://example.test/2');
});

test('à revenir sans réserve : aucune réouverture immédiate ; dernier onglet conservé', async () => {
  const h = setup(2); await h.start({ target: 2 });
  await h.engine.command('closeActive', { tabId: 2 }); await h.flush();
  assert.equal(h.list().length, 1); assert.equal(h.created.length, 0);
  assert.equal(entryFor(h,2).state, 'pending');
  const last = setup(1); await last.start({ target: 1 });
  const result = await last.engine.command('closeActive', { tabId: 1 });
  assert.match(result.message, /dernier onglet/); assert.equal(last.list().length, 1);
});

test('à revenir : un id capturé ne ferme jamais un autre onglet après changement de focus', async () => {
  const h = setup(12); await h.start();
  h.tabs.get(12).active = false; h.tabs.get(11).active = true;
  const before = h.removed.length;
  await h.engine.command('closeActive', { tabId: 12 });
  await h.engine.command('closeActive', { tabId: 999 });
  await h.engine.command('closeActive', { tabId: 11, url: 'https://example.test/old-url' });
  assert.equal(h.removed.length, before); assert.equal(h.created.length, 0);
  h.tabs.get(11).windowId = 2;
  await h.engine.command('closeActive', { tabId: 11 });
  assert.equal(h.removed.length, before);
});

test('à revenir : cible 1 ouvre avant fermeture ; échec d’ouverture ou de stockage conserve la page', async () => {
  const h = setup(3); await h.start({ target: 1 });
  h.failCreate(); const before = h.removed.length;
  await assert.rejects(h.engine.command('closeActive', { tabId: 3 }), /Ouverture impossible/);
  assert.equal(h.removed.length, before); assert.ok(h.tabs.has(3));
  assert.equal(entryFor(h,2).state, 'pending'); assert.equal(h.state().paused, false);
  const full = setup(3); await full.start({ target: 1 }); full.failWrite();
  await assert.rejects(full.engine.command('closeActive', { tabId: 3 }), /storage full/);
  assert.ok(full.tabs.has(3)); assert.equal(full.created.length, 0);
});

test('à revenir : fermeture refusée annule l’arrivée, sans aucune page traitée', async () => {
  const h = setup(3); await h.start({ target: 1 }); h.tabs.get(3).refuseClose = true;
  const result = await h.engine.command('closeActive', { tabId: 3 }); await h.flush();
  assert.match(result.message, /refusé/); assert.ok(h.tabs.has(3));
  assert.equal(h.list().length, 1); assert.equal(entryFor(h,2).state, 'pending');
  assert.equal(h.state().entries.filter((e) => e.state === 'done').length, 0);
});

test('à revenir : une page manuelle est sauvegardée et mise en réserve avant le tick', async () => {
  const h = setup(3); await h.start({ target: 2 });
  for (const t of h.tabs.values()) t.active = false;
  h.tabs.set(900, { id: 900, windowId: 1, index: 2, active: true, url: 'https://manual.test/', title: 'Manuelle' });
  await h.engine.command('closeActive', { tabId: 900 }); await h.flush();
  assert.equal(h.state().entries.find((e) => e.url === 'https://manual.test/').state, 'pending');
  assert.ok(h.saved.some((s) => s.entries.some((e) => e.url === 'https://manual.test/')));
  assert.equal(h.list().length, 2); assert.equal(h.created.length, 0, 'ne pas remplir au-delà de la cible');
});

test('à revenir : une page de réserve déjà rouverte est adoptée sans doublon', async () => {
  const h = setup(4); await h.start({ target: 2 });
  h.tabs.set(900, { id: 900, windowId: 1, index: 2, active: false, url: 'https://example.test/2', title: 'Page 2' });
  await h.engine.command('closeActive', { tabId: 4 }); await h.flush();
  assert.equal(entryFor(h,2).tabId, 900); assert.equal(entryFor(h,2).state, 'open');
  assert.equal(h.list().length, 2); assert.equal(h.created.length, 0);
});
