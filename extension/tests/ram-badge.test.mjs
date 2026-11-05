import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const src = await readFile(new URL("../ram-badge.js", import.meta.url), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const B = sandbox.PKRamBadge;

/* DOM factice minimal : juste ce que pkRamBadgePaint touche. */
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
      const node = {
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
            beginFragment: 0,
            beginPath() {},
            arc() {},
            fillRect() {},
            fill() { fills.push(this.fillStyle); },
            stroke() {},
            set fillStyle(v) { this._f = v; },
            get fillStyle() { return this._f; },
            set strokeStyle(v) { this._s = v; },
            get strokeStyle() { return this._s; },
            lineWidth: 0,
          };
        },
        toDataURL() { return "data:image/png;base64,TEST"; },
        parentNode: null,
      };
      return node;
    },    performance: { memory: { usedJSHeapSize: used } },
  };
  return { doc, nodes, fills, mine: () => nodes.find((n) => n.attrs["data-pkwm-ram"]) || null,
    hidden: () => nodes.filter((n) => n.attrs["data-pkwm-ram-off"]) };
}

// Évalue B.paint dans le sandbox avec un document donné (le contexte global
// du vm partage `document`), pour rester au plus près de l'injection réelle.
function runPaint(doc, mode = "auto") {
  sandbox.document = doc;
  sandbox.performance = doc.performance;
  return vm.runInContext(`PKRamBadge.paint(${JSON.stringify(B.SPEC)}, ${JSON.stringify(mode)})`, sandbox);
}

test("le module s'expose comme script classique autonome", () => {
  assert.equal(typeof B.paint, "function");
  assert.equal(typeof B.tick, "function");
  assert.equal(B.ALARM, "bs-ram-badge");
  assert.equal(B.SPEC.orange, 150 * 1048576);
  assert.equal(B.SPEC.red, 300 * 1048576);
});

test("sous le seuil : rien n'est peint, l'icône d'origine reste", () => {
  const { doc, mine } = page({ used: 40 * 1048576, icons: ["shortcut icon"] });
  const r = runPaint(doc);
  assert.equal(r.level, "ok");
  assert.equal(mine(), null);
  assert.equal(doc.head.querySelectorAll('link[rel~="icon"]').length, 1);
});

test("au-dessus du seuil orange : favicon remplacée, originale mémorisée", () => {
  const { doc, mine, hidden, fills } = page({ used: 200 * 1048576, icons: ["icon"] });
  const r = runPaint(doc);
  assert.equal(r.level, "orange");
  const m = mine();
  assert.ok(m, "link data-pkwm-ram créé");
  assert.equal(m.attrs.rel, "icon");
  assert.equal(m.attrs.href, "data:image/png;base64,TEST");
  assert.equal(hidden().length, 1);
  assert.equal(hidden()[0].attrs.rel, "pkwm-ram-hidden");
  assert.equal(hidden()[0].attrs["data-pkwm-ram-off"], "icon");
  assert.ok(fills.includes("#f5a524"), "pastille orange peinte");
});

test("au-dessus du seuil rouge : pastille rouge", () => {
  const p = page({ used: 500 * 1048576 });
  const r = runPaint(p.doc);
  assert.equal(r.level, "red");
  assert.ok(p.fills.includes("#e5484d"), "pastille rouge peinte");
});

test("retour sous le seuil : icône d'origine restaurée", () => {
  const p = page({ used: 200 * 1048576, icons: ["icon"] });
  runPaint(p.doc);
  assert.ok(p.mine());
  // Nouveau passage avec un heap retombé : même document, mêmes nodes.
  p.doc.performance.memory.usedJSHeapSize = 30 * 1048576;
  const r = runPaint(p.doc);
  assert.equal(r.level, "ok");
  assert.equal(p.mine(), null, "link pastille retiré");
  assert.equal(p.hidden().length, 0);
  assert.equal(p.nodes.filter((n) => n.tag === "link")[0].attrs.rel, "icon");
});

test("mode off : nettoyage forcé même au-dessus du seuil", () => {
  const p = page({ used: 900 * 1048576, icons: ["icon"] });
  runPaint(p.doc, "auto");
  assert.ok(p.mine());
  const r = runPaint(p.doc, "off");
  assert.equal(r.level, "ok");
  assert.equal(p.mine(), null);
  assert.equal(p.hidden().length, 0);
});

test("sans performance.memory : aucune erreur, niveau ok", () => {
  const { doc } = page({ used: 0 });
  doc.performance = {};
  const r = runPaint(doc);
  assert.equal(r.level, "ok");
});
