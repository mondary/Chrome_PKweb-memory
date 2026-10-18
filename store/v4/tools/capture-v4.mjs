#!/usr/bin/env node
// PK Web Memory — kit média v4 : captures réelles de l'extension (dépôt, 10.18)
// en profil jetable, pour la fiche Chrome Web Store (1280×800) et la landing
// (1440×1000), plus les frames de la boucle animée (GIF + MP4).
//
// Usage :
//   node store/v4/tools/capture-v4.mjs                 # tout : scènes + boucle + assets
//   node store/v4/tools/capture-v4.mjs --scene sessions
//   node store/v4/tools/capture-v4.mjs --loop --scene -
//   SKIP_NET=1 node store/v4/tools/capture-v4.mjs      # sans favicônes S2/miniatures
//
// Dépendances : Node 22+, Chrome for Testing (CHROME_BIN ou cache ms-playwright),
// ImageMagick (`magick`, pour le curseur de la boucle), réseau pour les favicônes
// Google S2 et les 12 miniatures réelles. Aucune donnée privée.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const EXTENSION = join(ROOT, "extension");
const OUT = join(ROOT, "store/v4");
const SHOTS = join(OUT, "screenshots");
const FRAMES = join(OUT, "anim/frames");
const FIXED = join(OUT, "anim/frames-fixed");
const ASSETS = join(OUT, "assets");
const SITE_VIEW = { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false };
const CWS_VIEW = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const SKIP_NET = process.env.SKIP_NET === "1";

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
      if (data.error) call.reject(new Error(`${call.method}: ${data.error.message}`));
      else call.resolve(data.result || {});
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
        reject(new Error(`${method}: délai dépassé`));
      }, 30000);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = ["/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"];
  try {
    const cache = join(homedir(), "Library/Caches/ms-playwright");
    const versions = (await readdir(cache)).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const v of versions) for (const p of ["chrome-mac-arm64", "chrome-mac"]) {
      candidates.push(join(cache, v, p, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"));
    }
  } catch { /* CHROME_BIN reste la source */ }
  for (const path of candidates) { try { await access(path); return path; } catch { /* suivant */ } }
  throw new Error("Chrome for Testing introuvable (définir CHROME_BIN).");
}

