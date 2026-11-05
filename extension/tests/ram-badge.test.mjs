import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const src = await readFile(new URL("../ram-badge.js", import.meta.url), "utf8");
const sandbox = { URL: globalThis.URL };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const B = sandbox.PKRamBadge;

/* ---------- DOM factice minimal pour les injections ---------- */

function page({ used, icons = ["icon"] } = {}) {
  const nodes = [];
  const fills = [];
  const head = {
    appendChild(node) { node.parentNode = head; nodes.push(node); },
    removeChild(node) {
      const i = nodes.indexOf(node);
      if (i >= 0) nodes.splice(i, 1);
      node.parentNode = null;
    },
    querySelector(sel) { return matching(sel)[0] || null; },
    querySelectorAll(sel) { return matching(sel); },
  };
  function matching(sel) {
    if (sel === "link[data-pkwm-ram]") return nodes.filter((n) => n.tag === "link" && n.attrs["data-pkwm-ram"]);
    if (sel === "link[data-pkwm-ram-off]") return nodes.filter((n) => n.tag === "link" && n.attrs["data-pkwm-ram-off"]);
    if (sel === 'link[rel~="icon"]') return nodes.filter((n) => n.tag === "link" && /\bicon\b/.test(n.attrs.rel || ""));
    return [];
  }
  for (const rel of icons) {
    nodes.push({
      tag: "link",
      attrs: { rel },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      hasAttribute(k) { return k in this.attrs; },
      removeAttribute(k) { delete this.attrs[k]; },
    });
  }
  const doc = {
    head,
    createElement(tag) {
      return {
        tag,
        attrs: {},
        width: 0,
        height: 0,
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        hasAttribute(k) { return k in this.attrs; },
        removeAttribute(k) { delete this.attrs[k]; },
        getContext() {
          return {
            beginPath() {}, arc() {}, fillRect() {},
            fill() { fills.push(this.fillStyle); },
            stroke() {},
            set fillStyle(v) { this._f = v; },
            get fillStyle() { return this._f; },
            set strokeStyle(v) { this._s = v; },
            get strokeStyle() { return this._s; },
            lineWidth: 0,
          };
        },
        toDataURL() { return "data:image/png;base64,DOT"; },
        parentNode: null,
      };
    },
    performance: { memory: { usedJSHeapSize: used } },
  };
  return { doc, nodes, fills,
    mine: () => nodes.find((n) => n.attrs["data-pkwm-ram"]) || null,
    hidden: () => nodes.filter((n) => n.attrs["data-pkwm-ram-off"]) };
}

