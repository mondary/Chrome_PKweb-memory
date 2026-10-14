// Test navigateur du Tableau de bord : vraie extension chargée dans un profil
// Chrome jetable (même approche que store/website/tools/capture.mjs), favoris de
// démonstration créés via les API Chrome, aucune donnée réelle touchée.
//
// Il vérifie le modèle à plat (catégorie = préfixe de nom, sous-dossier hérité
// aplati automatiquement, catégorie vide conservée en réglage local, liens sans
// préfixe), l'ouverture via le réglage « Page d'accueil », les écritures (ajout
// d'onglet, lien manuel, création et renommage — renommer une catégorie réécrit
// les préfixes —, suppression vers la poubelle), le filtre de recherche, la
// puce-favicon du dossier, et surtout la sémantique de position du
// glisser-déposer — là où chrome.bookmarks.move se comporte de façon non
// évidente pour un déplacement dans un même dossier.
//
// Chrome for Testing est requis ; sans lui le test est ignoré (CHROME_BIN pour
// imposer un binaire). Captures d'écran facultatives : DASHBOARD_SHOTS=/dossier.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = process.env.DASHBOARD_SHOTS || null;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Un dossier « Dashboard » dans la barre : des liens à plats dont le préfixe
// « Catégorie — » fait la catégorie, une catégorie vide (réglage local), deux
// liens sans préfixe, un sous-dossier hérité que l'app doit aplatir et un bloc
// dédié au glisser-déposer.
const SEED = [
  ["Inspiration", [["60fps", "https://60fps.design/"], ["Awwwards", "https://www.awwwards.com/"], ["Cosmos", "https://www.cosmos.so/"], ["Curated", "https://www.curated.design/"]]],
  ["AI Code", [["Bolt", "https://bolt.new/"], ["Claude Code", "https://claude.com/product/claude-code"], ["Cline", "https://cline.bot/"]]],
  ["Fonts", [["Fonts In Use", "https://fontsinuse.com/"], ["Free Faces", "https://www.freefaces.gallery/"]]],
  ["Outils", [["Regex", "https://regex101.com/"], ["Can I Use", "https://caniuse.com/"]]],
];

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

