import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const src = await readFile(new URL("../resources.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { formatBytes, trendOf, sortRows } = sandbox.window.BSMemoryMonitor.helpers;

test("le moniteur s'expose comme script classique autonome", () => {
  assert.equal(typeof sandbox.window.BSMemoryMonitor.mount, "function");
  assert.equal(typeof sandbox.window.BSMemoryMonitor.start, "function");
  assert.equal(typeof sandbox.window.BSMemoryMonitor.stop, "function");
});

test("formate les octets en ko / Mo", () => {
  assert.equal(formatBytes(0), "—");
  assert.equal(formatBytes(500 * 1024), "500 ko");
  assert.equal(formatBytes(1.5 * 1048576), "1.5 Mo");
  assert.equal(formatBytes(429 * 1048576), "429 Mo");
});

test("ignore les petites variations de tendance", () => {
  assert.equal(trendOf(100 * 1024), "stable");
  assert.equal(trendOf(1024 * 1024), "up");
  assert.equal(trendOf(-512 * 1024), "down");
});

test("trie par heap décroissant, non mesurés en fin", () => {
  const rows = [
    { title: "a", heap: { used: 10, total: 20, limit: 30 } },
    { title: "b", heap: null },
    { title: "c", heap: { used: 50, total: 60, limit: 30 } },
  ];
  assert.deepEqual(sortRows(rows).map((r) => r.title), ["c", "a", "b"]);
});
