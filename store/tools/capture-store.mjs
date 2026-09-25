#!/usr/bin/env node
/**
 * Reproducible Chrome Web Store screenshots of the REAL extension UI.
 * Runs Chrome with a disposable profile, fictional bookmarks/history/sessions,
 * and no dependency beyond Node 22+ and Chrome for Testing.
 * Usage: node "store/tools/capture-store.mjs"
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const EXTENSION = join(ROOT, "extension");
const OUTPUT = join(ROOT, "store", "screenshots");
let CHROME = "";
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
const PAUSE = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
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
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: délai dépassé`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() { this.socket.close(); }
}

const COLLECTIONS = [
  ["Design & inspiration", [
    ["Figma Community", "https://www.figma.com/community"],
    ["Mobbin — interfaces mobiles", "https://mobbin.com/"],
    ["Awwwards — sites remarquables", "https://www.awwwards.com/"],
    ["Are.na — collections visuelles", "https://www.are.na/"],
    ["Fonts In Use", "https://fontsinuse.com/"],
    ["Typewolf — typographie", "https://www.typewolf.com/"],
    ["Godly — web design", "https://godly.website/"],
    ["Lapa Ninja — landing pages", "https://www.lapa.ninja/"],
    ["Design Systems Repo", "https://designsystemsrepo.com/"],
    ["The Brand Identity", "https://the-brandidentity.com/"],
    ["Layers — inspiration", "https://layers.to/"],
    ["Figma Community", "https://www.figma.com/community"],
  ]],
  ["Développement", [
    ["MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web"],
    ["GitHub Explore", "https://github.com/explore"],
    ["web.dev — performance", "https://web.dev/"],
    ["CSS-Tricks", "https://css-tricks.com/"],
    ["Can I Use", "https://caniuse.com/"],
    ["CodePen", "https://codepen.io/"],
    ["Stack Overflow", "https://stackoverflow.com/"],
    ["Vite — guide", "https://vite.dev/guide/"],
    ["Chrome for Developers", "https://developer.chrome.com/docs/extensions/"],
    ["MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web"],
    ["GitHub Explore", "https://github.com/explore"],
  ]],
  ["Intelligence artificielle", [
    ["Hugging Face — modèles", "https://huggingface.co/models"],
    ["OpenAI Research", "https://openai.com/research/"],
    ["Anthropic Research", "https://www.anthropic.com/research"],
    ["Papers with Code", "https://paperswithcode.com/"],
    ["Google AI", "https://ai.google/"],
    ["arXiv — machine learning", "https://arxiv.org/list/cs.LG/recent"],
    ["Hugging Face — modèles", "https://huggingface.co/models"],
  ]],
  ["Recherche & veille", [
    ["The Gradient", "https://thegradient.pub/"],
    ["Our World in Data", "https://ourworldindata.org/"],
    ["Nielsen Norman Group", "https://www.nngroup.com/articles/"],
    ["Smashing Magazine", "https://www.smashingmagazine.com/"],
    ["MIT Technology Review", "https://www.technologyreview.com/"],
    ["GitHub Explore", "https://github.com/explore"],
  ]],
  ["Outils & ressources", [
    ["Raycast Store", "https://www.raycast.com/store"],
    ["Linear", "https://linear.app/"],
    ["Notion", "https://www.notion.so/"],
    ["Excalidraw", "https://excalidraw.com/"],
    ["Framer", "https://www.framer.com/"],
    ["Figma Community", "https://www.figma.com/community"],
  ]],
  ["Archives à vérifier", [
    ["Ancienne documentation API", "https://example.com/archives/api-v1"],
    ["Guide supprimé", "https://example.com/guides/old-workflow"],
    ["Maquette expirée", "https://example.com/preview/retired"],
    ["Ressource déplacée", "https://example.com/resources/moved"],
  ]],
];

const LIVE_TABS = [
  "https://developer.mozilla.org/en-US/docs/Web",
  "https://github.com/explore",
  "https://web.dev/",
  "https://www.wikipedia.org/",
  "https://www.awwwards.com/",
  "https://www.mozilla.org/en-US/firefox/",
];

function extensionId(key) {
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((digit) => "abcdefghijklmnop"[parseInt(digit, 16)]).join("");
}

function xml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

function makeThumbnail(title, index) {
  const schemes = [
    ["#111827", "#344ca2", "#9ec5ff"], ["#1c1a35", "#7a3ff1", "#f3b9ff"],
    ["#102229", "#138f95", "#a1f4dc"], ["#291721", "#cf557e", "#ffd4b7"],
    ["#1a2419", "#72a756", "#e3fdb1"], ["#1c1b25", "#776bcb", "#dcd6ff"],
  ];
  const [dark, mid, light] = schemes[index % schemes.length];
  const short = title.replace(/\s*[—–-].*$/, "").slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="23"/></filter></defs>
    <rect width="400" height="300" fill="url(#g)"/><circle cx="323" cy="74" r="92" fill="${light}" opacity=".28" filter="url(#b)"/>
    <path d="M0 240 Q140 180 400 278" fill="none" stroke="${light}" opacity=".15" stroke-width="60"/>
    <rect x="29" y="29" width="342" height="242" rx="13" fill="#fff" opacity=".12" stroke="#fff" stroke-opacity=".45"/>
    <circle cx="49" cy="49" r="4" fill="${light}"/><circle cx="62" cy="49" r="4" fill="#fff" opacity=".5"/><circle cx="75" cy="49" r="4" fill="#fff" opacity=".3"/>
    <path d="M29 67H371" stroke="#fff" stroke-opacity=".25"/>
    <text x="50" y="117" fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Arial,sans-serif" font-weight="700" font-size="27">${xml(short)}</text>
    <rect x="50" y="137" width="208" height="7" rx="4" fill="#fff" opacity=".43"/><rect x="50" y="155" width="154" height="7" rx="4" fill="#fff" opacity=".28"/>
    <rect x="50" y="203" width="86" height="30" rx="15" fill="${light}"/><rect x="149" y="203" width="73" height="30" rx="15" fill="#fff" opacity=".22"/>
    <circle cx="321" cy="201" r="32" fill="none" stroke="#fff" stroke-opacity=".48" stroke-width="9"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function fixture() {
  const all = COLLECTIONS.flatMap(([, entries]) => entries);
  const unique = [...new Map(all.map(([title, url]) => [url, title])).entries()];
  const now = Date.now();
  const thumbnails = Object.fromEntries(unique.map(([url, title], i) => [url, {
    src: makeThumbnail(title, i), expires: now + 30 * 86400000, touched: now - i,
  }]));
  const checks = Object.fromEntries(COLLECTIONS.at(-1)[1].map(([, url], i) => [url, {
    s: "dead", t: now - 2 * 86400000, ds: now - (i + 8) * 86400000,
  }]));
  const saved = [
    ["Sprint design — jeudi", 1, [["Figma Community", "https://www.figma.com/community", "Inspiration", "purple"], ["Mobbin — interfaces mobiles", "https://mobbin.com/", "Inspiration", "purple"], ["MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web", "Documentation", "blue"]]],
    ["Recherche & veille — mercredi", 2, [["Our World in Data", "https://ourworldindata.org/", "Veille", "green"], ["Papers with Code", "https://paperswithcode.com/", "Veille", "green"], ["Nielsen Norman Group", "https://www.nngroup.com/articles/", "Veille", "green"]]],
    ["Développement — mardi", 3, [["GitHub Explore", "https://github.com/explore", "Code", "blue"], ["web.dev", "https://web.dev/", "Code", "blue"], ["Can I Use", "https://caniuse.com/", "Code", "blue"]]],
  ].map(([name, days, tabs], i) => ({
    id: `demo-session-${i + 1}`, name, auto: false, capturedAt: now - days * 86400000,
    ignored: i === 1 ? 1 : 0,
    windows: [{ tabs: tabs.map(([title, url, groupName, groupColor]) => ({ title, url, groupName, groupColor, pinned: false })) }],
  }));
  return { collections: COLLECTIONS, checks, thumbnails, sessions: saved };
}

async function waitForPort(profile, child) {
  const path = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`Chrome s'est arrêté (${child.exitCode})`);
    try {
      const [port] = (await readFile(path, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch { /* Chrome démarre */ }
    await PAUSE(100);
  }
  throw new Error("Chrome n'a pas ouvert son port de débogage");
}