test("Tableau de bord : rendu, édition et glisser-déposer", { timeout: 300000, skip: chrome ? false : "Chrome for Testing introuvable (voir CHROME_BIN)" }, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), "pk-dashboard-"));
  const manifest = JSON.parse(await readFile(join(EXTENSION, "manifest.json"), "utf8"));
  const id = [...createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32)]
    .map((d) => "abcdefghijklmnop"[parseInt(d, 16)]).join("");
  const url = `chrome-extension://${id}/index.html`;
  const errors = [];
  let child;
  try {
    child = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-sync",
      "--disable-background-networking", `--user-data-dir=${profile}`, `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`, "--remote-debugging-port=0", "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
    let port;
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, `Chrome s'est arrêté (code ${child.exitCode})`);
      try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { /* démarrage */ }
      if (port) break;
      await pause(100);
    }
    assert.ok(port, "port de débogage Chrome indisponible");
    const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const cdp = await CDP.connect(browser.webSocketDebuggerUrl);
    cdp.socket.addEventListener("message", (raw) => {
      const data = JSON.parse(raw.data);
      if (data.method === "Runtime.exceptionThrown") errors.push(data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text);
    });
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    const evaluate = async (fn, arg) => {
      const result = await send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (fn, label) => {
      for (let i = 0; i < 150; i++) { if (await evaluate(fn)) return; await pause(100); }
      throw new Error(`Élément attendu absent : ${label}`);
    };
    const shot = async (name) => {
      if (!SHOTS) return;
      await pause(300);
      const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(join(SHOTS, name), Buffer.from(data, "base64"));
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await waitFor(() => !!document.querySelector("#stat-total"), "démarrage de l'extension");

    const seed = await evaluate(async (collections) => {
      const bar = (await chrome.bookmarks.getTree())[0].children.find((node) => node.id === "1");
      const dash = await chrome.bookmarks.create({ parentId: bar.id, title: "Dashboard" });
      // Liens à plats : le préfixe « Catégorie — » fait la catégorie.
      for (const [cat, entries] of collections) {
        for (const [title, url] of entries) await chrome.bookmarks.create({ parentId: dash.id, title: `${cat} — ${title}`, url });
      }
      // Un sous-dossier hérité : l'app doit l'aplatir au premier affichage.
      const legacy = await chrome.bookmarks.create({ parentId: dash.id, title: "Dev" });
      await chrome.bookmarks.create({ parentId: legacy.id, title: "Notes", url: "https://exemple.test/notes" });
      await chrome.bookmarks.create({ parentId: dash.id, title: "GitHub", url: "https://github.com/" });
      await chrome.bookmarks.create({ parentId: dash.id, title: "Accueil perso", url: "https://mondary.design/" });
      for (const letter of ["a", "b", "c", "d", "e"]) await chrome.bookmarks.create({ parentId: dash.id, title: `DnD — ${letter}`, url: `https://exemple.test/${letter}` });
      await chrome.storage.local.set({
        uiLang: "fr",
        settings: { scanAutostart: false, thumbsMode: "favicon" },
        "bs.sessions.library": { sessions: [], settings: { autosave: false, previews: false, sleepMinutes: 0, dailySave: false, dailyHour: 7, dailyClose: false, newtab: "dashboard" } },
        "bs.dashboard": { folderId: dash.id, openIn: "new", cats: ["Vide"] },
      });
      return { dash: dash.id, legacy: legacy.id };
    }, SEED);

    // Rechargement : le réglage « Page d'accueil » doit ouvrir le tableau de bord.
    await send("Page.navigate", { url });
    await waitFor(() => !!document.querySelector("#stat-total"), "démarrage de l'extension");
    await waitFor(() => document.querySelector(".rail-tab.active")?.dataset.section === "dashboard", "ouverture sur le tableau de bord");
    await waitFor(() => document.querySelectorAll(".db-cat").length >= 8, "rendu des catégories");

    await t.test("la section s'ouvre comme page d'accueil, avec son en-tête", async () => {
      assert.equal(await evaluate(() => document.querySelector("#section-dashboard").classList.contains("hidden")), false);
      assert.equal(await evaluate(() => document.querySelector("#header-dashboard").classList.contains("hidden")), false);
      assert.equal(await evaluate(() => document.querySelector("#app-title").textContent.trim()), "Tableau de bord");
      assert.equal(await evaluate(() => document.querySelector("header").getBoundingClientRect().height), 97, "l'en-tête garde la hauteur des autres sections");
    });

    await t.test("catégories par préfixe, sous-dossier aplati, catégorie vide et liens racine", async () => {
      const view = await evaluate(() => ({
        chip: document.querySelector(".db-chip")?.textContent.trim(),
        chipGlyph: document.querySelectorAll(".db-chip > svg:first-child rect").length,
        gridClass: document.querySelector(".db-grid")?.className,
        cats: [...document.querySelectorAll(".db-cat")].map((cat) => ({
          title: cat.querySelector(".db-cat-title")?.textContent.trim(),
          count: cat.querySelector(".db-cat-count")?.textContent.trim(),
          links: [...cat.querySelectorAll(".db-link-title")].map((node) => node.textContent.trim()),
        })),
      }));
      assert.match(view.chip, /Dashboard/);
      assert.match(view.gridClass, /db-grid-list/, "l'affichage par défaut est l'index « Liste »");
      assert.match(view.chip, /8 catégories · 19 liens/);
      assert.equal(view.chipGlyph, 4, "la puce du dossier porte le quadrillage du tableau de bord, comme un favicon");
      const titles = view.cats.map((cat) => cat.title);
      assert.deepEqual(titles, ["Sans catégorie", "Vide", "Inspiration", "AI Code", "Fonts", "Outils", "DnD", "Dev"]);
      assert.equal(view.cats.find((cat) => cat.title === "Inspiration").count, "4");
      assert.deepEqual(view.cats.find((cat) => cat.title === "Outils").links, ["Regex", "Can I Use"], "le préfixe « Outils — » fait la catégorie, le titre affiche le reste");
      assert.deepEqual(view.cats.find((cat) => cat.title === "Dev").links, ["Notes"], "le sous-dossier hérité est aplati : son nom devient le préfixe");
      assert.equal(view.cats.find((cat) => cat.title === "Vide").links.length, 0, "une catégorie vide reste visible");
      assert.deepEqual(view.cats.find((cat) => cat.title === "Sans catégorie").links, ["GitHub", "Accueil perso"]);
      const flat = await evaluate(async (folderId) => (await chrome.bookmarks.getChildren(folderId)).every((node) => node.url), seed.dash);
      assert.equal(flat, true, "le dossier ne contient plus aucun sous-dossier");
      await shot("dashboard-01-rendu.png");
    });

    await t.test("chrome.bookmarks.move place l'élément à la position finale demandée", async () => {
      // Comportement mesuré, dont dépend le calcul d'index du glisser-déposer.
      const moves = await evaluate(async (folderId) => {
        const kids = await chrome.bookmarks.getChildren(folderId);
        const base = kids.findIndex((node) => node.title.startsWith("DnD — "));
        const block = (list) => list.slice(base, base + 5).map((node) => node.title.slice(-1)).join("");
        const order = async () => block(await chrome.bookmarks.getChildren(folderId));
        await chrome.bookmarks.move(kids[base].id, { parentId: folderId, index: base + 3 });
        const down = await order();
        const a = (await chrome.bookmarks.getChildren(folderId)).find((node) => node.title === "DnD — a");
        await chrome.bookmarks.move(a.id, { parentId: folderId, index: base });
        const e = (await chrome.bookmarks.getChildren(folderId)).find((node) => node.title === "DnD — e");
        await chrome.bookmarks.move(e.id, { parentId: folderId, index: base + 1 });
        return { down, up: await order() };
      }, seed.dash);
      assert.equal(moves.down, "bcade", "« DnD — a » demandé en position 3 du bloc y arrive bien, la liste étant déjà privée de l'élément");
      assert.equal(moves.up, "aebcd", "« DnD — e » demandé en position 1 du bloc y arrive bien");
    });

    await t.test("glisser-déposer dans une même catégorie", async () => {
      await send("Page.navigate", { url });
      await waitFor(() => document.querySelectorAll(".db-cat").length >= 8, "rendu après rechargement");
      const before = await evaluate(() => [...document.querySelectorAll(".db-cat")]
        .find((cat) => cat.querySelector(".db-cat-title")?.textContent.trim() === "DnD")
        .querySelectorAll(".db-link").length);
      const result = await evaluate(async () => {
        const rows = () => [...document.querySelectorAll(".db-cat")].find((cat) => cat.querySelector(".db-cat-title")?.textContent.trim() === "DnD").querySelectorAll(".db-link");
        const order = () => [...rows()].map((row) => row.querySelector(".db-link-title").textContent.trim()).join("");
        const start = order();
        const transfer = new DataTransfer();
        const source = rows()[0];
        const target = rows()[2];
        source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
        const rect = target.getBoundingClientRect();
        const clientY = rect.bottom - 2;
        target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY }));
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY }));
        source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return { start, end: order() };
      });
      assert.equal(before, 5, "cinq liens de test dans la catégorie DnD");
      const reduced = result.start.replace(result.start[0], "");
      const position = reduced.indexOf(result.start[2]) + 1;
      assert.equal(result.end, reduced.slice(0, position) + result.start[0] + reduced.slice(position),
        `ordre après dépôt de « ${result.start[0]} » sous « ${result.start[2]} » (${result.start} → ${result.end})`);
    });

    await t.test("glisser-déposer entre deux catégories", async () => {
      const moved = await evaluate(async (folderId) => {
        const category = (title) => [...document.querySelectorAll(".db-cat")].find((cat) => cat.querySelector(".db-cat-title")?.textContent.trim() === title);
        const transfer = new DataTransfer();
        const source = category("Fonts").querySelectorAll(".db-link")[0];
        const title = source.querySelector(".db-link-title").textContent.trim();
        const zone = category("Inspiration").querySelector(".db-links");
        source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
        const rect = zone.getBoundingClientRect();
        zone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: rect.bottom - 4 }));
        zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: rect.bottom - 4 }));
        source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const inspiration = [...category("Inspiration").querySelectorAll(".db-link-title")].map((node) => node.textContent.trim());
        const rewritten = (await chrome.bookmarks.getChildren(folderId)).find((node) => node.url === "https://fontsinuse.com/")?.title;
        return { title, fonts: [...category("Fonts").querySelectorAll(".db-link-title")].map((node) => node.textContent.trim()), inspiration, rewritten };
      }, seed.dash);
      assert.deepEqual(moved.fonts, ["Free Faces"]);
      assert.equal(moved.inspiration[moved.inspiration.length - 1], moved.title, "déposé en fin de catégorie");
      assert.equal(moved.rewritten, "Inspiration — Fonts In Use", "le changement de catégorie réécrit le préfixe du favori");
    });

    await t.test("élargissement d'une carte par la poignée, mémorisé", async () => {
      const resized = await evaluate(async () => {
        [...document.querySelectorAll(".db-view-btn")].find((b) => b.textContent.trim() === "Cartes").click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const card = [...document.querySelectorAll(".db-cat")].find((c) => c.querySelector(".db-cat-title")?.textContent.trim() === "Inspiration");
        const handle = card.querySelector(".db-cat-resize");
        const grid = document.querySelector(".db-grid");
        const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
        const start = card.getBoundingClientRect();
        const x = start.right + 2 * (start.width + gap);
        handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: start.right, clientY: start.top + 30, pointerId: 9, buttons: 1, isPrimary: true }));
        window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: start.top + 30, pointerId: 9 }));
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: start.top + 30, pointerId: 9 }));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const stored = (await chrome.storage.local.get("bs.dashboard"))["bs.dashboard"];
        return { live: card.style.gridColumn, stored: stored.spans?.Inspiration };
      });
      assert.equal(resized.stored, 3, "la largeur (3 colonnes) est mémorisée par catégorie");
      await send("Page.navigate", { url });
      await waitFor(() => document.querySelectorAll(".db-cat").length >= 8, "rendu après rechargement");
      const persisted = await evaluate(() => {
        const card = [...document.querySelectorAll(".db-cat")].find((c) => c.querySelector(".db-cat-title")?.textContent.trim() === "Inspiration");
        return getComputedStyle(card).gridColumn;
      });
      assert.match(persisted, /span 3/, `la largeur survit au rechargement (${persisted})`);
    });

    await t.test("réordonnancement des cartes en tirant le titre", async () => {
      const moved = await evaluate(async () => {
        const card = (name) => [...document.querySelectorAll(".db-cat")].find((c) => c.querySelector(".db-cat-title")?.textContent.trim() === name);
        const titles = () => [...document.querySelectorAll(".db-cat-title")].map((node) => node.textContent.trim());
        const before = titles();
        const head = card("Dev").querySelector(".db-cat-head");
        const target = card("Vide");
        const rect = target.getBoundingClientRect();
        const at = { clientX: rect.left + rect.width * 0.75, clientY: rect.top + 12 };
        const transfer = new DataTransfer();
        head.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
        target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer, ...at }));
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, ...at }));
        head.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { before, after: titles(), stored: (await chrome.storage.local.get("bs.dashboard"))["bs.dashboard"].cats };
      });
      assert.notDeepEqual(moved.after, moved.before, "l'ordre des cartes change");
      const dev = moved.after.indexOf("Dev");
      assert.ok(dev > 0 && moved.after[dev - 1] === "Vide", `« Dev » se place juste après « Vide » (${moved.after.join(", ")})`);
      assert.equal(moved.stored.indexOf("Dev"), moved.stored.indexOf("Vide") + 1, "l'ordre est mémorisé dans les réglages locaux");
    });

    await t.test("filtre de recherche", async () => {
      const filtered = await evaluate(() => {
        const input = document.querySelector("#db-search");
        input.value = "regex";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const view = {
          cats: [...document.querySelectorAll(".db-cat")].map((cat) => cat.querySelector(".db-cat-title").textContent.trim()),
          links: [...document.querySelectorAll(".db-link-title")].map((node) => node.textContent.trim()),
        };
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return view;
      });
      assert.deepEqual(filtered.cats, ["Outils"], "seules les catégories qui gardent un lien restent");
      assert.deepEqual(filtered.links, ["Regex"]);
    });

    await t.test("aperçu de la page au survol d'un lien", async () => {
      const shown = await evaluate(async () => {
        const row = [...document.querySelectorAll(".db-link")].find((node) => node.querySelector(".db-link-title")?.textContent.trim() === "Awwwards");
        row.dispatchEvent(new PointerEvent("pointerenter"));
        await new Promise((resolve) => setTimeout(resolve, 800));
        const box = document.querySelector(".db-preview");
        await new Promise((resolve) => setTimeout(resolve, 300));
        const src = box?.querySelector("img")?.getAttribute("src") || "";
        const title = box?.querySelector(".db-preview-title")?.textContent.trim() || "";
        return { shown: !!box, src, title };
      });
      await shot("dashboard-04-apercu.png"); // le panneau est encore affiché ici
      const gone = await evaluate(async () => {
        const row = [...document.querySelectorAll(".db-link")].find((node) => node.querySelector(".db-link-title")?.textContent.trim() === "Awwwards");
        row.dispatchEvent(new PointerEvent("pointerleave"));
        await new Promise((resolve) => setTimeout(resolve, 200));
        return !document.querySelector(".db-preview");
      });
      const preview = { ...shown, gone };
      assert.equal(preview.shown, true, "le panneau d'aperçu apparaît au survol");
      assert.ok(preview.src.length > 0, "une miniature (ou son repli favicon) est chargée");
      assert.equal(preview.title, "Awwwards", "l'aperçu nomme le lien survolé");
      assert.equal(preview.gone, true, "l'aperçu disparaît quand le pointeur quitte le lien");
    });

    await t.test("renommage d'un lien en double-clic", async () => {
      const renamed = await evaluate(async () => {
        const row = [...document.querySelectorAll(".db-link")].find((node) => node.querySelector(".db-link-title")?.textContent.trim() === "Regex");
        row.querySelector(".db-link-title").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        const input = row.querySelector('input[type="text"]');
        if (!input) return false;
        input.value = "Regex 101";
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return [...document.querySelectorAll(".db-link-title")].some((node) => node.textContent.trim() === "Regex 101");
      });
      assert.ok(renamed, "le nouveau titre est rendu");
    });

    await t.test("le rappel « catégorie = préfixe » et le crayon de renommage sont visibles", async () => {
      const foot = await evaluate(() => document.querySelector(".db-foot")?.textContent || "");
      assert.ok(foot.includes("Dashboard") && foot.includes("préfixe"), "la ligne discrète en bas nomme le dossier et la règle");
      const pinned = await evaluate(() => getComputedStyle(document.querySelector(".db-foot")).position);
      assert.equal(pinned, "fixed", "la ligne est épinglée en bas de l'écran");

      const renamed = await evaluate(async () => {
        const category = [...document.querySelectorAll(".db-cat")].find((cat) => cat.querySelector(".db-cat-title")?.textContent.trim() === "Fonts");
        const pencil = category.querySelectorAll(".db-cat-actions .db-icon-btn")[1];
        if (!pencil) return null;
        pencil.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const input = category.querySelector("input[type='text']");
        if (!input) return null;
        input.value = "Typographie";
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return [...document.querySelectorAll(".db-cat-title")].map((node) => node.textContent.trim());
      });
      assert.ok(renamed?.includes("Typographie"), `catégorie renommée via le crayon (${renamed?.join(", ")})`);
      const rewritten = await evaluate(async (folderId) => (await chrome.bookmarks.getChildren(folderId)).some((node) => node.title === "Typographie — Free Faces"), seed.dash);
      assert.equal(rewritten, true, "renommer la catégorie réécrit le préfixe de ses liens");
    });

    await t.test("création d'une catégorie, puis ajout manuel d'un lien", async () => {
      const created = await evaluate(async () => {
        [...document.querySelectorAll("#dashboard-actions .btn")].find((button) => /catégorie/i.test(button.textContent)).click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const input = document.querySelector(".db-cat-new input");
        if (!input) return null;
        input.value = "Veille";
        input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return [...document.querySelectorAll(".db-cat-title")].map((node) => node.textContent.trim());
      });
      assert.ok(created?.includes("Veille"), `catégorie créée (${created?.join(", ")})`);

      const added = await evaluate(async () => {
        const category = [...document.querySelectorAll(".db-cat")].find((cat) => cat.querySelector(".db-cat-title")?.textContent.trim() === "Veille");
        category.querySelector(".db-cat-actions .db-icon-btn:last-child").click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        [...document.querySelectorAll(".db-popup button")].find((button) => /Ajouter un lien/.test(button.textContent))?.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        const inputs = document.querySelectorAll(".db-inline-form input");
        if (!inputs.length) return null;
        inputs[0].value = "MDN";
        inputs[1].value = "developer.mozilla.org";
        inputs[1].closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const link = [...document.querySelectorAll(".db-link-a")].find((anchor) => anchor.textContent.includes("MDN"));
        return link ? link.href : null;
      });
      assert.equal(added, "https://developer.mozilla.org/", "le schéma https:// est ajouté à une adresse saisie sans protocole");
      const stored = await evaluate(async (folderId) => (await chrome.bookmarks.getChildren(folderId)).find((node) => node.url === "https://developer.mozilla.org/")?.title, seed.dash);
      assert.equal(stored, "Veille — MDN", "le lien manuel prend le préfixe de sa catégorie");
    });

    await t.test("ajout de l'onglet courant dans une catégorie", async () => {
      const added = await evaluate(async (folderId) => {
        const tab = await chrome.tabs.create({ url: "https://example.com/onglet-test", active: true });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const category = [...document.querySelectorAll(".db-cat")].find((cat) => cat.querySelector(".db-cat-title")?.textContent.trim() === "Inspiration");
        category.querySelector(".db-cat-actions .db-icon-btn").click();
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const hit = (await chrome.bookmarks.getChildren(folderId)).find((node) => node.url === "https://example.com/onglet-test");
        await chrome.tabs.remove(tab.id);
        return hit ? { title: hit.title, url: hit.url } : null;
      }, seed.dash);
      assert.ok(added, "l'onglet ouvert est enregistré dans la catégorie");
      assert.match(added.title, /^Inspiration — /, "l'onglet prend le préfixe de la catégorie visée");
    });

    await t.test("suppression d'un lien : poubelle de l'app et inventaire recalculé", async () => {
      const removed = await evaluate(async () => {
        const before = Number(document.querySelector("#stat-total").textContent.replace(/\D/g, ""));
        const row = [...document.querySelectorAll(".db-link")].find((node) => node.querySelector(".db-link-title")?.textContent.trim() === "Cosmos");
        row.querySelector(".db-link-menu").click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        window.confirm = () => true;
        [...document.querySelectorAll(".db-popup button")].find((button) => /Supprimer/.test(button.textContent)).click();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const cemetery = (await chrome.storage.local.get("bs.cemetery"))["bs.cemetery"] || [];
        return {
          stillThere: [...document.querySelectorAll(".db-link-title")].some((node) => node.textContent.trim() === "Cosmos"),
          inTrash: cemetery.some((entry) => entry.url === "https://www.cosmos.so/"),
          before,
          after: Number(document.querySelector("#stat-total").textContent.replace(/\D/g, "")),
        };
      });
      assert.equal(removed.stillThere, false);
      assert.equal(removed.inTrash, true, "le favori entre au cimetière, restaurable depuis Sauvegardes");
      assert.equal(removed.after, removed.before - 1, `l'inventaire suit (${removed.before} → ${removed.after})`);
    });

    await t.test("renommage puis suppression d'une catégorie", async () => {
      const result = await evaluate(async () => {
        const category = () => [...document.querySelectorAll(".db-cat")].find((cat) => /^Vide/.test(cat.querySelector(".db-cat-title")?.textContent.trim()));
        const card = category();
        card.querySelector(".db-cat-title").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        const input = card.querySelector('input[type="text"]');
        input.value = "Vide (renommée)";
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const renamed = !!category();
        category().querySelector(".db-cat-actions .db-icon-btn:last-child").click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        window.confirm = () => true;
        [...document.querySelectorAll(".db-popup button")].find((button) => /Supprimer la catégorie/.test(button.textContent)).click();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { renamed, gone: !category() };
      });
      assert.equal(result.renamed, true);
      assert.equal(result.gone, true);
      await shot("dashboard-02-edite.png");
    });

    await t.test("les largeurs par défaut suivent le nombre de cartes", async () => {
      await evaluate(async () => {
        const bar = (await chrome.bookmarks.getTree())[0].children.find((node) => node.id === "1");
        const solo = await chrome.bookmarks.create({ parentId: bar.id, title: "Solo" });
        await chrome.bookmarks.create({ parentId: solo.id, title: "Seul au monde", url: "https://exemple.test/solo" });
        await chrome.storage.local.set({ "bs.dashboard": { folderId: solo.id, openIn: "new", view: "cards" } });
      });
      await send("Page.navigate", { url });
      await waitFor(() => document.querySelectorAll(".db-cat").length === 1 && document.querySelectorAll(".db-cat .db-link").length === 1, "catégorie unique rendue");
      const solo = await evaluate(() => {
        const card = document.querySelector(".db-cat");
        const grid = document.querySelector(".db-grid");
        return { column: getComputedStyle(card).gridColumn, width: card.getBoundingClientRect().width, grid: grid.getBoundingClientRect().width };
      });
      assert.equal(solo.column, "1 / -1", "la carte unique couvre toute la largeur de la grille");
      assert.ok(solo.width > solo.grid * 0.95, `la carte occupe la largeur (${Math.round(solo.width)}px sur ${Math.round(solo.grid)}px)`);

      const halves = await evaluate(async () => {
        const solo = (await chrome.bookmarks.search({ title: "Solo" })).find((node) => !node.url);
        await chrome.bookmarks.create({ parentId: solo.id, title: "Deux — associé", url: "https://exemple.test/deux" });
        await new Promise((resolve) => setTimeout(resolve, 900));
        const cards = [...document.querySelectorAll(".db-cat")];
        const grid = document.querySelector(".db-grid").getBoundingClientRect().width;
        return {
          titles: cards.map((card) => card.querySelector(".db-cat-title").textContent.trim()),
          widths: cards.map((card) => card.getBoundingClientRect().width),
          grid,
        };
      });
      assert.deepEqual(halves.titles, ["Sans catégorie", "Deux"], "le deuxième lien préfixé crée la deuxième carte");
      assert.ok(
        halves.widths.every((width) => width > halves.grid * 0.4 && width < halves.grid * 0.6),
        `deux cartes se partagent la largeur (${halves.widths.map((w) => Math.round(w)).join(" / ")}px sur ${Math.round(halves.grid)}px)`,
      );
    });

    await t.test("état de configuration quand aucun dossier n'est défini", async () => {
      const state = await evaluate(async () => {
        await chrome.storage.local.set({ "bs.dashboard": { folderId: null, openIn: "new" } });
        await chrome.bookmarks.search({ title: "Dashboard" }).then(async (found) => {
          for (const node of found) if (!node.url) await chrome.bookmarks.update(node.id, { title: "Dashboard (renommé)" });
        });
        document.querySelector('.rail-tab[data-section="bookmarks"]').click();
        document.querySelector('.rail-tab[data-section="dashboard"]').click();
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return {
          state: !!document.querySelector(".db-state"),
          title: document.querySelector(".db-state h2")?.textContent.trim(),
          folders: document.querySelectorAll("#db-pick option").length,
          create: !!document.querySelector("#db-create"),
        };
      });
      assert.ok(state.state && state.create, "l'état de configuration propose de choisir ou de créer le dossier");
      assert.ok(state.folders > 3, `tous les dossiers sont proposés (${state.folders})`);
    });

    await t.test("bloc de réglages", async () => {
      const settings = await evaluate(async () => {
        window.BSOpenSettingsBlock("dashboard");
        await new Promise((resolve) => setTimeout(resolve, 700));
        const select = document.getElementById("setting-dashboard-folder");
        select.selectedIndex = 1;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 400));
        return {
          block: !!document.querySelector('.block[data-settings-block="dashboard"]'),
          options: select.options.length,
          stored: (await chrome.storage.local.get("bs.dashboard"))["bs.dashboard"],
        };
      });
      assert.equal(settings.block, true);
      assert.ok(settings.options > 3);
      assert.equal(settings.stored.openIn, "new", "changer de dossier conserve le mode d'ouverture des liens");
      assert.ok(settings.stored.folderId, "le dossier choisi est enregistré");
      await shot("dashboard-03-reglages.png");
    });

    await t.test("aucune erreur JavaScript pendant le parcours", () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    try { child?.kill(); } catch { /* déjà arrêté */ }
    await pause(400);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
});