function runInPage(fnName, doc, ...args) {
  sandbox.document = doc;
  sandbox.performance = doc.performance;
  return vm.runInContext(
    `PKRamBadge.${fnName}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
    sandbox,
  );
}

/* ---------- Dépendances factices pour la composition SW ---------- */

function fakeDeps({ failFirst = false } = {}) {
  const calls = [];
  const bitmap = { closed: false, close() { this.closed = true; } };
  const canvasCalls = [];
  const mkCanvas = () => {
    const ops = [];
    return {
      ops,
      getContext: () => new Proxy({}, {
        get(target, prop) {
          if (prop === "drawImage") return (...a) => ops.push(["drawImage", ...a]);
          if (prop === "arc") return (...a) => ops.push(["arc", ...a]);
          return (...a) => ops.push([String(prop), ...a]);
        },
        set(target, prop, v) { ops.push([String(prop), v]); return true; },
      }),
      convertToBlob: async () => ({ fake: true, n: canvasCalls.push(1) }),
    };
  };
  const urls = ["data:image/png;base64,COMPSED-1", "data:image/png;base64,COMPSED-2"];
  let i = 0;
  return {
    calls,
    bitmap,
    canvases: [],
    deps: {
      fetch: async (url) => {
        calls.push(String(url));
        if (failFirst && calls.length === 1) throw new Error("net");
        return { blob: async () => ({ fake: true }) };
      },
      createImageBitmap: async () => bitmap,
      OffscreenCanvas: class {
        constructor() { this.c = mkCanvas(); this.canvases = null; }
        getContext(t) { return this.c.getContext(t); }
        convertToBlob(o) { return this.c.convertToBlob(o); }
      },
      FileReader: class {
        readAsDataURL(blob) {
          this.result = `data:image/png;base64,COMPOSED-${++i}`;
          this.onload && this.onload();
        }
      },
    },
    urls,
  };
}

/* ---------- Tests ---------- */

test("le module s'expose comme script classique autonome", () => {
  assert.equal(typeof B.paint, "function");
  assert.equal(typeof B.measure, "function");
  assert.equal(typeof B.composeBadge, "function");
  assert.equal(B.ALARM, "bs-ram-badge");
  assert.equal(B.SPEC.orange, 150 * 1048576);
  assert.equal(B.SPEC.red, 300 * 1048576);
});

test("mesure : niveaux selon le heap", () => {
  const mk = (mo) => page({ used: mo * 1048576 }).doc;
  assert.equal(runInPage("measure", mk(40), B.SPEC).level, "ok");
  assert.equal(runInPage("measure", mk(200), B.SPEC).level, "orange");
  assert.equal(runInPage("measure", mk(500), B.SPEC).level, "red");
});

test("onglet chaud avec image composée : la favicon d'origine n'est PAS remplacée visuellement", () => {
  const p = page({ used: 200 * 1048576, icons: ["icon"] });
  const badge = { spec: B.SPEC, colors: B.DOT_COLORS,
    urls: { orange: "data:image/png;base64,COMPOSED-ORANGE", red: "data:image/png;base64,COMPOSED-RED" } };
  const r = runInPage("paint", p.doc, badge, "auto");
  assert.equal(r.level, "orange");
  const m = p.mine();
  assert.ok(m, "link pastille créé");
  assert.equal(m.attrs.href, "data:image/png;base64,COMPOSED-ORANGE", "image composée appliquée (icône d'origine + badge)");
  assert.equal(p.fills.length, 0, "aucun badge dessiné en page : la composition SW suffit");
  assert.equal(p.hidden().length, 1, "favicon d'origine mémorisée pour restauration");
});

test("repli sans image composée : badge seul dessiné en page", () => {
  const p = page({ used: 500 * 1048576, icons: ["icon"] });
  const r = runInPage("paint", p.doc, { spec: B.SPEC, colors: B.DOT_COLORS, urls: null }, "auto");
  assert.equal(r.level, "red");
  assert.equal(p.mine().attrs.href, "data:image/png;base64,DOT");
  assert.ok(p.fills.includes("#e5484d"), "badge rouge en repli");
});

test("retour sous le seuil : favicon d'origine restaurée", () => {
  const p = page({ used: 200 * 1048576, icons: ["icon"] });
  const badge = { spec: B.SPEC, colors: B.DOT_COLORS, urls: { orange: "data:image/png;base64,X", red: "data:image/png;base64,Y" } };
  runInPage("paint", p.doc, badge, "auto");
  assert.ok(p.mine());
  p.doc.performance.memory.usedJSHeapSize = 30 * 1048576;
  const r = runInPage("paint", p.doc, badge, "auto");
  assert.equal(r.level, "ok");
  assert.equal(p.mine(), null, "link pastille retiré");
  assert.equal(p.hidden().length, 0);
  assert.equal(p.nodes.filter((n) => n.tag === "link")[0].attrs.rel, "icon");
});

test("mode off : nettoyage forcé même au-dessus du seuil", () => {
  const p = page({ used: 900 * 1048576, icons: ["icon"] });
  runInPage("paint", p.doc, { spec: B.SPEC, colors: B.DOT_COLORS, urls: null }, "auto");
  assert.ok(p.mine());
  const r = runInPage("paint", p.doc, { spec: B.SPEC, colors: B.DOT_COLORS, urls: null }, "off");
  assert.equal(r.level, "ok");
  assert.equal(p.mine(), null);
  assert.equal(p.hidden().length, 0);
});

test("sans performance.memory : niveau ok, aucune erreur", () => {
  const { doc } = page({ used: 0 });
  doc.performance = {};
  assert.equal(runInPage("measure", doc, B.SPEC).level, "ok");
  sandbox.performance = {};
  const r = runInPage("paint", doc, { spec: B.SPEC, colors: B.DOT_COLORS, urls: null }, "auto");
  assert.equal(r.level, "ok");
});

test("composeBadge : favicon déclarée d'abord, deux niveaux rendus, bitmap fermé", async () => {
  const f = fakeDeps();
  const out = await B.composeBadge("https://site.test/favicon.png", "https://site.test/page", f.deps);
  assert.deepEqual(f.calls, ["https://site.test/favicon.png"], "pas de repli S2 quand la favicon déclarée répond");
  assert.equal(out.orange, "data:image/png;base64,COMPOSED-1");
  assert.equal(out.red, "data:image/png;base64,COMPOSED-2");
  assert.equal(f.bitmap.closed, true, "bitmap libéré");
});

test("composeBadge : repli S2 quand la favicon déclarée échoue", async () => {
  const f = fakeDeps({ failFirst: true });
  const out = await B.composeBadge("https://site.test/favicon.png", "https://site.test/page", f.deps);
  assert.deepEqual(f.calls, ["https://site.test/favicon.png",
    "https://www.google.com/s2/favicons?domain=site.test&sz=64"]);
  assert.ok(out && out.orange.startsWith("data:image/png;base64,COMPOSED-"));
});

test("composeBadge : null quand aucune source n'est décodable", async () => {
  const deps = {
    fetch: async () => { throw new Error("net"); },
    createImageBitmap: async () => { throw new Error("decode"); },
    OffscreenCanvas: class {}, FileReader: class {},
  };
  assert.equal(await B.composeBadge("https://site.test/favicon.png", "https://site.test/page", deps), null);
  assert.equal(await B.composeBadge("", "chrome://settings/", deps), null, "aucune source pour une page interne");
});
