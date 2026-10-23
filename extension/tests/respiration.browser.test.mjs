// Intégration Respiration dans Chrome for Testing : profil jetable et pages locales.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
const EXTENSION = fileURLToPath(new URL("..", import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = ["/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"];
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  try {
    const versions = (await readdir(cache)).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const version of versions) for (const platform of ["chrome-mac-arm64", "chrome-mac"]) {
      candidates.push(join(cache, version, platform, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"));
    }
  } catch { /* CHROME_BIN reste la seule source */ }
  for (const path of candidates) {
    try { await access(path); return path; } catch { /* suivant */ }
  }
  return null;
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      const call = this.pending.get(data.id);
      if (!call) return;
      this.pending.delete(data.id);
      clearTimeout(call.timer);
      if (data.error) call.reject(new Error(JSON.stringify(data.error)));
      else call.resolve(data.result);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CDP(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}${params.expression ? ` — ${params.expression.slice(0,180)}` : ''}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

const chrome = await findChrome();

test('Respiration : intégration Chrome, interface et événements réels', { timeout: 180000, skip: chrome ? false : 'Chrome for Testing introuvable' }, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'pk-respiration-'));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const content = req.url === '/frame' ? '<p>Contenu intégré sans saisie</p>'
      : req.url === '/frame-dirty' ? '<textarea id="draft"></textarea><script>document.getElementById("draft").value="Brouillon non enregistré"</script>'
      : req.url === '/dirty' ? '<iframe src="/frame-dirty"></iframe>'
      : req.url === '/editor' ? '<div contenteditable="true">Texte à conserver</div>'
      : req.url === '/media' ? '<canvas id="c" width="8" height="8"></canvas><video id="v" autoplay muted playsinline></video><script>const v=document.getElementById("v");v.srcObject=document.getElementById("c").captureStream(10);v.play();</script>'
      : '<iframe src="/frame"></iframe><div contenteditable="true"></div><select><option>Premier choix</option><option>Autre</option></select><input type="hidden" id="csrf"><script>document.getElementById("csrf").value="dynamic-token"</script>';
    res.end(`<!doctype html><html lang="fr"><title>Lecture ${req.url.slice(1)}</title><body><h1>Page de lecture ${req.url.slice(1)}</h1>${content}</body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const manifest = JSON.parse(await readFile(join(EXTENSION, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version_name, manifest.version, 'version manifest cohérente');
  let child, cdp;
  const errors = [];
  try {
    child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync',
      '--autoplay-policy=no-user-gesture-required', '--disable-background-networking', `--user-data-dir=${profile}`, `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`, '--remote-debugging-port=0', '--window-size=1440,1000', 'about:blank'], { stdio:'ignore' });
    let port;
    for (let i=0;i<150;i++) {
      assert.equal(child.exitCode,null);
      try { port = Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); } catch {}
      if (port) break; await pause(100);
    }
    assert.ok(port);
    const info = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    cdp = await CDP.connect(info.webSocketDebuggerUrl);
    cdp.socket.addEventListener('message', (raw) => {
      const event = JSON.parse(raw.data);
      if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    });
    // Plus de clé dans le manifest (l'ID local est dérivé du dossier, distinct
    // du store) : réveiller le service worker — un onglet de plus déclenche
    // tabs.onCreated dans sw.js — puis lire l'ID dans sa cible. Le filtre sur
    // sw.js écarte les extensions internes de Chrome (thunk.js).
    await cdp.send('Target.createTarget', { url: 'about:blank' });
    let id = '';
    for (let i = 0; i < 150 && !id; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      const sw = targetInfos.find((t) => t.type === 'service_worker' && /\/sw\.js$/.test(t.url));
      if (sw) id = sw.url.slice('chrome-extension://'.length).split('/')[0];
      else await pause(100);
    }
    assert.match(id, /^[a-p]{32}$/, "ID de l'extension introuvable dans les cibles Chrome");
    const { targetId } = await cdp.send('Target.createTarget', { url:`chrome-extension://${id}/index.html` });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten:true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{ width:1440,height:1000,deviceScaleFactor:1,mobile:false });
    const evaluate = async (fn, arg) => {
      const result = await send('Runtime.evaluate', { expression:`(${fn.toString()})(${JSON.stringify(arg)})`, awaitPromise:true, returnByValue:true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async (fn, arg, label = 'état attendu') => {
      for (let i=0;i<150;i++) { if (await evaluate(fn,arg)) return; await pause(100); }
      const diagnostic = await evaluate(async () => ({ toast:document.getElementById('bss-toast')?.textContent, state:((await chrome.storage.local.get('bs.respiration'))['bs.respiration'] || {}).reason }));
      throw Error(`Absent : ${label} — ${JSON.stringify(diagnostic)}`);
    };
    await until(() => !!window.BSSessions);
    await t.test('accès rapide : clic gauche sur le panneau, menu clic droit, ⌘T sur Sessions', async () => {
      await until(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick === true, null, 'clic gauche réservé au panneau');
      const worker = (await cdp.send('Target.getTargets')).targetInfos.find((target) => target.type === 'service_worker' && target.url === `chrome-extension://${id}/sw.js`);
      assert.ok(worker, 'service worker chargé');
      const workerSession = await cdp.send('Target.attachToTarget', {targetId:worker.targetId, flatten:true});
      const registered = await cdp.send('Runtime.evaluate', {
        expression:'Promise.all(["pk-open-panel", "pk-open-app", "pk-newtab-sessions"].map((id) => new Promise((resolve) => chrome.contextMenus.update(id, {}, () => resolve(chrome.runtime.lastError?.message || null)))))',
        awaitPromise:true, returnByValue:true,
      }, workerSession.sessionId);
      assert.deepEqual(registered.result.value,[null,null,null], 'menu contextuel de l’icône');
      // Badge de l'icône au démarrage : l'appel initial d'updateBadge() doit
      // survivre au démarrage du worker (régression « LIB_KEY » 2026.10.40).
      let badge = '';
      for (let i=0;i<50;i++) {
        const read = await cdp.send('Runtime.evaluate', { expression:'chrome.action.getBadgeText({})', awaitPromise:true, returnByValue:true }, workerSession.sessionId);
        badge = read.result.value;
        if (/^\d+$/.test(badge)) break;
        await pause(100);
      }
      assert.match(badge, /^\d+$/, `badge du nombre d'onglets au premier démarrage (lu : "${badge}")`);
      const quickSettings = await evaluate(async () => {
        const response = await chrome.runtime.sendMessage({type:'get'});
        return {override:chrome.runtime.getManifest().chrome_url_overrides?.newtab, setting:response.data.library.settings.newtab};
      });
      assert.equal(quickSettings.override,'index.html', 'Chrome newtab sert la page extension');
      assert.equal(quickSettings.setting,'sessions', 'nouvel onglet configuré sur Sessions');
    });
    const seeded = await evaluate(async (base) => {
      const response = await chrome.runtime.sendMessage({ type:'get' });
      const settings = { ...response.data.library.settings, dailySave:false, previews:false, rowThumbs:'favicons', autoBackup:false };
      await chrome.runtime.sendMessage({ type:'settings', payload:{ settings } });
      const win = await chrome.windows.create({ url:`${base}/1`, focused:false });
      const ids = [win.tabs[0].id];
      for (let i=2;i<=24;i++) ids.push((await chrome.tabs.create({ windowId:win.id, url:`${base}/${i}`, active:false })).id);
      await chrome.tabs.update(ids.at(-1), { active:true });
      const a = await chrome.tabs.group({ tabIds:ids.slice(0,12), createProperties:{ windowId:win.id } });
      await chrome.tabGroups.update(a,{ title:'Recherche produit', color:'blue' });
      const b = await chrome.tabs.group({ tabIds:ids.slice(12), createProperties:{ windowId:win.id } });
      await chrome.tabGroups.update(b,{ title:'À lire cette semaine', color:'green' });
      document.querySelector('.rail-tab[data-section="sessions"]').click();
      return { windowId:win.id, ids };
    }, base);
    await until(async (id) => (await chrome.tabs.query({ windowId:id })).every((tab) => tab.status === 'complete'), seeded.windowId, 'pages chargées');
    await until(() => !!document.querySelector('[data-r-action="setup"]'));
    await t.test('24 pages avec iframe, éditeur vide et select par défaut → 10 ouvertes, 14 fermées', async () => {
      await evaluate(() => document.querySelector('[data-r-action="setup"]').click());
      await until(() => !!document.querySelector('#respiration-setup'));
      await evaluate((id) => {
        document.querySelector('#respiration-setup [name="windowId"]').value=String(id);
      }, seeded.windowId);
      await evaluate(() => document.querySelector('#respiration-setup').requestSubmit());
      await until(async () => {
        const q = (await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q && !q.paused && q.entries.filter((e) => e.state === 'pending').length === 14;
      }, null, 'activation et fermeture');
      const state = await evaluate(async (id) => {
        const q = (await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        const tabs = await chrome.tabs.query({ windowId:id });
        return { urls:tabs.map((t) => Number((t.pendingUrl || t.url).split('/').at(-1))), groups:q.capsules.map((c) => c.title), active:tabs.find((t) => t.active)?.id };
      }, seeded.windowId);
      assert.deepEqual(state.urls,[15,16,17,18,19,20,21,22,23,24]);
      assert.deepEqual(state.groups,['À lire cette semaine','Recherche produit']);
      assert.equal(state.active,seeded.ids[23]);
      await until(() => {
        const open = document.querySelectorAll('#respiration-root [data-r-section="open"] .respiration-fav').length;
        const pending = document.querySelectorAll('#respiration-root [data-r-section="pending"] .respiration-fav').length;
        return open === 10 && pending === 14;
      }, null, 'grilles complètes : 10 ouvertes et 14 à revenir affichées');
      assert.ok(await evaluate(() => document.querySelector('#respiration-root .respiration-next')?.textContent.includes('Prochaine page')), 'prochaine page annoncée');
      const lots = await evaluate(() => {
        const details = document.querySelector('#respiration-root [data-r-capsules]');
        return details ? { open: details.open, text: details.querySelector('summary').textContent } : null;
      });
      assert.ok(lots && lots.open === false, 'ordre de retour replié par défaut');
      assert.match(lots.text, /Ordre de retour/);
    });
    assert.ok(await evaluate(async () => (await chrome.storage.local.get('bs.respiration'))['bs.respiration']?.paused === false), 'activation requise pour poursuivre');
    await t.test('survol : titre, URL, vraie capture locale ; clavier et absence de capture', async () => {
      // Capture d’une page de fixture réellement rendue, sans réveiller une page archivée.
      const targets = await cdp.send('Target.getTargets');
      const page = targets.targetInfos.find((target) => target.url === `${base}/15`);
      assert.ok(page);
      const attached = await cdp.send('Target.attachToTarget', { targetId:page.targetId, flatten:true });
      const screenshot = await cdp.send('Page.captureScreenshot', { format:'png' }, attached.sessionId);
      await cdp.send('Target.detachFromTarget', { sessionId:attached.sessionId });
      await evaluate(async ({base, data}) => {
        const stored = await chrome.storage.local.get(['bs.sessions.library', 'settings']);
        stored['bs.sessions.library'].settings.previews = true;
        await chrome.storage.local.set({
          'bs.sessions.library':stored['bs.sessions.library'],
          settings:{ ...stored.settings, thumbsMode:'favicons' },
          'bs.sessions.previews':{ [`${base}/15`]:{src:`data:image/png;base64,${data}`, at:Date.now()} },
        });
      }, {base, data:screenshot.data});
      await pause(600);
      const point = await evaluate((url) => {
        const button = [...document.querySelectorAll('.respiration-fav')].find((el) => el.dataset.url === url);
        button.scrollIntoView({block:'center'});
        const rect = button.getBoundingClientRect();
        return {x:rect.x + rect.width/2, y:rect.y + rect.height/2};
      }, `${base}/15`);
      await pause(100); // laisser le scrollIntoView émettre son événement avant le survol
      await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...point});
      await until(() => document.querySelector('#session-icon-preview:popover-open .session-icon-shot img')?.naturalWidth > 0, null, 'vignette locale au survol');
      await evaluate(async (url) => {
        window.hoverAnchorBeforeRefresh = [...document.querySelectorAll('.respiration-fav')].find((el) => el.dataset.url === url);
        const {data} = await chrome.runtime.sendMessage({type:'get'});
        const settings = {...data.library.settings, dailyHour:(data.library.settings.dailyHour + 1) % 24};
        await chrome.runtime.sendMessage({type:'settings', payload:{settings}});
      }, `${base}/15`);
      await until(() => !window.hoverAnchorBeforeRefresh.isConnected, null, 'rafraîchissement de la grille');
      await until(() => document.querySelector('#session-icon-preview:popover-open .session-icon-shot img')?.naturalWidth > 0, null, 'aperçu conservé après rafraîchissement');
      const details = await evaluate(() => {
        const card = document.getElementById('session-icon-preview');
        const rect = card.getBoundingClientRect();
        return {title:card.querySelector('strong').textContent, url:card.querySelector('.session-icon-caption > span').textContent,
          x:rect.x, right:rect.right, bottom:rect.bottom, width:innerWidth, height:innerHeight};
      });
      assert.equal(details.title, 'Lecture 15');
      assert.equal(details.url, `${base}/15`);
      assert.ok(details.x >= 0 && details.right <= details.width && details.bottom <= details.height);
      if (process.env.RESPIRATION_SHOTS) {
        await mkdir(process.env.RESPIRATION_SHOTS, {recursive:true});
        const {data} = await send('Page.captureScreenshot', {format:'png', fromSurface:true});
        await writeFile(join(process.env.RESPIRATION_SHOTS, 'respiration-hover.png'), Buffer.from(data,'base64'));
      }
      // La carte reste visible lorsqu’on passe de l’icône à son aperçu.
      const cardPoint = await evaluate(() => {
        const rect = document.getElementById('session-icon-preview').getBoundingClientRect();
        return {x:rect.x + 20, y:rect.y + 20};
      });
      await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...cardPoint});
      await pause(220);
      assert.equal(await evaluate(() => document.getElementById('session-icon-preview').matches(':popover-open')), true);
      await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:2, y:2});
      await until(() => !document.getElementById('session-icon-preview').matches(':popover-open'));
      await evaluate((url) => [...document.querySelectorAll('.respiration-fav')].find((el) => el.dataset.url === url).focus(), `${base}/14`);
      await until(() => document.querySelector('#session-icon-preview:popover-open .session-icon-shot')?.textContent.includes('indisponible'), null, 'absence de capture explicite');
      assert.equal(await evaluate(() => document.querySelector('#session-icon-preview .session-icon-caption > span').textContent), `${base}/14`);
      assert.equal(await evaluate(() => document.activeElement.getAttribute('aria-describedby')), 'session-icon-preview');
      await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape'});
      await until(() => !document.getElementById('session-icon-preview').matches(':popover-open'));
      assert.equal(await evaluate(() => document.activeElement.hasAttribute('aria-describedby')), false);
      assert.equal(await evaluate(async (id) => (await chrome.tabs.query({windowId:id})).length, seeded.windowId), 10, 'le survol ne rouvre aucun onglet');
      await evaluate(() => document.activeElement.blur());
    });
    await t.test('fermer 24 ramène 14 en arrière-plan, puis une rafale ramène 13 et 12', async () => {
      await evaluate((id) => chrome.tabs.remove(id),seeded.ids[23]);
      await until(async (id) => (await chrome.tabs.query({ windowId:id })).length===10,seeded.windowId);
      let result = await evaluate(async (id) => {
        const tabs=await chrome.tabs.query({ windowId:id }); return { urls:tabs.map((t) => Number((t.pendingUrl || t.url).split('/').at(-1))), active:tabs.find((t) => t.active)?.url };
      },seeded.windowId);
      assert.deepEqual(result.urls,[14,15,16,17,18,19,20,21,22,23]);
      assert.ok(!result.active.endsWith('/14'));
      await evaluate((ids) => chrome.tabs.remove(ids),seeded.ids.slice(21,23));
      await until(async (id) => (await chrome.tabs.query({ windowId:id })).length===10,seeded.windowId);
      result=await evaluate(async (id) => (await chrome.tabs.query({ windowId:id })).map((t) => Number((t.pendingUrl || t.url).split('/').at(-1))),seeded.windowId);
      assert.deepEqual(result,[12,13,14,15,16,17,18,19,20,21]);
    });
    await t.test('pause et reprise depuis l’interface',async () => {
      await until(() => !!document.querySelector('[data-r-action="pause"]'));
      await evaluate(() => document.querySelector('[data-r-action="pause"]').click());
      await until(async () => (await chrome.storage.local.get('bs.respiration'))['bs.respiration'].paused);
      await evaluate((id) => chrome.tabs.remove(id),seeded.ids[20]); await pause(500);
      assert.equal(await evaluate(async (id) => (await chrome.tabs.query({ windowId:id })).length,seeded.windowId),9);
      await until(() => !!document.querySelector('[data-r-action="resume"]'));
      await evaluate(() => document.querySelector('[data-r-action="resume"]').click());
      await until(async (id) => (await chrome.tabs.query({ windowId:id })).length===10,seeded.windowId);
      await until(() => !!document.querySelector('[data-r-action="pause"]'));
      const shotDir=process.env.RESPIRATION_SHOTS;
      if (shotDir) {
        await until(() => document.getElementById('bss-toast')?.style.display === 'none');
        await mkdir(shotDir,{ recursive:true });
        const { data }=await send('Page.captureScreenshot',{ format:'png', fromSurface:true });
        await writeFile(join(shotDir,'respiration-desktop.png'),Buffer.from(data,'base64'));
      }
      const layout=await evaluate(() => ({ width:document.documentElement.scrollWidth, viewport:innerWidth }));
      assert.ok(layout.width <= layout.viewport,'pas de débordement horizontal');
      await send('Emulation.setDeviceMetricsOverride',{ width:390,height:844,deviceScaleFactor:1,mobile:false });
      assert.equal(await evaluate(() => document.getElementById('respiration-root').scrollWidth <= document.getElementById('respiration-root').clientWidth),true);
      if (shotDir) {
        const { data }=await send('Page.captureScreenshot',{ format:'png',fromSurface:true });
        await writeFile(join(shotDir,'respiration-mobile.png'),Buffer.from(data,'base64'));
      }
      await send('Emulation.setDeviceMetricsOverride',{ width:1440,height:1000,deviceScaleFactor:1,mobile:false });
    });
    await t.test('capsules : recherche et pages traitées retrouvables',async () => {
      await evaluate(() => document.querySelector('[data-r-action="view"]').click());
      await until(() => !!document.querySelector('#respiration-search'));
      const count=await evaluate(() => {
        const input=document.querySelector('#respiration-search'); input.value='Lecture 24'; input.dispatchEvent(new Event('input'));
        return { count:document.querySelectorAll('.respiration-page').length, text:document.querySelector('.respiration-page')?.textContent };
      });
      assert.equal(count.count,1); assert.match(count.text,/Fermée par vous/);
      await evaluate(() => document.querySelector('#bss-dialog').close());
    });
    await t.test('fermeture réelle de la fenêtre : aucun onglet ne ressurgit',async () => {
      await evaluate((id) => chrome.windows.remove(id),seeded.windowId);
      await until(async () => (await chrome.storage.local.get('bs.respiration'))['bs.respiration'].windowId === null);
      await pause(400);
      const result=await evaluate(async (base) => ({
        web:(await chrome.tabs.query({})).filter((t) => t.url?.startsWith(base)).length,
        q:(await chrome.storage.local.get('bs.respiration'))['bs.respiration'],
      }),base);
      assert.equal(result.web,0); assert.equal(result.q.paused,true);
      assert.equal(result.q.entries.filter((e) => e.state==='done').length,4);
      assert.equal(result.q.entries.filter((e) => e.state==='pending').length,20);
    });
    await t.test('SQLite : sauvegarde réelle et récupération de la progression', async () => {
      const result = await evaluate(async () => {
        const dir = await navigator.storage.getDirectory();
        const handle = await dir.getFileHandle('respiration-test.sqlite', { create:true });
        const db = await new Promise((resolve,reject) => {
          const r = indexedDB.open('pk-web-memory-file-handles',1);
          r.onupgradeneeded = () => r.result.createObjectStore('handles');
          r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
        await new Promise((resolve,reject) => {
          const transaction = db.transaction('handles','readwrite');
          transaction.objectStore('handles').put(handle,'main-database');
          transaction.oncomplete=resolve; transaction.onerror=() => reject(transaction.error);
        });
        db.close();
        const first = await chrome.runtime.sendMessage({ type:'database-backup' });
        const file = await handle.getFile();
        const header = await file.slice(0,15).text();
        const before = (await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        await chrome.storage.local.remove('bs.respiration');
        const restored = await chrome.runtime.sendMessage({ type:'database-backup' });
        const after = (await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return { first,restored,header,size:file.size,before,after };
      });
      assert.equal(result.first.ok,true,JSON.stringify(result.first));
      assert.equal(result.restored.ok,true,JSON.stringify(result.restored));
      assert.equal(result.header,'SQLite format 3'); assert.ok(result.size > 1000);
      assert.equal(result.after.paused,true); assert.equal(result.after.windowId,null);
      assert.equal(result.after.id,result.before.id);
      assert.deepEqual(result.after.entries,result.before.entries);
    });
    await t.test('brouillon iframe et éditeur rempli fermés ; seule la lecture en cours survit', async () => {
      const response = await evaluate(async (base) => {
        await chrome.runtime.sendMessage({type:'respiration-stop'});
        const win = await chrome.windows.create({url:`${base}/media`,focused:false});
        for (const path of ['dirty','3','editor','5','6']) await chrome.tabs.create({windowId:win.id,url:`${base}/${path}`,active:false});
        const tabs=await chrome.tabs.query({windowId:win.id});
        await chrome.tabs.update(tabs.at(-1).id,{active:true});
        return win.id;
      },base);
      await until(async (id)=>{ // un flux vidéo live ne passe jamais à "complete"
        const tabs=await chrome.tabs.query({windowId:id});
        return tabs.every((tab)=>tab.url.endsWith('/media')||tab.status==='complete');
      },response,'pages chargées');
      await pause(500);
      const result=await evaluate(async (id)=>{
        const r=await chrome.runtime.sendMessage({type:'respiration-start',payload:{windowId:id,target:2}});
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        const tabs=await chrome.tabs.query({windowId:id});
        return {r,q,count:tabs.length,urls:tabs.map((t)=>t.url.split('/').at(-1)).sort()};
      },response);
      assert.equal(result.r.ok,true,JSON.stringify(result.r));
      assert.deepEqual(result.urls,['5','6','media']);
      assert.equal(result.q.entries.find((e)=>e.url.endsWith('/dirty')).state,'pending');
      assert.equal(result.q.entries.find((e)=>e.url.endsWith('/editor')).state,'pending');
      assert.equal(result.q.entries.find((e)=>e.url.endsWith('/media')).state,'open');
      assert.equal(result.q.entries.find((e)=>e.url.endsWith('/media')).keepReason,'media');
      await until(()=>document.querySelector('#respiration-root').textContent.includes('lecture(s) en cours'));
      await evaluate(() => document.querySelector('#respiration-root [data-r-action="view"]').click());
      await until(()=>!!document.querySelector('#respiration-pages ul'));
      const rows=await evaluate(()=>[...document.querySelectorAll('.respiration-page')].map((li)=>[li.dataset.state,li.textContent.includes('Lecture en cours')]));
      assert.ok(rows.some(([state,playing])=>state==='open'&&playing),'la vidéo ouverte est signalée en lecture');
      assert.ok(rows.some(([state])=>state==='pending'),'les brouillons fermés restent retrouvables');
      if (process.env.RESPIRATION_SHOTS) {
        await until(() => document.getElementById('bss-toast')?.style.display === 'none');
        const { data }=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
        await writeFile(join(process.env.RESPIRATION_SHOTS,'respiration-pages.png'),Buffer.from(data,'base64'));
      }
      await evaluate(() => document.querySelector('#bss-dialog').close());
    });
    await t.test('roulement via grille, panneau latéral et ⌘W : LRU, focus, budget et recherche', async () => {
      const winId = await evaluate(async (base) => {
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        await chrome.runtime.sendMessage({type:'respiration-stop'});
        if (q.windowId) await chrome.windows.remove(q.windowId);
        const win=await chrome.windows.create({url:`${base}/roll-1`,focused:false});
        for(let n=2;n<=6;n++) await chrome.tabs.create({windowId:win.id,url:`${base}/roll-${n}`,active:false});
        return win.id;
      },base);
      await until(async (id)=>(await chrome.tabs.query({windowId:id})).every((t)=>t.status==='complete'),winId);
      const started=await evaluate((windowId)=>chrome.runtime.sendMessage({type:'respiration-start',payload:{windowId,target:3}}),winId);
      assert.equal(started.ok,true);
      for (const n of [5,4,6]) {
        await evaluate(async ({winId,n})=>{
          const tabs=await chrome.tabs.query({windowId:winId});
          await chrome.tabs.update(tabs.find((t)=>t.url.endsWith(`/roll-${n}`)).id,{active:true});
        },{winId,n});
        await pause(30);
      }
      await until((url)=>[...document.querySelectorAll('.respiration-fav')].some((el)=>el.dataset.url===url),`${base}/roll-1`);
      await evaluate((url)=>[...document.querySelectorAll('.respiration-fav')].find((el)=>el.dataset.url===url).click(),`${base}/roll-1`);
      await until(async ()=>{
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q.entries.find((e)=>e.url.endsWith('/roll-5'))?.state==='pending' && q.entries.find((e)=>e.url.endsWith('/roll-1'))?.state==='open';
      },null,'la page 5, moins récemment consultée, retourne en réserve');
      const inspect=async ()=>evaluate(async (windowId)=>{
        const tabs=await chrome.tabs.query({windowId});
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return {count:tabs.filter((t)=>/^http/.test(t.url||t.pendingUrl||'')).length,active:tabs.find((t)=>t.active)?.url,q};
      },winId);
      await until(async (windowId)=>(await chrome.tabs.query({windowId,active:true}))[0]?.url?.endsWith('/roll-1'),winId,'page choisie activée');
      let state=await inspect(); assert.equal(state.count,3); assert.ok(state.active.endsWith('/roll-1'));
      assert.equal(state.q.entries.filter((e)=>e.state==='done').length,0);
      // Vérifier le vrai bouton d’ouverture avec un geste utilisateur CDP.
      await send('Runtime.evaluate',{expression:`document.querySelector('[data-r-action="sidebar"]').click()`,userGesture:true});
      await pause(400);
      const panelTargets=await cdp.send('Target.getTargets');
      const nativePanel=panelTargets.targetInfos.find((target)=>target.url===`chrome-extension://${id}/sidepanel.html`);
      // Certains Chrome headless n’exposent pas le cadre natif : le contenu reste testable.
      const panel=nativePanel || await cdp.send('Target.createTarget',{url:`chrome-extension://${id}/sidepanel.html`});
      t.diagnostic(nativePanel ? 'Panneau latéral natif ouvert par le bouton Sessions.' : 'Contenu du panneau vérifié en onglet d’extension (cadre natif indisponible en headless).');
      const attached=await cdp.send('Target.attachToTarget',{targetId:panel.targetId,flatten:true});
      const panelSend=(method,params)=>cdp.send(method,params,attached.sessionId);
      await panelSend('Runtime.enable'); await panelSend('Page.enable');
      await panelSend('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
      const panelEval=async (fn,arg)=>{
        const result=await panelSend('Runtime.evaluate',{expression:`(${fn.toString()})(${JSON.stringify(arg)})`,awaitPromise:true,returnByValue:true});
        if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      const panelUntil=async (fn,arg,label)=>{
        for(let i=0;i<100;i++) {if(await panelEval(fn,arg)) return; await pause(100);}
        throw Error(`${label} : ${await panelEval(()=>document.getElementById('panel-message')?.textContent)}`);
      };
      await panelUntil(()=>document.querySelectorAll('[data-entry]').length===6,null,'pages de la réserve visibles');
      await panelEval(()=>{
        const input=document.getElementById('panel-search'); input.value='Lecture roll-5'; input.dispatchEvent(new Event('input'));
      });
      assert.equal(await panelEval(()=>document.querySelectorAll('[data-entry]').length),1);
      await panelEval(()=>document.querySelector('[data-entry]').click());
      await panelUntil(()=>!document.querySelector('[data-entry]')?.disabled && document.querySelector('[data-entry]')?.getAttribute('aria-current')==='page',null,'échange depuis le panneau');
      state=await inspect(); assert.equal(state.count,3); assert.ok(state.active.endsWith('/roll-5'));
      assert.equal(state.q.entries.find((e)=>e.url.endsWith('/roll-4')).state,'pending');
      assert.equal(state.q.entries.filter((e)=>e.state==='done').length,0);
      // Simule la fermeture native de l’onglet actif, comme ⌘W.
      await evaluate(async (windowId)=>{
        const tabs=await chrome.tabs.query({windowId}); await chrome.tabs.remove(tabs.find((t)=>t.active).id);
      },winId);
      await until(async ()=>{
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q.entries.find((e)=>e.url.endsWith('/roll-5'))?.state==='done' && q.entries.find((e)=>e.url.endsWith('/roll-4'))?.state==='open';
      },null,'⌘W traite la sélection et rappelle la réserve');
      state=await inspect(); assert.equal(state.count,3); assert.ok(!state.active.endsWith('/roll-4'));
      await panelEval(()=>{const input=document.getElementById('panel-search');input.value='';input.dispatchEvent(new Event('input'));});
      await panelUntil(()=>document.querySelector('[data-state="done"]'),null,'état traité synchronisé');
      assert.equal(await panelEval(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.RESPIRATION_SHOTS) {
        const {data}=await panelSend('Page.captureScreenshot',{format:'png',fromSurface:true});
        await writeFile(join(process.env.RESPIRATION_SHOTS,'respiration-sidebar.png'),Buffer.from(data,'base64'));
      }
      await panelEval(()=>document.querySelector('[data-view="resources"]').click());
      await panelUntil(()=>!!document.querySelector('#resources-root .mem-list'),null,'moniteur de ressources conservé');
      await panelEval(()=>document.querySelector('[data-view="respiration"]').click());
      assert.equal(await panelEval(()=>document.getElementById('panel-resources').hidden),true);
      await panelEval(()=>document.getElementById('panel-pause').click());
      await panelUntil(()=>document.getElementById('panel-pause').dataset.paused==='true',null,'pause depuis le panneau');
      // Mosaïque du panneau : le segmented change le panneau (liste ↔ favicons),
      // pas le rail de page. Le rail reste piloté par sa case des Réglages.
      assert.equal(await panelEval(async()=>(await chrome.storage.local.get('settings')).settings?.railOn===true),false,'rail désactivé par défaut');
      assert.equal(await evaluate(()=>!!document.getElementById('setting-rail-on')),true,'case rail dans les réglages');
      assert.equal(await panelEval(async()=>(await chrome.storage.local.get('settings')).settings?.panelView==='fav'),false,'panneau en liste par défaut');
      await panelEval(()=>document.getElementById('panel-mode-fav').click());
      await panelUntil(()=>document.querySelectorAll('#panel-pages .panel-fav').length>0,null,'mosaïque de favicons dans le panneau');
      assert.equal(await panelEval(async()=>(await chrome.storage.local.get('settings')).settings?.panelView),'fav');
      await panelEval(()=>document.getElementById('panel-mode-list').click());
      await panelUntil(()=>document.querySelectorAll('#panel-pages .panel-page').length>0,null,'liste détaillée dans le panneau');
      await panelEval(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,railOn:true}});});
      assert.equal(await panelEval(async()=>(await chrome.storage.local.get('settings')).settings?.railOn),true);
      const pageTargets=await cdp.send('Target.getTargets');
      const railPage=pageTargets.targetInfos.find((t)=>/^http/.test(t.url)&&t.url.includes('/roll-'));
      assert.ok(railPage,'page locale de la tournée ouverte');
      const railAttached=await cdp.send('Target.attachToTarget',{targetId:railPage.targetId,flatten:true});
      const railSend=(method,params)=>cdp.send(method,params,railAttached.sessionId);
      await railSend('Runtime.enable');
      const railEval=async (fn,arg)=>{
        const result=await railSend('Runtime.evaluate',{expression:`(${fn.toString()})(${JSON.stringify(arg)})`,awaitPromise:true,returnByValue:true});
        if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      const railUntil=async (fn,arg,label)=>{
        for(let i=0;i<100;i++) {if(await railEval(fn,arg)) return; await pause(100);}
        throw Error(`${label} : rail absent de ${railPage.url}`);
      };
      const railClick=async (selector)=>{
        const rect=await railEval((sel)=>{
          const r=document.getElementById('pk-web-memory-rail').shadowRoot.querySelector(sel).getBoundingClientRect();
          return {x:r.left+r.width/2,y:r.top+r.height/2};
        },selector);
        await railSend('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',buttons:1,clickCount:1});
        await railSend('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',buttons:0,clickCount:1});
      };
      await railUntil(()=>!!document.getElementById('pk-web-memory-rail')?.shadowRoot && document.getElementById('pk-web-memory-rail').matches(':popover-open'),null,'rail injecté dans la page');
      // Le rail pousse la page (html décalé de 38 px) sans être embarqué dans
      // le décalage : couche supérieure, il reste ancré au viewport.
      await railUntil(()=>Math.round(document.documentElement.getBoundingClientRect().left)===30,null,'page poussée par le rail');
      assert.equal(await railEval(()=>Math.round(document.getElementById('pk-web-memory-rail').getBoundingClientRect().left)),0,'rail dans son trou, hors du décalage');
      assert.equal(await railEval(()=>getComputedStyle(document.documentElement).marginRight),'30px');
      // 3 ouverts + 2 à revenir à ce stade de la tournée (roll-5 traitée au ⌘W).
      assert.equal(await railEval(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelectorAll('.i[data-id]').length),5);
      assert.equal(await railEval(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelectorAll('.i[aria-current]').length<=1),true);
      // Le worker identifie la fenêtre : « normal » autorise le rail, une PWA
      // installée (« app ») ou un popup le laisse masqué par défaut.
      await railUntil(()=>document.getElementById('pk-web-memory-rail').dataset.windowType==='normal',null,'type de fenêtre lu par le rail');
      assert.equal(await railEval(()=>document.getElementById('pk-web-memory-rail').dataset.appWindow),'false','fenêtre normale : rail autorisé');
      assert.equal(await panelEval(async()=>(await chrome.storage.local.get('settings')).settings?.railPwa===true),false,'rail masqué par défaut hors fenêtres normales');
      assert.equal(await evaluate(()=>!!document.getElementById('setting-rail-pwa')),true,'option de réaffichage dans les réglages');
      // Une fenêtre popup n'a pas d'onglets Chrome : le rail doit rester
      // invisible et ne pas décaler la page, comme dans une PWA installée.
      const popup=await evaluate(async (base)=>{
        const win=await chrome.windows.create({url:`${base}/rail-popup`,type:'popup',width:640,height:480,focused:false});
        return {id:win.id,tabId:win.tabs[0].id};
      },base);
      let popupInfo=null;
      for(let i=0;i<100&&!popupInfo;i++){
        const target=(await cdp.send('Target.getTargets')).targetInfos.find((t)=>t.url.endsWith('/rail-popup'));
        if(!target){await pause(100);continue;}
        const attached=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
        const popupEval=async (expression)=>cdp.send('Runtime.evaluate',{expression,returnByValue:true},attached.sessionId);
        await popupEval('1');
        const result=await popupEval(`(() => {const h=document.getElementById('pk-web-memory-rail');return {has:!!h,open:!!h?.matches(':popover-open'),type:h?.dataset.windowType||'',app:h?.dataset.appWindow||'',left:Math.round(document.documentElement.getBoundingClientRect().left)};})()`);
        popupInfo=result.result.value;
        await cdp.send('Target.detachFromTarget',{sessionId:attached.sessionId});
        if(popupInfo?.type!=='popup'){popupInfo=null;await pause(100);}
      }
      assert.deepEqual(popupInfo,{has:true,open:false,type:'popup',app:'true',left:0},'rail masqué dans une fenêtre popup');
      await evaluate(async (id)=>{await chrome.windows.remove(id);},popup.id);
      // Les commandes restent hors de la liste défilante : sens en tête, panneau en pied.
      assert.equal(await railEval(()=>!!document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('.ctl.top [data-flip]')),true,'sens du rail en tête');
      assert.equal(await railEval(()=>!!document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('.ctl.bottom [data-panel]')),true,'panneau en pied');
      // Toute la réserve est rendue, sans plafond ni « … » de renvoi au panneau.
      await panelEval(async () => {
        const key='bs.respiration'; const q=(await chrome.storage.local.get(key))[key];
        for (let i=0;i<30;i++) q.entries.push({id:`overflow-${i}`,capsuleId:q.capsules[0]?.id,state:'pending',tabId:null,url:`https://overflow.test/${i}`,title:`Débordement ${i}`,keepReason:null,returnOrder:0});
        await chrome.storage.local.set({[key]:q});
      });
      await railUntil(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelectorAll('.i[data-id]').length===35,null,'les 30 pages ajoutées sont toutes rendues');
      assert.equal(await railEval(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('.more')===null),true,'aucune page remplacée par un …');
      assert.equal(await railEval(()=>{const l=document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('.list');return l.scrollHeight>l.clientHeight;}),true,'la liste des favicons défile');
      await panelEval(async () => {
        const key='bs.respiration'; const q=(await chrome.storage.local.get(key))[key];
        q.entries=q.entries.filter((e)=>!String(e.id).startsWith('overflow-'));
        await chrome.storage.local.set({[key]:q});
      });
      await railUntil(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelectorAll('.i[data-id]').length===5,null,'réserve réelle restaurée');
      // ☰ : le clic doit rester un vrai geste utilisateur jusqu'à sidePanel.open(),
      // sinon Chrome répond « may only be called in response to user gesture ».
      await railClick('[data-panel]');
      await pause(700);
      assert.equal(await railEval(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('.t')?.textContent||''),'','☰ ouvre le panneau sans erreur de geste utilisateur');
      // ⛶ : plein écran, seule façon de masquer toute la barre Chrome.
      await railClick('[data-fullscreen]');
      await panelUntil(async (id)=>(await chrome.windows.get(id)).state==='fullscreen',winId,'fenêtre passée en plein écran');
      assert.equal(await railEval(()=>document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('.fs')?.title.includes('Quitter le plein écran')),true,'bouton prêt à quitter le plein écran');
      await railClick('[data-fullscreen]');
      await panelUntil(async (id)=>(await chrome.windows.get(id)).state==='normal',winId,'fenêtre revenue en mode normal');
      await railEval(()=>{document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('[data-flip]').click();});
      await railUntil(()=>document.getElementById('pk-web-memory-rail').dataset.side==='right',null,'rail déplacé à droite depuis la page');
      assert.equal(await panelEval(async()=>(await chrome.storage.local.get('settings')).settings?.railSide),'right');
      await railEval(()=>{document.getElementById('pk-web-memory-rail').shadowRoot.querySelector('[data-flip]').click();});
      await railUntil(()=>document.getElementById('pk-web-memory-rail').dataset.side==='left',null,'rail revenu à gauche');
      await panelEval(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,railOn:false}});});
      await railUntil(()=>!document.getElementById('pk-web-memory-rail').matches(':popover-open'),null,'rail éteint depuis les réglages');
      await railUntil(()=>document.documentElement.getBoundingClientRect().left===0,null,'page revenue à sa place après extinction');
      // Mode Chrome natif : les onglets restent dans la fenêtre, seuls les N
      // derniers restent chargés, les autres sont discarded (jamais fermés).
      const suspendMode=await evaluate(async (id)=>{
        await chrome.runtime.sendMessage({type:'respiration-stop'});
        const tabs=await chrome.tabs.query({windowId:id});
        await chrome.tabs.update(tabs.at(-1).id,{active:true});
        const response=await chrome.runtime.sendMessage({type:'respiration-start',payload:{windowId:id,target:2,mode:'suspend'}});
        const after=await chrome.tabs.query({windowId:id});
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return {ok:response.ok,message:response.data?.message,mode:q?.mode,count:after.length,
          loaded:after.filter((t)=>!t.discarded).length,discarded:after.filter((t)=>t.discarded).length,
          entries:q?.entries.filter((e)=>e.discarded).length};
      },winId);
      assert.equal(suspendMode.ok,true,suspendMode.message);
      assert.equal(suspendMode.mode,'suspend');
      assert.equal(suspendMode.count,3,'aucun onglet fermé');
      assert.equal(suspendMode.loaded,2,'cible chargée respectée');
      assert.equal(suspendMode.discarded,1,'onglet au-delà de la cible suspendu');
      assert.equal(suspendMode.entries,1,'état suspendu persisté');
      await evaluate(async()=>{await chrome.runtime.sendMessage({type:'respiration-stop'});});
      await cdp.send('Target.closeTarget',{targetId:panel.targetId});
    });
    await t.test('⌘⌥W réel : page, iframe, réserve et réinjection idempotente', async () => {
      // Tout passe par le service worker, jamais gelé contrairement à une page
      // d'extension en arrière-plan ; seul le clavier est envoyé à la page web.
      const workerNow = async () => (await cdp.send('Target.getTargets')).targetInfos
        .find((t) => t.type === 'service_worker' && t.url === `chrome-extension://${id}/sw.js`);
      let worker = await workerNow();
      assert.ok(worker, 'service worker présent');
      let workerSession = (await cdp.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
      // Un service worker MV3 s'endort et disparaît des cibles : réveil par un
      // message depuis la page d'extension, puis réattachement systématique.
      let newAppSession = null;
      const wakeWorker = async () => {
        for (let i=0;i<50;i++) {
          const w = await workerNow();
          if (w) { worker = w; return w; }
          const ping = newAppSession || sessionId;
          if (ping) await cdp.send('Runtime.evaluate',{expression:'chrome.runtime.sendMessage({type:"wake"}).catch(() => {})',awaitPromise:true},ping).catch(() => {});
          await pause(100);
        }
        throw Error('service worker introuvable');
      };
      const workerEval = async (fn, arg) => {
        const result = await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${JSON.stringify(arg)})`,awaitPromise:true,returnByValue:true},workerSession);
        if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      const safeWorkerEval = async (fn, arg) => {
        try { return await workerEval(fn, arg); }
        catch {
          const w = await wakeWorker();
          workerSession = (await cdp.send('Target.attachToTarget',{targetId:w.targetId,flatten:true})).sessionId;
          return workerEval(fn, arg);
        }
      };
      const stateUntil = async (fn, arg, label) => {
        for (let i=0;i<150;i++) { if (await safeWorkerEval(fn,arg)) return; await pause(100); }
        throw Error(`Absent : ${label}`);
      };
      const winId = await safeWorkerEval(async (base) => {
        await respiration.command('stop');
        const q = (await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        if (q?.windowId) await chrome.windows.remove(q.windowId).catch(() => {});
        const win = await chrome.windows.create({url:`${base}/key-1`,focused:false});
        for (let n=2;n<=6;n++) await chrome.tabs.create({windowId:win.id,url:`${base}/key-${n}`,active:false});
        return win.id;
      }, base);
      await stateUntil(async (windowId) => (await chrome.tabs.query({windowId})).every((t) => t.status === 'complete'), winId, 'pages chargées');
      assert.match(await safeWorkerEval((windowId) => respiration.command('start',{windowId,target:2}).then((r) => r.message), winId), /Respiration/);
      const focusPage = async (number) => {
        const url = `${base}/key-${number}`;
        await safeWorkerEval(async ({url,winId}) => {
          const tab = (await chrome.tabs.query({windowId:winId})).find((t) => t.url === url);
          await chrome.windows.update(winId,{focused:true});
          await chrome.tabs.update(tab.id,{active:true});
        }, {url,winId});
        const target = (await cdp.send('Target.getTargets')).targetInfos.find((t) => t.url === url);
        assert.ok(target, url);
        const attached = await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
        const keySend = (method,params) => cdp.send(method,params,attached.sessionId);
        await keySend('Page.enable'); await keySend('Runtime.enable');
        await keySend('Page.bringToFront');
        return keySend;
      };
      // L'événement CDP est trusted et traverse le vrai content script puis le
      // worker : aucun appel direct au moteur pour simuler le raccourci.
      const pressW = async (keySend, modifiers = 5, key = 'w') => {
        await keySend('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:'KeyW',modifiers,
          windowsVirtualKeyCode:87,nativeVirtualKeyCode:13}); // Alt(1) + Meta(4)
        await keySend('Input.dispatchKeyEvent',{type:'keyUp',key,code:'KeyW',modifiers,
          windowsVirtualKeyCode:87,nativeVirtualKeyCode:13}).catch(() => {}); // la page peut déjà être fermée
      };
      const pressAndWait = async (number, key, done, label) => {
        const send2 = await focusPage(number);
        for (const focusIframe of [true, false]) {
          if (await safeWorkerEval(done)) break; // déjà reçu : ne jamais presser deux fois
          await send2('Runtime.evaluate',{expression: focusIframe
            ? 'document.querySelector("iframe")?.contentWindow?.focus()'
            : 'window.focus(); document.body?.focus()'});
          await pressW(send2, 5, key);
          let received = false;
          for (let i=0;i<25 && !received;i++) { received = await safeWorkerEval(done); if (!received) await pause(100); }
          if (received) { t.diagnostic(`${label} reçu (${focusIframe ? 'cadre intégré' : 'frame principal'}).`); return; }
        }
        throw Error(`${label} : ⌘⌥W jamais reçu dans key-${number}`);
      };
      // Un événement synthétique non trusted et l'ancien ⌥⇧W (modificateurs 9)
      // ne déclenchent rien : seul le vrai ⌘⌥W doit agir.
      let keySend = await focusPage(6);
      await keySend('Runtime.evaluate',{expression:`window.dispatchEvent(new KeyboardEvent('keydown', {key:'w',code:'KeyW',metaKey:true,altKey:true,bubbles:true}))`});
      await pressW(keySend, 9);
      await pause(250);
      assert.equal(await safeWorkerEval(async () => {
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q.entries.find((e)=>e.url.endsWith('/key-6')).state;
      }), 'open', "ni l'événement synthétique ni ⌥⇧W ne ferment l'onglet");
      await pressAndWait(6, 'w', async () => {
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q.entries.find((e)=>e.url.endsWith('/key-6')).state === 'pending'
          && q.entries.find((e)=>e.url.endsWith('/key-4')).state === 'open';
      }, '⌘⌥W page : 6 en réserve, 4 rappelée');
      assert.equal(await safeWorkerEval(async (windowId) => (await chrome.tabs.query({windowId})).length, winId), 2);

      await pressAndWait(5, '∑', async () => { // Option transforme key ; le code virtuel conserve W
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q.entries.find((e)=>e.url.endsWith('/key-5')).state === 'pending'
          && q.entries.find((e)=>e.url.endsWith('/key-3')).state === 'open';
      }, '⌘⌥W iframe : 5 en réserve, 3 rappelée');
      assert.equal(await safeWorkerEval(async () => (await chrome.storage.local.get('bs.respiration'))['bs.respiration'].entries.filter((e)=>e.state==='done').length), 0);

      // Réinjection idempotente : au rechargement de l'extension (bouton ↻),
      // le worker redémarre et respiration-shortcut.js est réinjecté dans les
      // pages déjà ouvertes. Un chrome.runtime.reload() sous Chrome for
      // Testing headless décharge carrément l'extension non empaquetée —
      // impossible à rejouer ici — mais l'injection répétée se vérifie
      // réellement : elle ne doit ni casser ni doubler la rotation.
      await safeWorkerEval(async () => { await installRespirationShortcuts(); });
      await pressAndWait(4, 'w', async () => {
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return q.entries.find((e)=>e.url.endsWith('/key-4')).state === 'pending';
      }, '⌘⌥W après réinjection : 4 en réserve');
      assert.deepEqual(await safeWorkerEval(async (winId) => {
        const tabs = await chrome.tabs.query({windowId:winId});
        const q=(await chrome.storage.local.get('bs.respiration'))['bs.respiration'];
        return { count:tabs.length, key3:q.entries.find((e)=>e.url.endsWith('/key-3')).state,
          done:q.entries.filter((e)=>e.state==='done').length };
      }, winId), { count:2, key3:'open', done:0 }, 'une seule rotation par pression, jamais deux');
      t.diagnostic('⌘⌥W reçu dans la page et dans une iframe ; réinjection idempotente : une seule rotation par pression.');
    });
    assert.deepEqual(errors,[]);
  } finally {
    cdp?.socket.close(); child?.kill(); server.closeAllConnections(); server.close();
    await pause(400); await rm(profile,{ recursive:true,force:true,maxRetries:5,retryDelay:300 });
  }
});