async function evaluate(cdp, session, fn, argument) {
  const expression = `(${fn.toString()})(${JSON.stringify(argument)})`;
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (result.exceptionDetails) throw new Error(`Évaluation Chrome: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || ""}`);
  return result.result?.value;
}

async function waitFor(cdp, session, predicate, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(cdp, session, predicate)) return;
    await PAUSE(100);
  }
  throw new Error(`Délai dépassé: ${label}`);
}

function historyFixture() {
  const seed = COLLECTIONS.flatMap(([, entries]) => entries).filter(([, url]) => !url.startsWith("https://example.com"));
  const visits = [];
  const now = new Date();
  let serial = 0;
  const add = (daysAgo, hour, minute, item, ref = null) => {
    const [title, url] = item;
    const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute).getTime();
    const id = `demo-visit-${++serial}`;
    visits.push({ id, title, url, ts, ref, transition: ref ? "link" : "typed" });
    return id;
  };
  let parent = add(0, 9, 11, seed[0]);
  for (let i = 1; i < 8; i++) parent = add(0, 9 + Math.floor(i / 3), 10 + i * 5, seed[i], parent);
  for (let d = 1; d <= 170; d++) {
    if (d < 20 || d % 3 === 0 || d % 7 === 0) {
      const n = d % 5 === 0 ? 5 : d % 3 === 0 ? 3 : 2;
      let previous = null;
      for (let k = 0; k < n; k++) previous = add(d, 9 + k, (d * 7 + k * 11) % 60, seed[(d * 3 + k) % seed.length], previous);
    }
  }
  visits.sort((a, b) => b.ts - a.ts);
  const byUrl = new Map();
  for (const v of visits) {
    const item = byUrl.get(v.url);
    if (item) item.visitCount++;
    else byUrl.set(v.url, { url: v.url, title: v.title, lastVisitTime: v.ts, visitCount: 1 });
  }
  return { visits, pages: [...byUrl.values()].sort((a, b) => b.lastVisitTime - a.lastVisitTime) };
}