/* ------------------------------------------------------------------ */
/* Jeu de données curé (fictif, réaliste).                             */
/* ------------------------------------------------------------------ */
const DASHBOARD = [
  ["Design & inspiration", [
    ["Figma Community", "https://www.figma.com/community"],
    ["Mobbin (interfaces mobiles)", "https://mobbin.com/"],
    ["Awwwards (sites remarquables)", "https://www.awwwards.com/"],
    ["Are.na (collections visuelles)", "https://www.are.na/"],
    ["Fonts In Use", "https://fontsinuse.com/"],
    ["Typewolf (typographie)", "https://www.typewolf.com/"],
    ["Godly (sites d'exception)", "https://godly.website/"],
    ["Lapa Ninja (landing pages)", "https://www.lapa.ninja/"],
    ["Design Systems Repo", "https://designsystemsrepo.com/"],
    ["The Brand Identity", "https://the-brandidentity.com/"],
    ["Layers.to (inspiration produit)", "https://layers.to/"],
    ["Figma Community", "https://www.figma.com/community"],
  ]],
  ["Design & couleurs", [
    ["Designspiration (couleurs)", "https://www.designspiration.com/"],
    ["Google Design", "https://design.google/"],
    ["Design Milk", "https://design-milk.com/"],
    ["Design Better", "https://www.designbetter.co/"],
    ["Design Week", "https://www.designweek.co.uk/"],
  ]],
  ["Développement", [
    ["MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web"],
    ["GitHub Explore", "https://github.com/explore"],
    ["web.dev (performance)", "https://web.dev/"],
    ["CSS-Tricks", "https://css-tricks.com/"],
    ["Can I Use", "https://caniuse.com/"],
    ["CodePen", "https://codepen.io/"],
    ["Stack Overflow", "https://stackoverflow.com/"],
    ["Vite (guide)", "https://vite.dev/guide/"],
    ["Chrome for Developers", "https://developer.chrome.com/docs/extensions/"],
    ["MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web"],
    ["GitHub Explore", "https://github.com/explore"],
  ]],
  ["Intelligence artificielle", [
    ["Hugging Face (modèles)", "https://huggingface.co/models"],
    ["OpenAI Research", "https://openai.com/research/"],
    ["Anthropic Research", "https://www.anthropic.com/research"],
    ["Papers with Code", "https://paperswithcode.com/"],
    ["Google AI", "https://ai.google/"],
    ["arXiv (machine learning)", "https://arxiv.org/list/cs.LG/recent"],
    ["Hugging Face (modèles)", "https://huggingface.co/models"],
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
];
const EXTRA_FOLDER = ["Archives à vérifier", [
  ["Ancienne documentation API", "https://example.com/archives/api-v1"],
  ["Guide supprimé", "https://example.com/guides/old-workflow"],
  ["Maquette expirée", "https://example.com/preview/retired"],
  ["Ressource déplacée", "https://example.com/resources/moved"],
]];
const DEAD_URLS = EXTRA_FOLDER[1].map(([, url]) => url);
const TOTAL_BOOKMARKS = [...DASHBOARD, EXTRA_FOLDER].reduce((n, [, entries]) => n + entries.length, 0);

const THUMB_URLS = [
  "https://www.designspiration.com/", "https://mobbin.com/", "https://www.awwwards.com/",
  "https://www.are.na/", "https://fontsinuse.com/", "https://www.typewolf.com/",
  "https://godly.website/", "https://designsystemsrepo.com/", "https://github.com/explore",
  "https://developer.mozilla.org/en-US/docs/Web", "https://web.dev/", "https://caniuse.com/",
];

const LIVE_TABS = [
  "https://developer.mozilla.org/en-US/docs/Web", "https://github.com/explore",
  "https://web.dev/", "https://developer.chrome.com/docs/extensions/", "https://mobbin.com/",
  "https://www.awwwards.com/", "https://linear.app/", "https://www.notion.so/",
  "https://huggingface.co/models", "https://www.typewolf.com/",
  "https://ourworldindata.org/", "https://excalidraw.com/",
];

const SAVED_SESSIONS = [
  { title: "Veille design — semaine 42", note: "", tags: ["design"], favorite: true, days: 0, group: ["Inspiration", "purple"],
    tabs: [["Awwwards (sites remarquables)", "https://www.awwwards.com/"], ["Godly (sites d'exception)", "https://godly.website/"], ["Layers.to (inspiration produit)", "https://layers.to/"], ["Typewolf (typographie)", "https://www.typewolf.com/"]] },
  { title: "Refonte landing — références", note: "Trois pistes retenues, présenter jeudi.", tags: ["projet", "landing"], favorite: false, days: 1, group: ["Références", "blue"],
    tabs: [["Figma Community", "https://www.figma.com/community"], ["Mobbin (interfaces mobiles)", "https://mobbin.com/"], ["Lapa Ninja (landing pages)", "https://www.lapa.ninja/"], ["The Brand Identity", "https://the-brandidentity.com/"]] },
  { title: "Docs extensions Chrome MV3", note: "", tags: ["dev"], favorite: false, days: 2, group: ["Documentation", "green"],
    tabs: [["Chrome for Developers", "https://developer.chrome.com/docs/extensions/"], ["MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web"], ["web.dev (performance)", "https://web.dev/"]] },
  { title: "Exploration IA locale", note: "", tags: ["ia"], favorite: false, days: 3, group: ["Recherche", "cyan"],
    tabs: [["Hugging Face (modèles)", "https://huggingface.co/models"], ["arXiv (machine learning)", "https://arxiv.org/list/cs.LG/recent"], ["Papers with Code", "https://paperswithcode.com/"]] },
  { title: "Nettoyage favoris — à trier", note: "", tags: [], favorite: false, days: 4, group: ["À trier", "yellow"], archived: true,
    tabs: [["Can I Use", "https://caniuse.com/"], ["CSS-Tricks", "https://css-tricks.com/"], ["CodePen", "https://codepen.io/"]] },
  { title: "Direction artistique — piste A", note: "Palette papier + hairline, valider les contrastes.", tags: ["design"], favorite: false, days: 6, group: ["DA", "pink"],
    tabs: [["Are.na (collections visuelles)", "https://www.are.na/"], ["Fonts In Use", "https://fontsinuse.com/"], ["Design Systems Repo", "https://designsystemsrepo.com/"]] },
  { title: "Stack front — décisions 2026", note: "", tags: ["dev"], favorite: false, days: 9, group: ["Choix", "blue"],
    tabs: [["Vite (guide)", "https://vite.dev/guide/"], ["web.dev (performance)", "https://web.dev/"], ["GitHub Explore", "https://github.com/explore"]] },
  { title: "Veille produit — outils", note: "", tags: ["veille"], favorite: false, days: 12, group: ["Outils", "orange"],
    tabs: [["Linear", "https://linear.app/"], ["Notion", "https://www.notion.so/"], ["Raycast Store", "https://www.raycast.com/store"]] },
  { title: "Références typographiques", note: "", tags: ["design"], favorite: false, days: 16, group: ["Typo", "purple"],
    tabs: [["Typewolf (typographie)", "https://www.typewolf.com/"], ["Fonts In Use", "https://fontsinuse.com/"], ["Design Systems Repo", "https://designsystemsrepo.com/"]] },
];

function allPairs() {
  return [...DASHBOARD, EXTRA_FOLDER].flatMap(([, entries]) => entries)
    .filter(([, url]) => !url.includes("example.com"));
}

function urlTitleMap() {
  const map = new Map();
  for (const [, entries] of [...DASHBOARD, EXTRA_FOLDER]) for (const [title, url] of entries) map.set(url, title);
  return map;
}

function buildArchive() {
  const pairs = allPairs();
  const months = {};
  const now = new Date();
  let serial = 0;
  const push = (ts, [title, url], ref) => {
    const d = new Date(ts);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const id = `demo-visit-${++serial}`;
    (months[month] ||= []).push({ id, title, url, ts, ref, transition: ref ? "link" : "typed" });
    return id;
  };
  for (let daysAgo = 209; daysAgo >= 0; daysAgo--) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo).getTime();
    const density = daysAgo < 14 ? 7 : daysAgo < 45 ? (daysAgo % 2 ? 3 : 4) : (daysAgo % 3 === 0 ? 3 : 1);
    let ref = null;
    for (let k = 0; k < density; k++) {
      const hour = 9 + ((k * 4 + daysAgo * 3) % 10);
      const minute = (daysAgo * 7 + k * 13) % 60;
      const pair = pairs[(daysAgo * 5 + k * 3) % pairs.length];
      ref = push(base + hour * 3600000 + minute * 60000, pair, ref && (daysAgo + k) % 4 !== 0 ? ref : null);
    }
  }
  for (const key of Object.keys(months)) months[key].sort((a, b) => a.ts - b.ts);
  return { months, total: serial };
}

