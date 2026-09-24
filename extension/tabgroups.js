/* Groupes d'onglets natifs : liste des groupes ouverts (chrome.tabGroups + chrome.tabs)
   avec mise au premier plan, et dossiers de la barre de favoris (chrome.bookmarks)
   réouvrables en groupe nommé. Script classique chargé avant app.js — n'expose que
   window.BSTabGroups = { init }. */
"use strict";

(() => {
  const BAR_ID = "1"; // id fixe de la barre de favoris dans Chrome
  const FAVICON_MAX = 10;

  // Les 9 couleurs reconnues par chrome.tabGroups.
  const GROUP_COLORS = {
    grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00",
    green: "#188038", pink: "#d01884", orange: "#fa7b17", purple: "#a142f4", cyan: "#24c1e0",
  };

  // Schémas que chrome.tabs.create refuse ou ne doit pas rouvrir depuis un dossier.
  const BLOCKED_SCHEME = /^(chrome|chrome-untrusted|chrome-extension|edge|about|devtools|view-source|javascript|data|file):/i;

  let initialized = false;
  let open = [];            // groupes vivants : { group, tabs }
  let openById = new Map(); // groupId (string) → groupe vivant
  let folders = [];         // dossiers de premier niveau de la barre : { id, title, children }
  let busy = false;
  let ui = null;
  let refreshTimer = null;

  /* ---------- helpers locaux (aucune dépendance à app.js) ---------- */

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), 3000);
  }

  function colorHex(c) { return GROUP_COLORS[c] || "var(--muted, #71717a)"; }

  function hostnameOf(url) {
    try { return new URL(url).hostname || url; } catch { return url || ""; }
  }

  function faviconUrl(url) {
    return "https://www.google.com/s2/favicons?sz=16&domain_url=" + encodeURIComponent(url || "");
  }

  // Rangée de favicônes dédupliquées par hostname (classes globales stylées dans style.css).
  function faviconStrip(urls, max) {
    const seen = new Set();
    const items = [];
    for (const u of urls || []) {
      if (!u) continue;
      const h = hostnameOf(u);
      if (!h || seen.has(h)) continue;
      seen.add(h);
      items.push(u);
    }
    if (!items.length) return "";
    const shown = items.slice(0, max);
    const more = items.length - shown.length;
    return '<div class="favicon-strip" aria-hidden="true">'
      + shown.map((u) => `<img class="fav-ico" src="${esc(faviconUrl(u))}" alt="" loading="lazy">`).join("")
      + (more > 0 ? `<span class="fav-more">+${more}</span>` : "")
      + "</div>";
  }

  const restorable = (url) => typeof url === "string" && /\S/.test(url) && !BLOCKED_SCHEME.test(url);

  function stateP(text) {
    const p = document.createElement("p");
    p.className = "muted tg-state";
    p.textContent = text;
    return p;
  }

  function tabGroupsApi() {
    return chrome.tabGroups && typeof chrome.tabGroups.query === "function" ? chrome.tabGroups : null;
  }

  /* ---------- groupes ouverts ---------- */

  async function loadOpenGroups() {
    const api = tabGroupsApi();
    if (!api) return { groups: [], ungrouped: 0 };
    const [groups, tabs] = await Promise.all([
      api.query({}),
      chrome.tabs.query({}),
    ]);
    const byGroup = new Map();
    let ungrouped = 0;
    for (const t of tabs) {
      if (!t.groupId || t.groupId === -1) { ungrouped++; continue; }
      if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
      byGroup.get(t.groupId).push(t);
    }
    const live = groups
      .map((g) => ({ group: g, tabs: byGroup.get(g.id) || [] }))
      .sort((a, b) =>
        (a.group.windowId - b.group.windowId)
        || String(a.group.title || "").localeCompare(String(b.group.title || ""), "fr"));
    return { groups: live, ungrouped };
  }

  /* ---------- dossiers de la barre de favoris ---------- */

  async function loadSavedFolders() {
    const children = await chrome.bookmarks.getChildren(BAR_ID);
    return (children || [])
      .filter((c) => !c.url && Array.isArray(c.children))
      .map((c) => ({ id: c.id, title: (c.title || "").trim() || "Sans nom", children: (c.children || []).filter((k) => k.url) }));
  }

  async function reopenFolder(folder) {
    if (busy) return;
    busy = true;
    setBusy(true);
    let opened = 0;
    let ignored = 0;
    let windowId = null;
    const tabIds = [];
    try {
      for (const child of folder.children || []) {
        if (!restorable(child.url)) { ignored++; continue; }
        try {
          if (windowId === null) {
            try {
              const win = await chrome.windows.create({ url: child.url });
              windowId = win.id;
              const first = win.tabs?.[0];
              if (first) { tabIds.push(first.id); opened++; continue; }
            } catch {
              const win = await chrome.windows.create({}); // fenêtre vide, onglets un à un
              windowId = win.id;
            }
          }
          const tab = await chrome.tabs.create({ windowId, url: child.url });
          tabIds.push(tab.id);
          opened++;
        } catch { ignored++; }
      }
      if (windowId === null) { toast("Ce dossier ne contient aucun favori ouvrable."); return; }
      if (tabIds.length && typeof chrome.tabs?.group === "function") {
        try {
          const gid = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
          await chrome.tabGroups.update(gid, { title: folder.title || "" });
        } catch { /* regroupement indisponible */ }
      }
      toast(`Groupe « ${folder.title} » rouvert : ${plural(opened, "onglet")}` + (ignored ? `, ${plural(ignored, "ignoré")} (schéma interdit)` : "") + ".");
    } catch (e) {
      toast("Échec de la réouverture : " + (e?.message || e));
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  /* ---------- rendu ---------- */

  function renderCount() {
    const el = document.getElementById("tabgroups-count");
    if (!el) return;
    el.textContent = `${open.length} ouverts · ${folders.length} enregistrés`;
  }

  function openCard(live) {
    const el = document.createElement("article");
    el.className = "card tg-card";
    const key = String(live.group.id);
    const name = live.group.title || "Groupe sans nom";
    el.innerHTML = `
      <div class="tg-head">
        <div class="tg-info">
          <h3 class="tg-name"><span class="tg-dot" aria-hidden="true" style="background:${colorHex(live.group.color)}"></span>${esc(name)}</h3>
          <p class="muted tg-meta">fenêtre #${live.group.windowId} · ${plural(live.tabs.length, "onglet")}</p>
          ${faviconStrip(live.tabs.map((t) => t.url), FAVICON_MAX)}
        </div>
        <div class="tg-actions">
          <button type="button" class="btn btn-primary btn-sm" data-tg-action="focus" data-key="${key}" aria-label="Aller au groupe « ${esc(name)} »">Focus</button>
        </div>
      </div>`;
    return el;
  }

  function savedCard(folder) {
    const el = document.createElement("article");
    el.className = "card tg-card";
    el.innerHTML = `
      <div class="tg-head">
        <div class="tg-info">
          <h3 class="tg-name">${esc(folder.title)}</h3>
          <p class="muted tg-meta">${plural(folder.children.length, "favori")}</p>
          ${faviconStrip(folder.children.map((c) => c.url), FAVICON_MAX)}
        </div>
        <div class="tg-actions">
          <button type="button" class="btn btn-primary btn-sm" data-tg-action="reopen" data-id="${esc(folder.id)}" aria-label="Rouvrir le dossier « ${esc(folder.title)} » en groupe d'onglets">Rouvrir en groupe</button>
        </div>
      </div>`;
    return el;
  }

  function renderOpen() {
    ui.openList.replaceChildren();
    if (!tabGroupsApi()) {
      ui.openList.append(stateP("L'API des groupes d'onglets (chrome.tabGroups) est indisponible dans ce navigateur : les groupes ouverts ne peuvent pas être lus."));
      ui.ungrouped.classList.add("hidden");
      return;
    }
    if (!open.length) {
      ui.openList.append(stateP("Aucun groupe d'onglets ouvert. Regroupez des onglets dans Chrome (clic droit sur un onglet → « Ajouter l'onglet à un nouveau groupe »), puis actualisez."));
      ui.ungrouped.classList.add("hidden");
      return;
    }
    for (const live of open) ui.openList.append(openCard(live));
    ui.ungrouped.textContent = `+ ${plural(ui.ungroupedCount, "onglet")} hors groupes`;
    ui.ungrouped.classList.toggle("hidden", !ui.ungroupedCount);
  }

  function renderSaved() {
    ui.savedList.replaceChildren();
    if (!folders.length) {
      ui.savedList.append(stateP("Aucun dossier dans la barre de favoris."));
      return;
    }
    for (const f of folders) ui.savedList.append(savedCard(f));
  }

  function renderLoading() {
    ui.openList.replaceChildren(stateP("Chargement des groupes…"));
    ui.savedList.replaceChildren(stateP("Chargement des dossiers…"));
    ui.ungrouped.classList.add("hidden");
  }

  function renderError(err) {
    ui.openList.replaceChildren();
    const div = document.createElement("div");
    div.className = "tg-error";
    const msg = document.createElement("p");
    msg.className = "muted";
    msg.textContent = "Impossible de lire les groupes : " + (err?.message || err) + ".";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-ghost btn-sm";
    retry.textContent = "Réessayer";
    retry.setAttribute("aria-label", "Recharger les groupes");
    retry.addEventListener("click", load);
    div.append(msg, retry);
    ui.openList.append(div);
    ui.savedList.replaceChildren(stateP("Dossiers indisponibles pour le moment."));
  }

  function setBusy(on) {
    if (!ui) return;
    ui.root.querySelectorAll("button").forEach((b) => { b.disabled = on; });
    ui.status.textContent = on ? "Opération en cours…" : "";
  }

  /* ---------- chargement ---------- */

  async function refreshOpen() {
    if (!ui) return;
    try {
      const { groups, ungrouped } = await loadOpenGroups();
      open = groups;
      openById = new Map(open.map((l) => [String(l.group.id), l]));
      ui.ungroupedCount = ungrouped;
      renderOpen();
      renderCount();
    } catch {
      /* rafraîchissement événementiel : on garde l'affichage actuel */
    }
  }

  async function load() {
    if (!ui) return;
    renderLoading();
    try {
      const { groups, ungrouped } = await loadOpenGroups();
      open = groups;
      openById = new Map(open.map((l) => [String(l.group.id), l]));
      ui.ungroupedCount = ungrouped;
      folders = await loadSavedFolders();
      renderOpen();
      renderSaved();
      renderCount();
    } catch (e) {
      renderError(e);
    }
  }

  function scheduleOpenRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshOpen().catch(() => {}), 300);
  }

  /* ---------- styles (classes préfixées tg-) ---------- */

  const STYLES = `
#tabgroups-root .tg-list { display: flex; flex-direction: column; gap: 12px; }
#tabgroups-root .tg-card { padding: 14px 16px; }
#tabgroups-root .tg-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
#tabgroups-root .tg-info { min-width: 0; }
#tabgroups-root .tg-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin: 0 0 4px; min-width: 0; }
#tabgroups-root .tg-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; border: 1px solid #0000001f; }
#tabgroups-root .tg-meta { margin: 0 0 8px; }
#tabgroups-root .tg-actions { display: flex; gap: 8px; flex-wrap: wrap; }
#tabgroups-root .tg-state { padding: 2px 0; }
#tabgroups-root .tg-error { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
#tabgroups-root .tg-ungrouped { margin: 8px 0 0; }
#tabgroups-root .tg-status { margin-left: auto; }
`;

  function injectStyles() {
    if (document.getElementById("tg-styles")) return;
    const style = document.createElement("style");
    style.id = "tg-styles";
    style.textContent = STYLES;
    (document.head || document.documentElement).append(style);
  }

  /* ---------- en-tête et panneaux ---------- */

  function showPanel(panel, shown) {
    if (!panel) return;
    panel.classList.toggle("active", shown);
    panel.classList.toggle("hidden", !shown);
  }

  function switchPanel(name) {
    document.querySelectorAll("#header-tabgroups button[data-ttab]").forEach((b) => {
      const active = b.dataset.ttab === name;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    showPanel(ui.panelOpen, name === "open");
    showPanel(ui.panelSaved, name === "saved");
  }

  function bindHeader() {
    document.getElementById("btn-groups-refresh")?.addEventListener("click", () => load().catch(() => {}));
    document.querySelectorAll("#header-tabgroups button[data-ttab]").forEach((btn) => {
      btn.addEventListener("click", () => switchPanel(btn.dataset.ttab));
    });
  }

  function bindEvents() {
    if (!tabGroupsApi()) return;
    for (const ev of ["onCreated", "onRemoved", "onUpdated"]) {
      chrome.tabGroups[ev]?.addListener?.(scheduleOpenRefresh);
    }
    chrome.tabs.onUpdated?.addListener?.(scheduleOpenRefresh);
  }

  /* ---------- construction et init ---------- */

  function buildUI(root) {
    root.innerHTML = `
      <div class="panel active" id="tg-panel-open">
        <p class="section-note">Groupes d'onglets ouverts dans Chrome. « Focus » met la fenêtre au premier plan et active le premier onglet du groupe.</p>
        <div class="toolbar"><span class="muted tg-status" role="status" aria-live="polite"></span></div>
        <div class="tg-list" data-tg-open aria-label="Groupes d'onglets ouverts"></div>
        <p class="muted tg-ungrouped hidden" data-tg-ungrouped></p>
      </div>
      <div class="panel hidden" id="tg-panel-saved">
        <p class="section-note">Dossiers de premier niveau de la barre de favoris (dont les groupes enregistrés par Chrome). « Rouvrir en groupe » ouvre leurs favoris dans une nouvelle fenêtre, regroupés et nommés comme le dossier.</p>
        <div class="tg-list" data-tg-saved aria-label="Dossiers de la barre de favoris"></div>
      </div>`;
    ui.root = root;
    ui.panelOpen = root.querySelector("#tg-panel-open");
    ui.panelSaved = root.querySelector("#tg-panel-saved");
    ui.status = root.querySelector(".tg-status");
    ui.openList = root.querySelector("[data-tg-open]");
    ui.savedList = root.querySelector("[data-tg-saved]");
    ui.ungrouped = root.querySelector("[data-tg-ungrouped]");
    ui.ungroupedCount = 0;
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tg-action]");
      if (!btn) return;
      if (btn.dataset.tgAction === "focus") {
        const live = openById.get(btn.dataset.key);
        if (live) focusGroup(live);
      } else if (btn.dataset.tgAction === "reopen") {
        const folder = folders.find((f) => f.id === btn.dataset.id);
        if (folder) reopenFolder(folder);
      }
    });
    bindHeader();
  }

  async function focusGroup(live) {
    try {
      await chrome.windows.update(live.group.windowId, { focused: true });
      if (live.tabs.length) await chrome.tabs.update(live.tabs[0].id, { active: true });
    } catch {
      toast("Impossible d'atteindre ce groupe : fenêtre ou onglet disparu.");
    }
  }

  function boot() {
    injectStyles();
    const root = document.getElementById("tabgroups-root");
    if (!root) return;
    if (root.childElementCount) return; // déjà construit : init idempotent
    buildUI(root);
    bindEvents();
    load();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }

  window.BSTabGroups = { init };
})();