async function seedChrome(cdp, session, demo) {
  return evaluate(cdp, session, async ({ collections, checks, thumbnails, sessions }) => {
    const tree = (await chrome.bookmarks.getTree())[0];
    const bar = tree.children.find((node) => node.id === "1") || tree.children[0];
    let count = 0;
    for (const [folderName, entries] of collections) {
      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: folderName });
      for (const [title, url] of entries) {
        await chrome.bookmarks.create({ parentId: folder.id, title, url });
        count++;
      }
    }
    await chrome.storage.local.set({
      checks, thumbnails,
      "bs.sessions": { version: 1, sessions },
      "settings": { scanAutostart: false, thumbsMode: "mshots" },
      "uiLang": "fr",
      "hnavWindowDays": 0,
    });
    return { bookmarks: count, folders: collections.length, deadLinks: Object.keys(checks).length, sessions: sessions.length };
  }, demo);
}

// Historique réel du profil jetable : les visées atterrissent « maintenant »,
// la carte « Aujourd'hui » de la section Par jour se remplit de favicônes.
// (chrome.history.addUrl ne permet pas de dater : les jours plus anciens
// restent vides sur la capture — ponytail: acceptable, un jour dense suffit.)
async function seedHistory(cdp, session, demo) {
  return evaluate(cdp, session, async (collections) => {
    const urls = [...new Set(collections.flatMap(([, entries]) => entries.map(([, url]) => url)))];
    for (const url of urls) {
      try { await chrome.history.addUrl({ url }); } catch { /* schéma refusé */ }
    }
    return urls.length;
  }, demo.collections);
}

async function seedOpenTabs(cdp, session) {
  return evaluate(cdp, session, async (urls) => {
    for (const url of urls) {
      try { await chrome.tabs.create({ url, active: false }); } catch { /* site unavailable */ }
    }
    return urls.length;
  }, LIVE_TABS);
}