/* ------------------------------------------------------------------ */
/* Assistances réseau (favicônes réelles, miniatures réelles)          */
/* ------------------------------------------------------------------ */
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchRealFavicons(urls) {
  const domains = [...new Set(urls.map((u) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
  }).filter(Boolean))];
  const out = {};
  await Promise.all(domains.map(async (domain) => {
    try {
      const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, {
        headers: { "User-Agent": BROWSER_UA }, redirect: "follow", signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100 || buf[0] === 0x3c) return;
      const mime = (res.headers.get("content-type") || "image/png").split(";")[0];
      out[domain] = `data:${mime};base64,${buf.toString("base64")}`;
    } catch { /* repli lettre */ }
  }));
  return out;
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
  const short = xml(String(title).replace(/\s*[—–-].*$/, "").slice(0, 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="23"/></filter></defs>
    <rect width="400" height="300" fill="url(#g)"/><circle cx="323" cy="74" r="92" fill="${light}" opacity=".28" filter="url(#b)"/>
    <path d="M0 240 Q140 180 400 278" fill="none" stroke="${light}" opacity=".15" stroke-width="60"/>
    <rect x="29" y="29" width="342" height="242" rx="13" fill="#fff" opacity=".12" stroke="#fff" stroke-opacity=".45"/>
    <circle cx="49" cy="49" r="4" fill="${light}"/><circle cx="62" cy="49" r="4" fill="#fff" opacity=".5"/><circle cx="75" cy="49" r="4" fill="#fff" opacity=".3"/>
    <path d="M29 67H371" stroke="#fff" stroke-opacity=".25"/>
    <text x="50" y="117" fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Arial,sans-serif" font-weight="700" font-size="27">${short}</text>
    <rect x="50" y="137" width="208" height="7" rx="4" fill="#fff" opacity=".43"/><rect x="50" y="155" width="154" height="7" rx="4" fill="#fff" opacity=".28"/>
    <rect x="50" y="203" width="86" height="30" rx="15" fill="${light}"/><rect x="149" y="203" width="73" height="30" rx="15" fill="#fff" opacity=".22"/>
    <circle cx="321" cy="201" r="32" fill="none" stroke="#fff" stroke-opacity=".48" stroke-width="9"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/* ------------------------------------------------------------------ */
/* Pipeline principal                                                  */
/* ------------------------------------------------------------------ */
async function main() {
  const argv = process.argv.slice(2);
  const sceneFilter = argv.find((a) => a.startsWith("--scene="))?.slice(8)
    || (argv.includes("--scene") ? argv[argv.indexOf("--scene") + 1] : null);
  const sceneList = sceneFilter == null ? null : (sceneFilter === "-" ? [] : sceneFilter.split(","));
  const want = (id) => sceneList === null || sceneList.includes(id);
  const loopOnly = argv.includes("--loop");
  const chrome = await findChrome();
  for (const dir of [SHOTS, join(SHOTS, "cws"), FRAMES, FIXED, ASSETS]) await mkdir(dir, { recursive: true });

  const manifest = JSON.parse(await readFile(join(EXTENSION, "manifest.json"), "utf8"));
  const id = [...createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32)]
    .map((d) => "abcdefghijklmnop"[parseInt(d, 16)]).join("");
  const report = {
    kit: "v4", extensionVersion: manifest.version_name,
    capturedAt: new Date().toISOString(),
    method: "Page.captureScreenshot de l'extension non empaquetée (dépôt), profil jetable Chrome for Testing, CDP",
    cosmeticInjections: [
      "Favicônes réelles Google S2 injectées au rendu (cache _favicon vide en profil jetable), repli lettre+dégradé",
      "Miniatures mshots indisponibles (403) : 12 sites chargés en onglets réels (400×300), repli SVG géométrique",
      "Curseur incrusté dans les frames de la boucle (les captures CDP n'incluent pas le pointeur)",
    ],
    data: "Jeu curé fictif : 46 favoris, 6 dossiers, 9 sessions enregistrées, 12 onglets en veille, archive de visites sur 7 mois",
    screenshots: [], frames: null, sources: {},
  };
  for (const file of ["manifest.json", "index.html", "style.css", "app.js", "sessions.js", "global-search.js", "dashboard.js", "dashboard.css"]) {
    report.sources[file] = createHash("sha256").update(await readFile(join(EXTENSION, file))).digest("hex");
  }

  const profile = await mkdtemp(join(tmpdir(), "pk-web-memory-v4-"));
  let child, cdp;
  try {
    child = spawn(chrome, [
      "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-sync",
      "--disable-background-networking", `--user-data-dir=${profile}`,
      `--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`,
      "--remote-debugging-port=0", "--window-size=1440,1000", "about:blank",
    ], { stdio: "ignore" });
    let port;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(`Chrome s'est arrêté (${child.exitCode})`);
      try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { /* démarrage */ }
      if (port) break;
      await pause(100);
    }
    if (!port) throw new Error("Port de débogage indisponible");
    const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    report.browser = browser.Browser;
    cdp = await CDP.connect(browser.webSocketDebuggerUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (fn, arg) => {
      const result = await send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (fn, label, timeout = 20000, arg) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(fn, arg)) return;
        await pause(120);
      }
      throw new Error(`Délai dépassé : ${label}`);
    };
    const click = (sel) => evaluate((s) => {
      const node = document.querySelector(s);
      if (!node) throw new Error(`contrôle absent : ${s}`);
      node.click();
      return true;
    }, sel);
    const rect = (sel, nth = 0) => evaluate(({ s, n }) => {
      const node = document.querySelectorAll(s)[n];
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, { s: sel, n: nth });

    const noToast = () => {
      const t = document.getElementById("toast");
      if (!t) return true;
      const s = getComputedStyle(t);
      const visible = s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05 && t.getBoundingClientRect().width > 0;
      return !visible;
    };

    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", SITE_VIEW);
    await send("Page.navigate", { url: `chrome-extension://${id}/index.html` });
    await waitFor(() => document.querySelector("#stat-total")?.textContent !== "—" && !!document.querySelector("#stat-total"), "démarrage extension");

    // ---- Préparation réseau (indépendante du profil jetable) ----
    let favicons = {};
    let thumbs = {};
    if (!SKIP_NET) {
      favicons = await fetchRealFavicons([...allPairs().map(([, u]) => u), ...THUMB_URLS]);
      console.log(`Favicônes S2 : ${Object.keys(favicons).length} domaines`);
    }

    // ---- Semis ----
    const archive = buildArchive();
    const titleOf = urlTitleMap();
    const checksFixture = Object.fromEntries(DEAD_URLS.map((url, i) => [url, { s: "dead", t: Date.now() - 2 * 86400000, ds: Date.now() - (i + 8) * 86400000 }]));
    const lastScanFixture = Date.now() - 2 * 86400000;
    const seedResult = await evaluate(async (payload) => {
      const tree = (await chrome.bookmarks.getTree())[0];
      const bar = tree.children.find((n) => n.id === "1") || tree.children[0];
      let count = 0;
      let dashboardRoot = null;
      for (const { name, entries, inDashboard } of payload.collections) {
        let parent = bar.id;
        if (inDashboard) {
          if (!dashboardRoot) dashboardRoot = (await chrome.bookmarks.create({ parentId: bar.id, title: "Tableau de bord" })).id;
          parent = dashboardRoot;
        }
        const folder = await chrome.bookmarks.create({ parentId: parent, title: name });
        for (const [title, url] of entries) { await chrome.bookmarks.create({ parentId: folder.id, title, url }); count++; }
      }
      const storage = {
        checks: payload.checks,
        thumbnails: payload.thumbs,
        "bs.sessions.library": payload.library,
        settings: { scanAutostart: false, thumbsMode: "mshots" },
        uiLang: "fr",
        hnavWindowDays: 0,
        [payload.indexKey]: payload.monthsIndex,
      };
      for (const [month, visits] of Object.entries(payload.months)) storage[payload.prefix + month] = visits;
      await chrome.storage.local.set(storage);
      return { bookmarks: count, folders: payload.collections.length, months: Object.keys(payload.months).length, visits: payload.monthsTotal };
    }, {
      collections: [
        ...DASHBOARD.map(([name, entries]) => ({ name, entries, inDashboard: true })),
        { name: EXTRA_FOLDER[0], entries: EXTRA_FOLDER[1], inDashboard: false },
      ],
      checks: checksFixture,
      thumbs: Object.fromEntries(allPairs().map(([title, url], i) => [url, { src: makeThumbnail(title, i), expires: Date.now() + 30 * 86400000, touched: Date.now() - i * 60000 }])),
      library: {
        sessions: SAVED_SESSIONS.map((s, i) => ({
          id: `demo-session-${i + 1}`, title: s.title, note: s.note || "", tags: s.tags || [], favorite: !!s.favorite,
          archived: !!s.archived, auto: false, createdAt: Date.now() - s.days * 86400000 - 3600000, updatedAt: Date.now() - s.days * 86400000,
          windows: [{ tabs: s.tabs.map(([title, url]) => ({ title, url, pinned: false, group: "", groupTitle: s.group[0], groupColor: s.group[1] })) }],
        })),
        settings: { autosave: false, sleepMinutes: 0, previews: true, dailySave: false, dailyHour: 7, dailyClose: false, dailyExport: false, newtab: "off" },
        migratedAt: Date.now(),
      },
      prefix: "bs.hnav.archive.",
      indexKey: "bs.hnav.archive.index",
      months: archive.months,
      monthsIndex: Object.keys(archive.months).sort(),
      monthsTotal: archive.total,
    });
    console.log("Semis :", JSON.stringify(seedResult));

    // Visites réelles du jour (titres + historique Chrome), puis miniatures.
    await evaluate(async (urls) => {
      for (const url of urls) { try { await chrome.history.addUrl({ url }); } catch { /* schéma refusé */ } }
      return urls.length;
    }, allPairs().map(([, u]) => u));
    if (!SKIP_NET) {
      for (const url of THUMB_URLS) {
        try {
          const tabId = await evaluate(async (u) => (await chrome.tabs.create({ url: u, active: false })).id, url);
          await waitFor(async (id2) => {
            try { const t = await chrome.tabs.get(id2); return t.status === "complete"; } catch { return true; }
          }, `miniature ${url}`, 9000, tabId).catch(() => {});
          await pause(700);
          const { targetInfos } = await cdp.send("Target.getTargets");
          const origin = new URL(url).origin;
          const target = targetInfos.find((t) => t.type === "page" && t.url.startsWith(origin));
          if (target) {
            const { sessionId: ts } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
            await cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 300, deviceScaleFactor: 1, mobile: false }, ts);
            await pause(300);
            const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 74 }, ts);
            thumbs[url] = `data:image/jpeg;base64,${shot.data}`;
            await cdp.send("Target.detachFromTarget", { sessionId: ts }).catch(() => {});
          }
          await evaluate(async (id2) => { try { await chrome.tabs.remove(id2); } catch { /* déjà fermée */ } }, tabId);
        } catch { /* site indisponible : repli SVG */ }
      }
      await evaluate(async (entries) => {
        const current = (await chrome.storage.local.get("thumbnails")).thumbnails || {};
        Object.assign(current, entries);
        await chrome.storage.local.set({ thumbnails: current });
      }, thumbs);
      console.log(`Miniatures réelles : ${Object.keys(thumbs).length}`);
    }

    // Onglets en veille pour la session en cours.
    const liveCount = await evaluate(async (urls) => {
      let kept = 0;
      for (const url of urls) {
        try {
          const tab = await chrome.tabs.create({ url, active: false });
          for (let i = 0; i < 60; i++) {
            try { const t = await chrome.tabs.get(tab.id); if (t.status === "complete") break; } catch { break; }
            await new Promise((r) => setTimeout(r, 100));
          }
          await chrome.tabs.discard(tab.id);
          kept++;
        } catch { /* onglet indisponible */ }
      }
      return kept;
    }, LIVE_TABS);
    console.log(`Onglets en veille : ${liveCount}`);

    // ---- Injection favicônes (cosmétique, documentée) + déverrouillage ----
    const patchFavicons = () => evaluate((real) => {
      const palettes = [
        ["#8ab4f8", "#1a73e8"], ["#c4b5fd", "#7c3aed"], ["#7dd3fc", "#0284c7"],
        ["#fcd34d", "#d97706"], ["#6ee7b7", "#059669"], ["#fca5a5", "#dc2626"],
        ["#a5b4fc", "#4f46e5"], ["#f9a8d4", "#db2777"], ["#5eead4", "#0d9488"],
        ["#fdba74", "#ea580c"], ["#d8b4fe", "#9333ea"], ["#86efac", "#16a34a"],
      ];
      const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
      window.__demoFavicon = (url) => {
        let host = String(url);
        try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* URL brute */ }
        const key = host.split(".").slice(-2).join(".") || host;
        if (real[host] || real[key]) return real[host] || real[key];
        const [light, dark] = palettes[hash(key) % palettes.length];
        const letter = (host[0] || "?").toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="44" font-family="-apple-system,BlinkMacSystemFont,Arial,sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
        return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
      };
      faviconUrl = (url) => window.__demoFavicon(url);
      window.__favSwap = () => {
        for (const img of document.querySelectorAll('img[src*="_favicon/?pageUrl="]')) {
          const m = /pageUrl=([^&]+)/.exec(img.getAttribute("src") || "");
          if (m) img.src = window.__demoFavicon(decodeURIComponent(m[1]));
        }
      };
      window.__favSwap();
    }, favicons);

    // ---- Capture ---- 
    const shot = async (relpath, view, ready, { polish } = {}) => {
      await send("Emulation.setDeviceMetricsOverride", view);
      await send("Page.bringToFront");
      await waitFor(ready, relpath, 25000);
      await evaluate(() => document.fonts.ready.then(() => true));
      await waitFor(noToast, `${relpath}: pas de toast`);
      await patchFavicons();
      await waitFor(() => [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return !img.getAttribute("src") || img.complete || r.width === 0 || r.bottom < 0 || r.top > innerHeight;
      }), `${relpath}: images`);
      if (polish) await evaluate(polish);
      await pause(180);
      await waitFor(noToast, `${relpath}: pas de toast (final)`);
      await send("Page.bringToFront");
      const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const bytes = Buffer.from(data, "base64");
      const file = join(SHOTS, relpath);
      await writeFile(file, bytes);
      report.screenshots.push({ file: relpath, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, view: `${view.width}x${view.height}` });
      console.log(`✓ ${relpath} (${bytes.length} o)`);
      await send("Emulation.setDeviceMetricsOverride", SITE_VIEW);
    };

    await send("Page.reload", { ignoreCache: true });
    await waitFor((expected) => document.querySelector("#stat-total")?.textContent === String(expected), `favoris semés (${TOTAL_BOOKMARKS})`, 20000, TOTAL_BOOKMARKS);
    // Le rescan de l'ancienne instance d'application élague « checks » des URL qu'il
    // ne voyait pas encore actives pendant le semis : on réécrit les états de scan
    // puis on recharge pour un démarrage propre.
    await evaluate(async (payload) => {
      const stored = (await chrome.storage.local.get("checks")).checks || {};
      Object.assign(stored, payload.checks);
      await chrome.storage.local.set({ checks: stored, lastScan: payload.lastScan });
    }, { checks: checksFixture, lastScan: lastScanFixture });
    await send("Page.reload", { ignoreCache: true });
    await waitFor((expected) => document.querySelector("#stat-total")?.textContent === String(expected), `favoris semés après rescelle (${TOTAL_BOOKMARKS})`, 20000, TOTAL_BOOKMARKS);
    await click('.rail-tab[data-section="bookmarks"]');
    await click('.header-tab[data-tab="inventory"]');

    // ---- Scènes (chaque scène est indépendante : une erreur n'arrête pas le kit) ----
    const runScene = async (id, fn) => {
      if (!want(id)) return;
      try { await fn(); }
      catch (error) {
        console.error(`✗ scène ${id} : ${error.message}`);
        (report.errors ||= []).push(`${id}: ${error.message}`);
        try {
          const stats = await evaluate(async (sid) => {
            const stored = await chrome.storage.local.get(["checks", "lastScan"]).catch(() => ({}));
            return {
              scene: sid, url: location.href,
              activeRail: document.querySelector(".rail-tab.active")?.dataset.section || null,
              activeTab: document.querySelector(".header-tab.active")?.dataset.tab || null,
              cards: document.querySelectorAll("#gallery-grid .gcard").length,
              cardImgs: document.querySelectorAll("#gallery-grid .gcard img").length,
              deadRows: document.querySelectorAll("#dead-list .row").length,
              deadChildren: document.querySelectorAll("#dead-list > *").length,
              statDead: document.querySelector("#stat-dead")?.textContent || null,
              deadCount: document.querySelector("#dead-count")?.textContent || null,
              checksStored: Object.keys(stored.checks || {}).length,
              lastScan: stored.lastScan || null,
            };
          }, id);
          console.error("diag:", JSON.stringify(stats));
          await send("Page.bringToFront");
          const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
          await writeFile(join(OUT, "anim", `debug-${id}.png`), Buffer.from(data, "base64"));
        } catch { /* diagnostic indisponible */ }
      }
    };

    await runScene("inventaire", async () => {
      await shot("01-inventaire.png", SITE_VIEW, () => document.querySelectorAll("#folder-tree .rank-row").length >= 5);
    });
    await runScene("recherche", async () => {
      await click("#btn-global-search");
      await evaluate(() => { const input = document.querySelector("#global-search-input"); input.value = "design"; input.dispatchEvent(new Event("input", { bubbles: true })); });
      await shot("02-recherche.png", SITE_VIEW, () => document.querySelectorAll("#global-search .gs-row").length >= 4);
      await shot("cws/cws-04-recherche.png", CWS_VIEW, () => document.querySelectorAll("#global-search .gs-row").length >= 4);
      await click("#global-search-close");
    });
    await runScene("historique", async () => {
      await click('.rail-tab[data-section="historynav"]');
      await shot("03-historique.png", SITE_VIEW, () => document.querySelectorAll(".hg-row").length >= 6);
      await shot("cws/cws-03-historique.png", CWS_VIEW, () => document.querySelectorAll(".hg-row").length >= 6);
    });
    await runScene("galerie", async () => {
      await click('.rail-tab[data-section="bookmarks"]');
      await click('.header-tab[data-tab="gallery"]');
      await shot("04-galerie.png", SITE_VIEW, () => {
        const cards = document.querySelectorAll("#gallery-grid .gcard").length;
        const visible = [...document.querySelectorAll("#gallery-grid .gcard img")].filter((img) => {
          const r = img.getBoundingClientRect();
          return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
        });
        return cards >= 12 && visible.length >= 6 && visible.every((img) => img.complete);
      });
    });
    await runScene("doublons", async () => {
      await click('.rail-tab[data-section="bookmarks"]');
      await click('.header-tab[data-tab="dedupe"]');
      await shot("05-doublons.png", SITE_VIEW, () => document.querySelectorAll("#dedupe-groups .group").length >= 3);
      await shot("cws/cws-05-doublons.png", CWS_VIEW, () => document.querySelectorAll("#dedupe-groups .group").length >= 3);
    });
    await runScene("sessions", async () => {
      await click('.rail-tab[data-section="sessions"]');
      await shot("06-sessions.png", SITE_VIEW, () => document.querySelectorAll("#sessions-root .tl-session").length >= 5 && document.querySelectorAll("#sessions-root .tl-fav").length >= 8);
      await shot("cws/cws-01-sessions.png", CWS_VIEW, () => document.querySelectorAll("#sessions-root .tl-session").length >= 5 && document.querySelectorAll("#sessions-root .tl-fav").length >= 8);
    });
    await runScene("morts", async () => {
      await click('.rail-tab[data-section="bookmarks"]');
      await click('.header-tab[data-tab="dead"]');
      await shot("07-liens-morts.png", SITE_VIEW, () => document.querySelectorAll("#dead-list .row").length >= 4);
    });
    await runScene("backup", async () => {
      await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: join(profile, "exports") });
      await click("#btn-export-json");
      await waitFor(() => document.querySelectorAll("#backup-history .history-row").length >= 1, "export JSON");
      await click("#btn-export-html");
      await click('.header-tab[data-tab="backup"]');
      await shot("08-backup.png", SITE_VIEW, () => document.querySelectorAll("#backup-history .history-row").length >= 2);
    });
    await runScene("dashboard", async () => {
      await click('.rail-tab[data-section="dashboard"]');
      await shot("09-dashboard.png", SITE_VIEW, () => document.querySelectorAll(".db-cat").length >= 4 && document.querySelectorAll(".db-cat .db-link").length >= 30);
      await shot("cws/cws-02-tableau-de-bord.png", CWS_VIEW, () => document.querySelectorAll(".db-cat").length >= 4 && document.querySelectorAll(".db-cat .db-link").length >= 30);
    });

    // ---- Boucle animée (frames + curseur) ----
    if (sceneList === null || sceneList.length === 0 || loopOnly) {
      await click('.rail-tab[data-section="bookmarks"]');
      await click('.header-tab[data-tab="inventory"]');
      await send("Emulation.setDeviceMetricsOverride", CWS_VIEW);
      await patchFavicons();
      await waitFor(() => document.querySelectorAll("#folder-tree .rank-row").length >= 5, "boucle : inventaire");
      const frames = [];
      let cursor = { x: 640, y: 700 };
      const snap = async () => {
        await send("Page.bringToFront");
        const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
        const name = `frame_${String(frames.length + 1).padStart(4, "0")}.png`;
        await writeFile(join(FRAMES, name), Buffer.from(data, "base64"));
        frames.push({ file: name, x: cursor.x, y: cursor.y });
      };
      const moveTo = async (x, y, steps = 6) => {
        for (let i = 1; i <= steps; i++) {
          cursor = { x: Math.round(cursor.x + (x - cursor.x) * (i / steps)), y: Math.round(cursor.y + (y - cursor.y) * (i / steps)) };
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cursor.x, y: cursor.y, buttons: 0 });
          await snap();
        }
      };
      const mouseClick = async () => {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cursor.x, y: cursor.y, button: "left", buttons: 1, clickCount: 1 });
        await snap();
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cursor.x, y: cursor.y, button: "left", buttons: 0, clickCount: 1 });
        await snap();
      };
      for (let i = 0; i < 8; i++) await snap();               // respiration initiale
      const searchBtn = await rect("#btn-global-search");
      await moveTo(searchBtn.x, searchBtn.y, 8);               // vers « Rechercher »
      await mouseClick();                                      // ouverture de la recherche
      await waitFor(() => document.querySelector("#global-search .gs-row, #global-search-input"), "boucle : recherche ouverte");
      for (let i = 0; i < 4; i++) await snap();
      const input = await rect("#global-search-input");
      await moveTo(input.x, input.y, 3);
      await mouseClick();
      for (const ch of "design") {
        await send("Input.dispatchKeyEvent", { type: "char", text: ch });
        await pause(70);
        await snap();
      }
      await waitFor(() => document.querySelectorAll("#global-search .gs-row").length >= 4, "boucle : résultats");
      for (let i = 0; i < 6; i++) await snap();
      const row = await rect("#global-search .gs-row", 1);
      await moveTo(row.x, row.y, 6);
      for (let i = 0; i < 8; i++) await snap();                // survol
      await mouseClick();                                      // ouverture du résultat
      await pause(400);
      for (let i = 0; i < 10; i++) await snap();
      report.frames = { count: frames.length, files: frames };
      await writeFile(join(FRAMES, "frames.json"), JSON.stringify(frames, null, 1));
      console.log(`✓ ${frames.length} frames de boucle`);

      // Curseur incrusté (les captures CDP n'incluent pas le pointeur)
      const cursorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 14 20"><path d="M1 1 L1 17.2 L5.2 13.6 L8 19.4 L10.6 18.2 L7.9 12.6 L13 12.6 Z" fill="#111" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
      const cursorPath = join(OUT, "tools/cursor.png");
      await writeFile(join(OUT, "tools/cursor.svg"), cursorSvg);
      execFileSync("magick", ["-background", "none", join(OUT, "tools/cursor.svg"), cursorPath]);
      for (const frame of frames) {
        execFileSync("magick", [join(FRAMES, frame.file), cursorPath, "-geometry", `+${frame.x - 2}+${frame.y - 2}`, "-composite", join(FIXED, frame.file)]);
      }
      console.log(`✓ frames compositées (curseur) dans anim/frames-fixed/`);
    }

    // ---- Assets (tuile, marquee, bannière, carte) ----
    if (!sceneFilter || want("assets")) {
      const { targetId: assetTarget } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId: assetSession } = await cdp.send("Target.attachToTarget", { targetId: assetTarget, flatten: true });
      const sendA = (m, p) => cdp.send(m, p, assetSession);
      const assets = [
        ["tile", 440, 280, "cws-tile-440x280.png"],
        ["marquee", 1400, 560, "cws-marquee-1400x560.png"],
        ["banner", 1544, 500, "banner-1544x500.png"],
        ["card", 1200, 630, "card-1200x630.png"],
      ];
      for (const [hash, w, h, name] of assets) {
        await sendA("Page.enable");
        await sendA("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await sendA("Page.navigate", { url: "about:blank" });
        await pause(150);
        await sendA("Page.navigate", { url: `file://${join(OUT, "tools/assets.html")}#${hash}` });
        await pause(1100);
        await sendA("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
        await pause(400);
        const { data } = await sendA("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
        const bytes = Buffer.from(data, "base64");
        await writeFile(join(ASSETS, name), bytes);
        report.screenshots.push({ file: `assets/${name}`, bytes: bytes.length, view: `${w}x${h}` });
        console.log(`✓ assets/${name}`);
      }
      await cdp.send("Target.closeTarget", { targetId: assetTarget }).catch(() => {});
    }

    await writeFile(join(OUT, "tools/capture-report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`Terminé : ${report.screenshots.length} fichiers.`);
  } finally {
    cdp?.socket.close();
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), pause(4000)]);
      if (child.exitCode === null) { child.kill("SIGKILL"); await new Promise((resolve) => child.once("exit", resolve)); }
    }
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
