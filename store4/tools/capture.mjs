#!/usr/bin/env node
// Real unpacked extension, disposable Chrome profile, fictional input data.
// No DOM/style/image replacement; no access to the user's Chrome profile.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION = join(ROOT, 'extension');
const OUTPUT = join(ROOT, 'store4/screenshots');
const VIEWPORT = { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
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
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
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

async function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = ['/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'];
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  try {
    const versions = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const version of versions) for (const platform of ['chrome-mac-arm64', 'chrome-mac']) {
      candidates.push(join(cache, version, platform, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    }
  } catch { /* explicit CHROME_BIN also supported */ }
  for (const path of candidates) {
    try { await access(path); return path; } catch { /* try next installed binary */ }
  }
  throw new Error('Set CHROME_BIN to a Chrome for Testing binary with unpacked extension support.');
}

const collections = [
  ['Design & inspiration', [
    ['Figma Community', 'https://www.figma.com/community'],
    ['Design Systems Repo', 'https://designsystemsrepo.com/'],
    ['Fonts In Use', 'https://fontsinuse.com/'],
    ['Nielsen Norman Group', 'https://www.nngroup.com/articles/'],
    ['Figma Community — à classer', 'https://www.figma.com/community'],
  ]],
  ['Développement', [
    ['MDN — Documentation du Web', 'https://developer.mozilla.org/en-US/docs/Web'],
    ['GitHub Explore', 'https://github.com/explore'],
    ['web.dev — Performance', 'https://web.dev/'],
    ['Can I Use', 'https://caniuse.com/'],
    ['Vite — Guide', 'https://vite.dev/guide/'],
    ['MDN — Ressource sauvegardée', 'https://developer.mozilla.org/en-US/docs/Web'],
  ]],
  ['Recherche & veille', [
    ['Our World in Data', 'https://ourworldindata.org/'],
    ['Hugging Face — Modèles', 'https://huggingface.co/models'],
    ['The Gradient', 'https://thegradient.pub/'],
    ['GitHub — Veille', 'https://github.com/explore'],
  ]],
  ['Outils quotidiens', [
    ['Excalidraw', 'https://excalidraw.com/'],
    ['Raycast Store', 'https://www.raycast.com/store'],
    ['Linear', 'https://linear.app/'],
    ['Notion', 'https://www.notion.so/'],
  ]],
];

async function main() {
  const chrome = await findChrome();
  await mkdir(OUTPUT, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), 'pk-store4-'));
  const manifest = JSON.parse(await readFile(join(EXTENSION, 'manifest.json'), 'utf8'));
  const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)].map(d => 'abcdefghijklmnop'[parseInt(d, 16)]).join('');
  let child, cdp;
  const report = { extensionVersion: manifest.version_name, viewport: VIEWPORT, capturedAt: new Date().toISOString(), method: 'Page.captureScreenshot of the unpacked extension; no DOM, CSS, image or renderer modifications', data: 'Fictional bookmarks and saved sessions; public-site visits plus demo history seeded through chrome.history.addUrl in a disposable profile; favicon-only mode; no fabricated thumbnails or scan results', screenshots: [], sources: {} };
  for (const file of ['manifest.json', 'index.html', 'style.css', 'app.js', 'sessions.js', 'global-search.js']) {
    report.sources[file] = createHash('sha256').update(await readFile(join(EXTENSION, file))).digest('hex');
  }
  try {
    child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', `--user-data-dir=${profile}`, `--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, '--remote-debugging-port=0', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(`Chrome exited: ${child.exitCode}`);
      try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { /* booting */ }
      if (port) break;
      await pause(100);
    }
    if (!port) throw new Error('Chrome debugging port unavailable');
    const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
    report.browser = browser.Browser;
    cdp = await CDP.connect(browser.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    const evaluate = async (fn, arg) => {
      const result = await send('Runtime.evaluate', { expression: `(${fn.toString()})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (fn, label) => {
      for (let i = 0; i < 150; i++) { if (await evaluate(fn)) return; await pause(100); }
      const pendingImages = await evaluate(() => [...document.images].filter(img => !img.complete && img.getClientRects().length).map(img => ({ src: img.getAttribute('src'), rect: img.getBoundingClientRect().toJSON(), loading: img.loading })));
      throw new Error(`Not ready: ${label}; pending images: ${JSON.stringify(pendingImages)}`);
    };
    const click = selector => evaluate(sel => {
      const node = document.querySelector(sel);
      if (!node) throw new Error(`Missing control: ${sel}`);
      node.click();
    }, selector);
    const shot = async (name, ready) => {
      await send('Page.bringToFront');
      await waitFor(ready, name);
      await evaluate(() => document.fonts.ready.then(() => true));
      await waitFor(() => [...document.images].every(img => {
        const rect = img.getBoundingClientRect();
        return !img.getAttribute('src') || img.complete || !rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight;
      }), 'visible images');
      const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const bytes = Buffer.from(data, 'base64');
      await writeFile(join(OUTPUT, name), bytes);
      report.screenshots.push({ file: name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
      console.log(`Captured ${name} (${bytes.length} bytes)`);
    };
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', VIEWPORT);
    await send('Page.navigate', { url: `chrome-extension://${id}/index.html` });
    await waitFor(() => document.querySelector('#stat-total')?.textContent !== '—' && !!document.querySelector('#stat-total'), 'extension startup');
    report.seed = await evaluate(async collections => {
      const tree = (await chrome.bookmarks.getTree())[0];
      const bar = tree.children.find(n => n.id === '1') || tree.children[0];
      for (const [title, entries] of collections) {
        const folder = await chrome.bookmarks.create({ parentId: bar.id, title });
        for (const [title, url] of entries) await chrome.bookmarks.create({ parentId: folder.id, title, url });
      }
      const now = Date.now();
      const sessions = collections.slice(0, 3).map(([title, entries], index) => ({
        id: `store4-demo-${index}`, title, note: 'Collection de démonstration', tags: [], favorite: index === 0, archived: false, auto: false,
        createdAt: now - (index + 1) * 86400000, updatedAt: now - (index + 1) * 86400000,
        windows: [{ tabs: entries.slice(0, 4).map(([title, url]) => ({ title, url, pinned: false, group: '' })) }],
      }));
      await chrome.storage.local.set({ uiLang: 'fr', settings: { scanAutostart: false, thumbsMode: 'favicon' }, 'bs.sessions.library': { sessions, settings: { autosave: false, sleepMinutes: 0, previews: false, dailySave: false, dailyHour: 7, dailyClose: false }, migratedAt: now } });
      return { bookmarks: collections.flatMap(([, entries]) => entries).length, savedSessions: sessions.length };
    }, collections);
    // Actual visits load titles/favicons into this disposable Chrome profile.
    for (const url of ['https://developer.mozilla.org/en-US/docs/Web', 'https://web.dev/', 'https://github.com/explore', 'https://www.wikipedia.org/']) {
      const { targetId: visitId } = await cdp.send('Target.createTarget', { url });
      for (let i = 0; i < 100; i++) {
        const ready = await evaluate(async url => (await chrome.tabs.query({})).some(t => t.url === url && t.status === 'complete'), url);
        if (ready) break;
        await pause(100);
      }
      console.log(`Visited ${url} in disposable target ${visitId}`);
    }
    // Seed demo visits through Chrome's real history API (no renderer override).
    await evaluate(async collections => {
      for (const url of new Set(collections.flatMap(([, entries]) => entries.map(([, url]) => url)))) {
        await chrome.history.addUrl({ url });
      }
    }, collections);
    await send('Page.reload', { ignoreCache: true });
    await waitFor(() => document.querySelector('#stat-total')?.textContent === '19', 'seeded bookmarks');
    await shot('01-inventaire.png', () => !!document.querySelector('#folder-tree .rank-row'));
    await click('#btn-global-search');
    await evaluate(() => { const input = document.querySelector('#global-search-input'); input.value = 'web'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await shot('02-recherche.png', () => document.querySelectorAll('#global-search .gs-row').length >= 2);
    await click('#global-search-close');
    await click('.rail-tab[data-section="historynav"]');
    await shot('03-historique.png', () => !!document.querySelector('.hg-row'));
    await click('.rail-tab[data-section="bookmarks"]');
    await click('.header-tab[data-tab="gallery"]');
    await shot('04-galerie.png', () => document.querySelectorAll('#gallery-grid .gcard').length >= 10);
    await click('.header-tab[data-tab="dedupe"]');
    await shot('05-doublons.png', () => document.querySelectorAll('#dedupe-groups .group').length >= 3);
    await click('.rail-tab[data-section="sessions"]');
    await shot('06-sessions.png', () => document.querySelectorAll('#sessions-root .tl-session').length >= 3 && document.querySelectorAll('#sessions-root .tl-fav').length >= 4);
    await click('.rail-tab[data-section="bookmarks"]');
    await click('.header-tab[data-tab="dead"]');
    await shot('07-liens-morts.png', () => document.querySelector('#tab-dead')?.classList.contains('active'));
    // Real export controls produce the local backup history. Downloads stay disposable.
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(profile, 'exports') });
    await click('#btn-export-json');
    await waitFor(() => document.querySelectorAll('#backup-history .history-row').length >= 1, 'JSON backup');
    await click('#btn-export-html');
    await click('.header-tab[data-tab="backup"]');
    await shot('08-backup.png', () => document.querySelectorAll('#backup-history .history-row').length >= 2);
    await writeFile(join(ROOT, 'store4/tools/capture-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Complete: ${report.screenshots.length} unretouched screenshots; temporary profile removed on exit.`);
  } finally {
    cdp?.socket.close();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(4000)]);
      if (child.exitCode === null) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
    }
    await rm(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
