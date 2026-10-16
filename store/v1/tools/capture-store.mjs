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

// Vraies images pour les captures : le service mshots est bloqué ici (403).
// On charge chaque site dans un onglet réel et on capture 400×300 ; les
// favicônes viennent de Google S2 (UA navigateur requis).
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
      if (buf.length < 100 || buf[0] === 0x3c) return; // HTML d'erreur
      const mime = (res.headers.get("content-type") || "image/png").split(";")[0];
      out[domain] = `data:${mime};base64,${buf.toString("base64")}`;
    } catch { /* favicône indisponible : repli lettre */ }
  }));
  return out;
}

async function captureRealThumbs(cdp, sessionId, urls) {
  const out = {};
  for (const url of urls) {
    try {
      const tabId = await evaluate(cdp, sessionId, async (u) => (await chrome.tabs.create({ url: u, active: false })).id, url);
      await waitFor(cdp, sessionId, async (id) => {
        try { const tab = await chrome.tabs.get(id); return tab.status === "complete"; } catch { return true; }
      }, `miniature ${url}`, 12000).catch(() => {});
      await PAUSE(800);
      const { targetInfos } = await cdp.send("Target.getTargets");
      const origin = new URL(url).origin;
      const target = targetInfos.find((t) => t.type === "page" && t.url.startsWith(origin))
        || targetInfos.find((t) => t.type === "page" && t.url.startsWith(new URL(url).hostname));
      if (target) {
        const { sessionId: ts } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 300, deviceScaleFactor: 1, mobile: false }, ts);
        await PAUSE(300);
        const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 74 }, ts);
        out[url] = `data:image/jpeg;base64,${shot.data}`;
        await cdp.send("Target.detachFromTarget", { sessionId: ts }).catch(() => {});
      }
      await evaluate(cdp, sessionId, async (id) => { try { await chrome.tabs.remove(id); } catch { /* déjà fermée */ } }, tabId);
    } catch { /* site indisponible : repli SVG */ }
  }
  return out;
}

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
    id: `demo-session-${i + 1}`, title: name, note: "", tags: [], favorite: i === 0,
    archived: false, auto: false, createdAt: now - days * 86400000, updatedAt: now - days * 86400000,
    windows: [{ tabs: tabs.map(([title, url, groupTitle, groupColor]) => ({ title, url, pinned: false, group: "", groupTitle, groupColor })) }],
  }));
  return {
    collections: COLLECTIONS, checks, thumbnails, sessions: saved,
    // La migration « bs.sessions » a déjà tourné au démarrage du service worker :
    // la bibliothèque doit être écrite directement au format actuel.
    library: { sessions: saved, settings: { autosave: false, sleepMinutes: 0, previews: true, dailySave: false, dailyHour: 7, dailyClose: false }, migratedAt: now },
  };
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
  return evaluate(cdp, session, async ({ collections, checks, thumbnails, library }) => {
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
      "bs.sessions.library": library,
      "settings": { scanAutostart: false, thumbsMode: "favicon" },
      "uiLang": "fr",
      "hnavWindowDays": 0,
    });
    return { bookmarks: count, folders: collections.length, deadLinks: Object.keys(checks).length, sessions: library?.sessions?.length ?? 0 };
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
    // Onglets ouverts puis mis en veille : favicônes et titres conservés,
    // mais aucun rendu continu des sites réels — la machine de capture reste
    // réactive et l'état « en veille » s'affiche dans la timeline.
    let kept = 0;
    for (const url of urls) {
      try {
        const tab = await chrome.tabs.create({ url, active: false });
        await chrome.tabs.discard(tab.id);
        kept++;
      } catch { /* site unavailable */ }
    }
    return kept;
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

