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
    autoDiscardable: true, discarded: false, groupId: -1, status: 'complete', ...(overrides[i + 1] || {}),
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
    } },
    tabGroups: { query: async () => [{ id: 1, title: 'Projet A', color: 'blue' }, { id: 2, title: 'Projet B', color: 'red' }] },
    scripting: { executeScript: async ({ target }) => {
      const t = tabs.get(target.tabId); if (t.probeFails) throw Error('restricted');
      return [{ result: t.playing ? 'media' : null }];
    } },
    tabs: {
      get: async (id) => { if (!tabs.has(id)) throw Error('tab gone'); return copy(tabs.get(id)); },
      remove: async (id) => {
        const t = tabs.get(id); if (!t) throw Error('tab gone');
        const state = local['bs.respiration'];
        // Production must already hold this URL in durable pending storage.
        assert.ok(state?.entries.some((e) => e.url === t.url && e.state === 'parking'));
        removed.push(id); remove(id);
      },
      create: async (data) => {
        if (failCreate || !windows.has(data.windowId)) throw Error('create failed');
        assert.equal(data.active, false, 'refill must not steal focus');
        assert.ok(local['bs.respiration'].entries.some((e) => e.url === data.url && e.state === 'opening'));
        const index = data.index ?? list(data.windowId).length;
        list(data.windowId).filter((t) => t.index >= index).forEach((t) => { t.index++; });
        const t = { id: nextId++, ...data, title: data.url, status: 'complete', pinned: false, groupId: -1, autoDiscardable: true };
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

test('rechargement extension : pause et conservation de la fenêtre avec les mêmes ids', async () => {
  const h = setup(); await h.start(); h.restartBrowser();
  const q = await h.engine.get(); assert.equal(q.paused, true); assert.equal(q.windowId, 1);
  assert.equal(h.created.length, 0);
  await h.engine.command('resume', { windowId: 1 }); assert.equal(h.list().length, 10); assert.equal(h.created.length, 0);
  h.remove(100); await h.flush(); assert.equal(h.created[0].url, 'https://example.test/90');
});

test('réveil du service worker : la tournée et les ids sont conservés', async () => {
  const h = setup(); await h.start(); h.restartWorker();
  assert.equal((await h.engine.get()).paused, false);
  h.remove(100); await h.flush(); assert.equal(h.created[0].url, 'https://example.test/90');
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

test('une page ouverte manuellement au-delà de la cible est sauvegardée et intègre les N derniers ; la plus ancienne sort', async () => {
  const h = setup(); await h.start();
  h.tabs.set(900, { id:900, index:10, windowId:1, url:'https://manual.test/', title:'Manuelle' });
  await h.engine.updated({ id:900, windowId:1, url:'https://manual.test/' });
  assert.ok(h.tabs.has(900), 'la page manuelle est l’un des 10 derniers onglets');
  assert.ok(!h.tabs.has(91), 'l’onglet le plus ancien des 10 est sorti');
  assert.equal(h.saved.length, 2, 'capsule dédiée aux pages ajoutées');
  assert.equal(h.state().entries.find((e) => e.url === 'https://manual.test/').state, 'open');
  assert.equal(h.state().entries.find((e) => e.url.endsWith('/91')).state, 'pending');
  assert.equal(h.list().length, 10);
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
  const q=await h.engine.get(); assert.equal(q.paused,true);
  assert.equal(q.entries.find((e) => e.url.endsWith('/3')).state,'open');
  await h.engine.command('resume'); assert.equal(h.created.length,0); assert.equal(h.list().length,10);
});

test('interruption après création Chrome : reprise adopte la page créée sans la dupliquer', async () => {
  const h=setup(12); await h.start();
  const entry=h.local['bs.respiration'].entries.find((e) => e.url.endsWith('/2'));
  entry.state='opening';
  h.tabs.set(900,{ id:900, windowId:1, index:0, url:entry.url, title:'Page 2' });
  h.restartWorker(); assert.equal((await h.engine.get()).paused,true);
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
