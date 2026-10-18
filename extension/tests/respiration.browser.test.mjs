// Intégration Respiration dans Chrome for Testing : profil jetable et pages locales.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
        reject(new Error(`Timeout: ${method}`));
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
  const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0,32)]
    .map((d) => 'abcdefghijklmnop'[parseInt(d,16)]).join('');
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
        const input=document.querySelector('#respiration-search'); input.value='24'; input.dispatchEvent(new Event('input'));
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
    assert.deepEqual(errors,[]);
  } finally {
    cdp?.socket.close(); child?.kill(); server.closeAllConnections(); server.close();
    await pause(400); await rm(profile,{ recursive:true,force:true,maxRetries:5,retryDelay:300 });
  }
});