async function click(cdp, session, selector) {
  const result = await evaluate(cdp, session, (sel) => {
    const node = document.querySelector(sel);
    if (!node) return false;
    node.click();
    return true;
  }, selector);
  if (!result) throw new Error(`Élément absent: ${selector}`);
}

async function capture(cdp, session, name, ready) {
  await waitFor(cdp, session, ready, name);
  await PAUSE(150);
  const data = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, session);
  const file = join(OUTPUT, name);
  await writeFile(file, Buffer.from(data.data, "base64"));
  console.log(`✓ ${name}`);
  return file;
}

async function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  ];
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  try {
    const versions = (await readdir(cache)).filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const version of versions) {
      for (const platform of ["chrome-mac-arm64", "chrome-mac"]) {
        candidates.push(join(cache, version, platform, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
      }
    }
  } catch { /* Playwright cache absent */ }
  for (const path of candidates) {
    try { await access(path); return path; } catch { /* candidate absent */ }
  }
  throw new Error("Chrome for Testing introuvable. Installez-le ou définissez CHROME_BIN.");
}

async function main() {
  CHROME = await findChrome();
  await mkdir(OUTPUT, { recursive: true });
  for (const name of await readdir(OUTPUT)) {
    if (/^\d{2}-.+\.png$/.test(name)) await unlink(join(OUTPUT, name));
  }
  const manifest = JSON.parse(await readFile(join(EXTENSION, "manifest.json"), "utf8"));
  const id = extensionId(manifest.key);
  const profile = await mkdtemp(join(tmpdir(), "bookmarks-sorter-store-"));
  let child;
  let cdp;
  const report = { extensionId: id, version: manifest.version_name, viewport: "1280x800", screenshots: [], fixture: null };
  try {
    child = spawn(CHROME, [
      "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-sync",
      "--disable-background-networking", "--disable-features=MediaRouter",
      `--user-data-dir=${profile}`, `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`, "--remote-debugging-port=0",
      "--window-size=1280,800", "--force-device-scale-factor=1",
      "--hide-scrollbars", "about:blank",
    ], { stdio: "ignore" });
    const port = await waitForPort(profile, child);
    const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then((res) => res.json());
    cdp = await CDP.connect(browser.webSocketDebuggerUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT, sessionId);
    await cdp.send("Page.navigate", { url: `chrome-extension://${id}/index.html` }, sessionId);
    try {
      await waitFor(cdp, sessionId, () => document.readyState === "complete" && !!document.querySelector("#stat-total") && document.querySelector("#stat-total").textContent !== "—", "initialisation extension");
    } catch (error) {
      console.error("Page ouverte:", await evaluate(cdp, sessionId, () => ({ url: location.href, title: document.title, state: document.readyState, text: document.body?.innerText?.slice(0, 500), chromeRuntime: !!chrome?.runtime })));
      console.error("Cibles:", (await cdp.send("Target.getTargets")).targetInfos.map(({ type, url, title }) => ({ type, url, title })));
      throw error;
    }

    const demo = fixture();
    report.fixture = await seedChrome(cdp, sessionId, demo);
    report.historySeeded = await seedHistory(cdp, sessionId, demo);
    report.liveTabsSeeded = await seedOpenTabs(cdp, sessionId);
    // Les événements bookmarks déclenchent une réanalyse asynchrone du premier
    // onglet déjà ouvert. Réappliquer les statuts fictifs une fois ce travail fini.
    await PAUSE(1000);
    await evaluate(cdp, sessionId, async (checks) => chrome.storage.local.set({ checks }), demo.checks);
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
    await waitFor(cdp, sessionId, () => document.readyState === "complete" && document.querySelector("#stat-total")?.textContent === "46", "données fictives chargées");
    // Le rendu reprend exactement les fonctions de l'application et les mêmes
    // données que chrome.storage.local, sans modifier ses fichiers source.
    report.deadStatus = await evaluate(cdp, sessionId, (checks) => {
      CHECKS = checks;
      renderDead();
      return { stored: Object.keys(checks).length, visible: document.querySelectorAll("#dead-list .row").length };
    }, demo.checks);
    report.backupSnapshots = await evaluate(cdp, sessionId, async () => {
      await createHistorySnapshot("export-json", "Export JSON");
      await createHistorySnapshot("export-html", "Export HTML");
      await createHistorySnapshot("export-json", "Export JSON");
      await renderHistory();
      return document.querySelectorAll("#backup-history .history-row").length;
    });

    report.screenshots.push(await capture(cdp, sessionId, "01-inventaire.png", () => document.querySelector("#folder-tree .rank-row") && document.querySelector("#domain-list .rank-row")));

    // Palette de recherche globale : frappe directe puis requête de démonstration.
    await evaluate(cdp, sessionId, () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true }));
    });
    await evaluate(cdp, sessionId, () => {
      const input = document.getElementById("global-search-input");
      input.value = "a";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    report.screenshots.push(await capture(cdp, sessionId, "02-recherche.png", () => document.querySelectorAll("#global-search .gs-row").length >= 5 && document.querySelectorAll("#global-search .gs-dock-item").length >= 5));
    await evaluate(cdp, sessionId, () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    await click(cdp, sessionId, '.rail-tab[data-section="historynav"]');
    await waitFor(cdp, sessionId, () => !!document.querySelector("#hnav-heatmap .hm"), "premier rendu de l'historique");
    const historical = historyFixture();
    await evaluate(cdp, sessionId, ({ visits, pages }) => {
      hnavDayFilter = hnavDayStart(Date.now());
      hnavRenderCollected("", 0, visits, pages);
      return { cells: document.querySelectorAll(".hm-cell").length, rows: document.querySelectorAll(".hg-row").length };
    }, historical);
    report.screenshots.push(await capture(cdp, sessionId, "03-historique.png", () => document.querySelectorAll(".hm-cell.l1, .hm-cell.l2, .hm-cell.l3, .hm-cell.l4").length > 20 && document.querySelectorAll(".hg-row").length >= 6));

    await click(cdp, sessionId, '.rail-tab[data-section="bookmarks"]');
    await click(cdp, sessionId, '.header-tab[data-tab="gallery"]');
    report.screenshots.push(await capture(cdp, sessionId, "04-galerie.png", () => document.querySelectorAll("#gallery-grid .gcard img.thumb[src^='data:image/svg+xml']").length >= 6));

    await click(cdp, sessionId, '.header-tab[data-tab="dedupe"]');
    report.screenshots.push(await capture(cdp, sessionId, "05-doublons.png", () => document.querySelectorAll("#dedupe-groups .group").length >= 3));

    await click(cdp, sessionId, '.rail-tab[data-section="sessions"]');
    // Déplier les instantanés (refonte : ils vivent repliés) avant la capture.
    await evaluate(cdp, sessionId, () => {
      const details = document.querySelector("#sessions-root [data-snapshots]");
      if (details) details.open = true;
    });
    report.screenshots.push(await capture(cdp, sessionId, "06-sessions.png", () => {
      const details = document.querySelector("#sessions-root [data-snapshots]");
      return !!details?.open
        && document.querySelectorAll("#sessions-root .sess-card").length >= 3
        && document.querySelectorAll("#sessions-root .sess-day-card .favicon-strip img").length >= 5
        && document.querySelector("#sessions-root .sess-live-card .favicon-strip img");
    }));

    await click(cdp, sessionId, '.rail-tab[data-section="bookmarks"]');
    await click(cdp, sessionId, '.header-tab[data-tab="dead"]');
    report.screenshots.push(await capture(cdp, sessionId, "07-liens-morts.png", () => document.querySelectorAll("#dead-list .row").length >= 4));

    await click(cdp, sessionId, '.rail-tab[data-section="bookmarks"]');
    await click(cdp, sessionId, '.header-tab[data-tab="backup"]');
    report.screenshots.push(await capture(cdp, sessionId, "08-backup.png", () => document.querySelectorAll("#backup-history .history-row").length >= 3 && document.querySelector("#backup-layout")?.getBoundingClientRect().width > 0));

    await writeFile(join(HERE, "capture-report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`Terminé : ${report.screenshots.length} captures, Chrome ${browser.Browser}, profil temporaire supprimé.`);
  } finally {
    try { cdp?.close(); } catch { /* fermeture */ }
    if (child) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), PAUSE(4000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
