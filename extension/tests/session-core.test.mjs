import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const src = await readFile(new URL("../session-core.js", import.meta.url), "utf8");
const sandbox = { crypto: globalThis.crypto, URL: globalThis.URL };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const C = sandbox.PKSessionCore;

const saved = (changes = {}) => C.cleanSession({
  title: "Recherche",
  windows: [{ tabs: [{ url: "https://example.com/", title: "Exemple" }] }],
  ...changes,
});

test("le cœur des sessions s'expose comme script classique autonome", () => {
  assert.equal(typeof C.cleanSession, "function");
  assert.equal(typeof C.migrateOldSessions, "function");
  assert.deepEqual({ ...C.DEFAULT_SETTINGS }, { autosave: true, sleepMinutes: 0, previews: true });
});

test("les URL non web sont rejetées et les tabs suspendus déballés", () => {
  for (const url of ["javascript:alert(1)", "file:///secret", "chrome://settings", "broken"]) {
    assert.throws(() => C.cleanSession({ windows: [{ tabs: [{ url }] }] }));
  }
  assert.equal(C.tabURL({ url: "chrome-extension://x/suspended.html#uri=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1" }), "https://example.com/a?b=1");
  assert.equal(C.tabURL({ url: "https://old.test", pendingUrl: "https://new.test/" }), "https://new.test/");
});

test("removeTab vérifie l'URL attendue avant de retirer", () => {
  const session = saved({ windows: [{ tabs: [{ url: "https://example.com/" }, { url: "https://keep.test/" }] }] });
  const remaining = C.removeTab(session, "0:0", "https://example.com/");
  assert.deepEqual(remaining[0].tabs.map((t) => t.url), ["https://keep.test/"]);
  assert.throws(() => C.removeTab(session, "0:0", "https://mismatch.test/"), /changé/);
  assert.throws(() => C.removeTab(session, "9:9", "https://example.com/"), /changé/);
});

test("prunePreviews respecte le TTL, le plafond de 60 captures et la taille", () => {
  const now = Date.now();
  const entries = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`https://s${i}.test/`, { src: "x".repeat(50), at: now - i }]));
  entries["https://old.test/"] = { src: "y".repeat(50), at: now - 31 * 86400000 };
  const pruned = C.prunePreviews(entries, now);
  assert.equal(Object.keys(pruned).length, 60);
  assert.ok(!("https://old.test/" in pruned));
  assert.equal("https://s0.test/" in pruned, true);
});

test("migrateOldSessions convertit les anciens instantanés et ignore les invalides", () => {
  const now = Date.now();
  const migrated = C.migrateOldSessions([
    { id: "1", name: "Session manuelle", capturedAt: now - 1000, windows: [{ tabs: [{ url: "https://example.com/", title: "Exemple", favIconUrl: "https://icons/x.png", groupName: "G", groupColor: "blue" }] }] },
    { id: "2", name: "Auto - 26/09/2026", capturedAt: now - 2000, auto: true, windows: [{ tabs: [{ url: "https://tabler.one/" }] }] },
    { id: "3", name: "Vide", capturedAt: now, windows: [] },
    null,
    { id: "4", name: "Invalide", capturedAt: now, windows: [{ tabs: [{ url: "javascript:alert(1)" }] }] },
  ], now);
  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].title, "Session manuelle");
  assert.equal(migrated[0].windows[0].tabs[0].favIconUrl, undefined);
  assert.equal(migrated[0].windows[0].tabs[0].groupTitle, "G");
  assert.equal(migrated[1].auto, true);
  assert.ok(migrated[0].id !== "1");
  for (const item of migrated) assert.ok(Number.isFinite(item.createdAt) && item.createdAt <= now);
});

test("matches couvre titres, tags et notes d'onglets", () => {
  const session = saved({ tags: ["Travail"], windows: [{ tabs: [{ url: "https://example.com/", title: "Doc", note: "contrat" }] }] });
  assert.equal(C.matches(session, "travail contrat"), true);
  assert.equal(C.matches(session, "inconnu"), false);
});