// Sur un profil jetable, l'API _favicon de Chrome n'a aucun cache : toutes les
// favicônes sortent vides. On injecte les VRAIES favicônes (Google S2), avec
// repli lettre + dégradé si le domaine est indisponible — via deux voies :
// remplacement de la fonction globale faviconUrl (app.js, global-search.js) et
// balayage DOM des <img src*="_favicon/…"> construites en dur (sessions.js).
async function patchFavicons(cdp, session, favicons, thumbs = {}) {
  await evaluate(cdp, session, (real, thumbs) => {
    window.__realThumb = thumbs;
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
    // Débloque les panneaux à défilement interne (listes de l'inventaire,
    // historique de sauvegarde…) : la page s'étend alors à sa vraie hauteur
    // et la capture pleine hauteur ne coupe plus le bas des vues.
    if (!document.getElementById("__capture-unclip")) {
      const style = document.createElement("style");
      style.id = "__capture-unclip";
      style.textContent = [
        "html, body { height: auto !important; min-height: 0 !important; }",
        "#tab-inventory .rank-list, .backup-history-panel, .gs-results {",
        "  max-height: none !important; overflow: visible !important; }",
      ].join("\\n");
      document.head.append(style);
    }
  }, favicons, thumbs);
}

async function capture(cdp, session, name, ready, polish) {
  await waitFor(cdp, session, ready, name);
  // Dernier balayage (les rendus asynchrones réintroduisent des _favicon)
  // puis retouche propre à la vue.
  await evaluate(cdp, session, () => window.__favSwap?.());
  if (polish) await evaluate(cdp, session, polish);
  // Capture PLEINE HAUTEUR : le viewport 800 coupait le bas des vues.
  // On mesure la hauteur réelle du contenu, on redimensionne, on attend
  // les images (lazy désormais visibles) puis on capture.
  const full = await evaluate(cdp, session, () => Math.min(
    Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)),
    4000,
  ));
  await cdp.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, height: full }, session);
  await PAUSE(300);
  await waitFor(cdp, session, () => [...document.images].every((img) => {
    if (!img.getAttribute("src") || img.complete) return true;
    const r = img.getBoundingClientRect();
    return r.width === 0 || r.bottom < 0 || r.top > innerHeight;
  }), `${name}: images`);
  await PAUSE(150);
  if (process.env.DIAG) console.error(`DIAG ${name}`, JSON.stringify(await evaluate(cdp, session, () => {
    const t = { data: 0, favicon: 0, http: 0, other: 0, fallbackLetters: 0, hiddenFavImgs: 0 };
    for (const i of document.images) {
      const src = i.getAttribute("src") || "";
      if (src.startsWith("data:")) t.data++;
      else if (src.includes("_favicon")) { t.favicon++; if (i.classList.contains("hidden")) t.hiddenFavImgs++; }
      else if (src.startsWith("http")) t.http++;
      else t.other++;
    }
    t.fallbackLetters = document.querySelectorAll(".favicon-fallback:not(.hidden)").length;
    t.clipped = [...document.querySelectorAll("main *")].filter((el) => el.scrollHeight > el.clientHeight + 12 && el.clientHeight > 40 && getComputedStyle(el).overflow.includes("auto"))
      .map((el) => `${el.id || String(el.className).split(" ")[0]}:${el.scrollHeight}>${el.clientHeight}`).slice(0, 6);
    return t;
  })));
  const data = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, session);
  await cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT, session);
  const file = join(OUTPUT, name);
  await writeFile(file, Buffer.from(data.data, "base64"));
  console.log(`✓ ${name} (${full}px)`);
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
    // Vrais visuels : miniatures capturées depuis les sites réels (mshots est
    // bloqué en 403 ici) et favicônes S2. Les onglets vivants n'existent pas
    // encore : la correspondance par URL est donc unique.
    const thumbUrls = [...new Map(demo.collections.flatMap(([, entries]) => entries).map(([, url]) => [url, url])).keys()].slice(0, 16);
    console.error(`-- miniatures réelles : ${thumbUrls.length} sites…`);
    const [realThumbs, realFavicons] = await Promise.all([
      captureRealThumbs(cdp, sessionId, thumbUrls),
      fetchRealFavicons(thumbUrls),
    ]);
    const seededAt = Date.now();
    for (const [url, src] of Object.entries(realThumbs)) {
      demo.thumbnails[url] = { src, expires: seededAt + 30 * 86400000, touched: seededAt };
    }
    console.error(`-- ${Object.keys(realThumbs).length} miniatures, ${Object.keys(realFavicons).length} favicônes réelles`);
    if (process.env.SKIP_LIB) delete demo.library;
    report.fixture = await seedChrome(cdp, sessionId, demo);
    report.historySeeded = await seedHistory(cdp, sessionId, demo);
    if (!process.env.SKIP_TABS) report.liveTabsSeeded = await seedOpenTabs(cdp, sessionId);
    // Les événements bookmarks déclenchent une réanalyse asynchrone du premier
    // onglet déjà ouvert. Réappliquer les statuts fictifs une fois ce travail fini.
    await PAUSE(1000);
    await evaluate(cdp, sessionId, async (checks) => chrome.storage.local.set({ checks }), demo.checks);
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
    await waitFor(cdp, sessionId, () => document.readyState === "complete" && document.querySelector("#stat-total")?.textContent === "46", "données fictives chargées");
    await patchFavicons(cdp, sessionId, realFavicons, realThumbs);
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
    if (process.env.FAST) { console.log("FAST-OK"); process.exit(0); }

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
    // Timeline refondue (tl-*) : les miniatures par ligne et l'aperçu de
    // session passent par le service worker puis mshots en ligne — aucun des
    // deux n'est disponible ici. thumbsMode "favicon" coupe le repli réseau ;
    // une fois fillThumbs passé (data-filled), on injecte les miniatures de
    // démonstration (mêmes dégradés que la galerie) et l'aperçu de session.
    report.screenshots.push(await capture(cdp, sessionId, "06-sessions.png", () => document.querySelectorAll("#sessions-root .tl-session").length >= 3
      && document.querySelectorAll("#sessions-root .tl-fav").length >= 5
      && document.querySelectorAll("#sessions-root .tl-thumb:not([data-filled])").length === 0, () => {
      const PAL = [["#111827", "#344ca2", "#9ec5ff"], ["#1c1a35", "#7a3ff1", "#f3b9ff"], ["#102229", "#138f95", "#a1f4dc"], ["#291721", "#cf557e", "#ffd4b7"], ["#1a2419", "#72a756", "#e3fdb1"], ["#1c1b25", "#776bcb", "#dcd6ff"]];
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
      const b64 = (svg) => `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
      const demo = (title, i) => {
        const [dark, mid, light] = PAL[i % PAL.length];
        const short = String(title || "Page").replace(/\s*[—–-].*$/, "").slice(0, 22) || "Page";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="330" cy="66" r="80" fill="${light}" opacity=".25"/><rect x="29" y="29" width="342" height="242" rx="13" fill="#fff" opacity=".1" stroke="#fff" stroke-opacity=".4"/><text x="50" y="112" fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Arial,sans-serif" font-weight="700" font-size="25">${esc(short)}</text><rect x="50" y="136" width="200" height="7" rx="4" fill="#fff" opacity=".4"/><rect x="50" y="154" width="150" height="7" rx="4" fill="#fff" opacity=".25"/><rect x="50" y="198" width="84" height="28" rx="14" fill="${light}"/></svg>`;
        return b64(svg);
      };
      const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(url); } };
      let i = 0;
      for (const row of document.querySelectorAll("#sessions-root .tl-row")) {
        const img = row.querySelector(".tl-thumb img");
        const real = window.__realThumb?.[row.dataset.url];
        if (img) img.src = real || demo(row.dataset.title, i);
        row.querySelector(".tl-thumb-fallback")?.remove();
        i++;
      }
      for (const block of document.querySelectorAll("#sessions-root .tl-session")) {
        const first = block.querySelector(".tl-row");
        const fig = block.querySelector(".tl-preview");
        const shot = fig?.querySelector(".tl-preview-shot");
        if (!first || !fig || !shot) continue;
        fig.dataset.url = first.dataset.url;
        shot.replaceChildren(Object.assign(document.createElement("img"), { src: window.__realThumb?.[first.dataset.url] || demo(first.dataset.title, 0) }));
        fig.querySelector("figcaption").textContent = host(first.dataset.url);
      }
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

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
