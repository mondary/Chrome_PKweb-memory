/* PK Web Memory — Moniteur de ressources (heap JS + réseau par onglet, 2 s).
   Module autonome : rendu dans la section Ressources de l'app et dans le
   panneau latéral Chrome (sidepanel.html). Aucune injection permanente :
   lecture ponctuelle de performance.memory et des resource timing entries
   via chrome.scripting. Le rendu met à jour les lignes en place (clé par
   onglet) pour ne jamais perdre la position de défilement. */
(function () {
  "use strict";

  const POLL_MS = 2000;
  const TREND_THRESHOLD = 256 * 1024;
  const HOT_HEAP = 400 * 1048576;
  const INTERVALS = [{ label: "1 s", ms: 1000 }, { label: "2 s", ms: 2000 }, { label: "5 s", ms: 5000 }, { label: "⏸", ms: 0 }];
  const STORE_KEY = "bs.resources";

  function readPageSample() {
    const m = performance && performance.memory;
    if (!m) return null;
    let net = 0;
    try {
      performance.setResourceTimingBufferSize(10000); // tient jusqu'au prochain chargement de la page
      const entries = performance.getEntriesByType("resource");
      for (let i = 0; i < entries.length; i++) net += entries[i].transferSize || 0;
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) net += nav.transferSize || 0;
    } catch (e) { net = 0; }
    return { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit, net: net };
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} ko`;
    const mb = bytes / 1048576;
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} Mo`;
  }

  function trendOf(delta) {
    if (delta > TREND_THRESHOLD) return "up";
    if (delta < -TREND_THRESHOLD) return "down";
    return "stable";
  }

  function sortRows(rows) {
    return rows.slice().sort((a, b) => {
      const au = a.heap ? a.heap.used : -1;
      const bu = b.heap ? b.heap.used : -1;
      if (au !== bu) return bu - au;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
  }

  const canSample = () => typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id && chrome.scripting);

  async function sampleAllTabs(prevUsed) {
    const self = { key: "self", title: "PK Web Memory — cette vue", url: location.href, active: false, discarded: false, frozen: false, self: true, heap: readPageSample(), delta: 0 };
    if (!canSample()) return [self];
    const tabs = await chrome.tabs.query({});
    const rows = await Promise.all(tabs.filter((tab) => tab.id != null && !(tab.url || "").startsWith(location.origin)).map(async (tab) => {
      const injectable = /^https?:/i.test(tab.url || "") && !tab.discarded && !tab.frozen;
      let heap = null;
      if (injectable) {
        try {
          const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPageSample });
          heap = (inj && inj.result) || null;
        } catch (e) { heap = null; }
      }
      return { key: `tab-${tab.id}`, tabId: tab.id, windowId: tab.windowId, title: tab.title || tab.url || "Onglet", url: tab.url || "", favIconUrl: tab.favIconUrl, active: Boolean(tab.active), discarded: Boolean(tab.discarded), frozen: Boolean(tab.frozen), heap, delta: 0 };
    }));
    const all = [self].concat(rows);
    for (const row of all) {
      if (!row.heap) continue;
      const before = prevUsed.get(row.key);
      row.delta = before != null ? row.heap.used - before : 0;
    }
    return all;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function tooltip(row) {
    if (row.self && row.heap) return `Cette vue PK Web Memory — heap JS ${formatBytes(row.heap.used)} / ${formatBytes(row.heap.total)} alloués · réseau ${formatBytes(row.heap.net)} téléchargés.`;
    if (row.heap) {
      const delta = row.delta !== 0 ? ` · tendance ${row.delta > 0 ? "+" : "−"}${formatBytes(Math.abs(row.delta))}` : "";
      return `Heap JS : ${formatBytes(row.heap.used)} utilisés / ${formatBytes(row.heap.total)} alloués (limite ${formatBytes(row.heap.limit)})${delta} · réseau ${formatBytes(row.heap.net)} téléchargés depuis le chargement.`;
    }
    if (row.discarded || row.frozen) return "Onglet endormi ou gelé par Chrome — non mesurable sans le réveiller.";
    return "Page non mesurable (chrome://, store ou autre extension). CPU et RAM processus : gestionnaire de tâches Chrome (Maj+Échap).";
  }

  function faviconEl(row) {
    if (row.favIconUrl) {
      const img = el("img", "mem-favicon");
      img.src = row.favIconUrl;
      img.alt = "";
      img.loading = "lazy";
      return img;
    }
    return el("span", "mem-favicon-letter", (row.self ? "PK" : row.title).slice(0, 1).toUpperCase());
  }

  function createRowEl(row, max) {
    const btn = el("button", `mem-row${row.active ? " is-active" : ""}`);
    btn.type = "button";
    const label = el("span", "mem-label");
    label.append(el("strong", null, row.title), el("small", null, ""));
    const value = el("span", "mem-value");
    const bar = el("span", "mem-bar");
    bar.append(el("i"));
    value.append(el("span", null, ""), bar);
    const net = el("span", "mem-net", "");
    const trend = el("span", "mem-trend", "");
    btn.append(faviconEl(row), label, value, net, trend);
    btn.addEventListener("click", () => {
      if (row.tabId == null || !chrome.runtime || !chrome.runtime.id) return;
      chrome.tabs.update(row.tabId, { active: true }).catch(() => {});
      if (row.windowId != null) chrome.windows.update(row.windowId, { focused: true }).catch(() => {});
    });
    updateRowEl(btn, row, max);
    return btn;
  }

  function updateRowEl(btn, row, max) {
    btn.title = tooltip(row);
    btn.classList.toggle("is-active", row.active);
    btn.disabled = row.tabId == null;
    const [favicon, label, value, net, trend] = btn.children;
    const nextFavicon = faviconEl(row);
    if (nextFavicon.tagName !== favicon.tagName || (nextFavicon.src || "") !== (favicon.src || "")) favicon.replaceWith(nextFavicon);
    label.firstChild.textContent = row.title;
    label.lastChild.textContent = row.self ? "cette extension" : `${(row.url.replace(/^https?:\/\//, "").split("/")[0] || "")}${row.discarded || row.frozen ? " · endormi" : ""}`;
    const num = value.children[0];
    num.textContent = formatBytes(row.heap ? row.heap.used : 0);
    num.className = row.heap ? "" : "null";
    const fill = value.querySelector(".mem-bar > i");
    fill.className = row.heap && row.heap.used > HOT_HEAP ? "hot" : "";
    fill.style.width = `${row.heap ? Math.max(3, Math.round((row.heap.used / max) * 100)) : 0}%`;
    net.textContent = row.heap ? formatBytes(row.heap.net) : "·";
    const trendKey = row.heap ? trendOf(row.delta) : "none";
    trend.className = `mem-trend ${trendKey}`;
    trend.textContent = row.heap ? { up: "↗", down: "↘", stable: "→" }[trendKey] : "·";
  }

  function buildShell(root) {
    const summary = el("div", "mem-summary");
    const dot = el("span", "mem-live-dot");
    const total = el("strong", null, "—");
    const net = el("strong", null, "—");
    const count = el("span", null, "");
    const seg = el("div", "mem-seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Intervalle de rafraîchissement");
    for (const { label, ms } of INTERVALS) {
      const b = el("button", "mem-seg-btn", label);
      b.type = "button";
      b.dataset.ms = String(ms);
      b.title = ms > 0 ? `Rafraîchir toutes les ${label}` : "Suspendre le relevé";
      b.addEventListener("click", () => setIntervalMs(ms));
      seg.append(b);
    }
    summary.append(dot, el("span", null, "Heap JS "), total, el("span", null, "Réseau "), net, count, seg);
    const list = el("div", "mem-list");
    const foot = el("p", "mem-foot", "Heap JS = objets JavaScript uniquement (échantillon périodique). L’empreinte mémoire de Chrome (Maj+Échap) inclut en plus DOM, images et GPU : compte environ 2 à 3× ce heap. Réseau = octets téléchargés depuis le chargement de la page. Clic sur une ligne pour activer l’onglet.");
    root.replaceChildren(summary, list, foot);
    return { dot, total, net, count, seg, list, rowEls: new Map() };
  }

  function markInterval() {
    if (!state.shell) return;
    for (const b of state.shell.seg.children) {
      const active = Number(b.dataset.ms) === state.intervalMs;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
    state.shell.dot.classList.toggle("paused", state.intervalMs <= 0);
  }

  function render(shell, rows) {
    const measured = rows.filter((r) => r.heap).length;
    const total = rows.reduce((sum, r) => sum + (r.heap ? r.heap.used : 0), 0);
    const net = rows.reduce((sum, r) => sum + (r.heap ? r.heap.net : 0), 0);
    shell.total.textContent = formatBytes(total);
    shell.net.textContent = formatBytes(net);
    shell.count.textContent = `${measured}/${rows.length} mesurés`;
    const max = Math.max(1, ...rows.map((r) => (r.heap ? r.heap.used : 0)));
    const seen = new Set(rows.map((r) => r.key));
    for (const [key, node] of shell.rowEls) {
      if (!seen.has(key)) { node.remove(); shell.rowEls.delete(key); }
    }
    for (const row of rows) {
      let node = shell.rowEls.get(row.key);
      if (node) updateRowEl(node, row, max);
      else { node = createRowEl(row, max); shell.rowEls.set(row.key, node); }
      shell.list.append(node); // replaceChildren interdit : append déplace sans réinitialiser le défilement.
    }
  }

  const state = { root: null, shell: null, timer: 0, running: false, intervalMs: POLL_MS, prev: new Map() };

  async function tick() {
    if (!state.root || document.visibilityState === "hidden") return;
    const rows = await sampleAllTabs(state.prev);
    if (!state.root) return;
    state.prev = new Map(rows.filter((r) => r.heap).map((r) => [r.key, r.heap.used]));
    render(state.shell, sortRows(rows));
  }

  function schedule() {
    clearInterval(state.timer);
    state.timer = 0;
    if (!state.running || state.intervalMs <= 0) return;
    state.timer = setInterval(() => void tick(), state.intervalMs);
  }

  function setIntervalMs(ms) {
    state.intervalMs = ms;
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [STORE_KEY]: { intervalMs: ms } }).catch(() => {});
    }
    if (state.running) schedule();
    markInterval();
  }

  function start() {
    if (state.running) { schedule(); return; }
    state.running = true;
    void tick();
    schedule();
  }

  function stop() {
    state.running = false;
    clearInterval(state.timer);
    state.timer = 0;
  }

  async function mount(root) {
    state.root = root;
    try {
      const stored = await chrome.storage.local.get(STORE_KEY);
      const saved = Number(stored?.[STORE_KEY]?.intervalMs);
      if (INTERVALS.some(({ ms }) => ms === saved)) state.intervalMs = saved;
    } catch (e) { /* stockage indisponible : valeurs par défaut */ }
    state.shell = buildShell(root);
    markInterval();
    start();
  }

  window.BSMemoryMonitor = { mount, start, stop, helpers: { formatBytes, trendOf, sortRows } };
})();
