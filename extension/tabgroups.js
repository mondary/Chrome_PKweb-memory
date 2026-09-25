/* Groupes ouverts de Chrome et copies indépendantes conservées par l'extension.
   Chrome n'expose AUCUNE API pour lire les groupes enregistrés fermés (ils vivent
   dans le stockage de synchronisation, pas dans les favoris) : la seule fenêtre
   de lecture est le moment où un groupe est ouvert. Chaque groupe ouvert et nommé
   est donc capturé automatiquement dans la bibliothèque locale, où il devient
   modifiable, rouvrable et supprimable sans jamais le rouvrir. */
"use strict";

(() => {
  const BAR_ID = "1"; // id fixe de la barre de favoris dans Chrome
  const FAVICON_MAX = 10;
  const STORAGE_KEY = "bs_tabgroups_v1";
  const AUTO_KEY = "bs_tabgroups_auto_v1"; // capture automatique activée (défaut : oui)

  // Les 9 couleurs reconnues par chrome.tabGroups (table partagée dans sessionlib.js).
  const GROUP_COLORS = globalThis.BSSessionLib?.GROUP_COLORS || {
    grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00",
    green: "#188038", pink: "#d01884", orange: "#fa7b17", purple: "#a142f4", cyan: "#24c1e0",
  };
  const cleanEntry = (entry) => globalThis.BSSessionLib?.cleanGroupEntry?.(entry) || null;
  const cleanSavedGroup = (item) => globalThis.BSSessionLib?.cleanSavedGroup?.(item) || null;

  let initialized = false;
  let eventsBound = false;
  let headerBound = false;
  let open = [];            // groupes vivants : { group, tabs }
  let openById = new Map(); // groupId (string) → groupe vivant
  let saved = [];           // copies gérées par l'extension, indépendantes des groupes Chrome
  let folders = [];         // vrais dossiers de premier niveau de la barre de favoris
  let openError = null;
  let savedError = null;
  let folderError = null;
  let busy = false;
  let ui = null;
  let refreshTimer = null;
  let editorTarget = null;
  let autoCaptureOn = true;

  /* ---------- helpers locaux (aucune dépendance à app.js) ---------- */

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

  // Toast autonome : ne dépend d'aucun élément du document, se crée au besoin.
  function toast(msg) {
    let el = document.getElementById("bss-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "bss-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#18181b;color:#fff;border-radius:8px;padding:10px 16px;font:13px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);z-index:9999;max-width:min(480px,90vw);text-align:center;white-space:normal;";
      (document.body || document.documentElement).append(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = "none"; }, 3500);
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

  function restorable(url) {
    try { return ["http:", "https:"].includes(new URL(url).protocol); }
    catch { return false; }
  }

  // Onglet suspendu → onglet réel (déballage partagé dans sessionlib.js,
  // chargé avant ce script ; URL et titre réels, favicône du suspendeur écartée).
  const unwrapSuspended = (url) => window.BSSessionLib?.unwrapSuspended?.(url) || null;

  // Onglet suspendu → onglet réel (url + titre déballés, favicône du suspendeur écartée).
  function unwrapTab(t) {
    const real = unwrapSuspended(t.url);
    if (!real) return t;
    return { ...t, url: real.url, title: real.title || t.title, favIconUrl: undefined };
  }

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
    for (const raw of tabs) {
      const t = unwrapTab(raw);
      if (!Number.isInteger(t.groupId) || t.groupId === -1) { ungrouped++; continue; }
      if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
      byGroup.get(t.groupId).push(t);
    }
    for (const groupedTabs of byGroup.values()) groupedTabs.sort((a, b) => a.index - b.index);
    const live = groups
      .map((g) => ({ group: g, tabs: byGroup.get(g.id) || [] }))
      .sort((a, b) =>
        (a.group.windowId - b.group.windowId)
        || String(a.group.title || "").localeCompare(String(b.group.title || ""), "fr"));
    return { groups: live, ungrouped };
  }

  /* ---------- copies locales et vrais dossiers de favoris ---------- */

  async function loadSavedGroups() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return (Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [])
      .map(cleanSavedGroup).filter(Boolean);
  }

  async function storeSavedGroups(next) {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    saved = next;
    renderSaved();
    renderCount();
  }

  async function loadAutoFlag() {
    try {
      const data = await chrome.storage.local.get(AUTO_KEY);
      if (typeof data[AUTO_KEY] === "boolean") autoCaptureOn = data[AUTO_KEY];
    } catch { /* défaut : activé */ }
  }

  // Capture manuelle : la capture automatique tourne dans le service worker
  // (elle capte les groupes ouverts même extension fermée) ; ce bouton force
  // la même fusion immédiatement depuis la page.
  async function captureNow() {
    const lib = globalThis.BSSessionLib;
    if (!lib?.mergeCapturedGroups) return;
    const { next, created, updated } = lib.mergeCapturedGroups(open, saved);
    if (created || updated) await storeSavedGroups(next);
    toast(created || updated
      ? `${plural(created, "groupe")} capturé${created > 1 ? "s" : ""}, ${plural(updated, "groupe")} mis à jour.`
      : "Rien à capturer : les groupes ouverts sont déjà dans la bibliothèque.");
  }

  async function loadSavedFolders() {
    // getChildren() ne remplit pas `children` sur ses dossiers. getSubTree() le fait.
    const [bar] = await chrome.bookmarks.getSubTree(BAR_ID);
    return (bar?.children || [])
      .filter((node) => !node.url)
      .map((node) => ({
        id: node.id,
        title: (node.title || "").trim() || "Sans nom",
        children: (node.children || []).filter((child) => child.url),
      }));
  }

  async function reopenEntries(title, color, entries) {
    if (busy) return;
    busy = true;
    setBusy(true);
    let ignored = 0;
    let windowId;
    const tabIds = [];
    try {
      for (const child of entries || []) {
        if (!restorable(child.url)) { ignored++; continue; }
        try {
          if (windowId === undefined) {
            const win = await chrome.windows.create({ url: child.url });
            windowId = win.id;
            const first = (await chrome.tabs.query({ windowId }))[0];
            if (first?.id !== undefined) { tabIds.push(first.id); continue; }
          }
          const tab = await chrome.tabs.create({ windowId, url: child.url });
          tabIds.push(tab.id);
        } catch { ignored++; }
      }
      if (windowId === undefined || !tabIds.length) { toast("Ce groupe ne contient aucun lien ouvrable."); return; }
      if (tabIds.length && typeof chrome.tabs?.group === "function") {
        try {
          const gid = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
          await chrome.tabGroups.update(gid, { title: title || "", color: GROUP_COLORS[color] ? color : "grey" });
        } catch (e) { toast("Onglets ouverts, mais regroupement impossible : " + (e?.message || e)); return; }
      }
      toast(`Groupe « ${title} » rouvert : ${plural(tabIds.length, "onglet")}` + (ignored ? `, ${plural(ignored, "lien")} ignoré${ignored > 1 ? "s" : ""}` : "") + ".");
    } catch (e) {
      toast("Échec de la réouverture : " + (e?.message || e));
    } finally {
      busy = false;
      setBusy(false);
      scheduleRefresh();
    }
  }

  /* ---------- rendu ---------- */

  function renderCount() {
    const el = document.getElementById("tabgroups-count");
    if (el) el.textContent = `${open.length} ouverts · ${saved.length} copies · ${folders.length} dossiers`;
    if (ui?.openCount) ui.openCount.textContent = plural(open.length, "groupe");
    if (ui?.savedCount) ui.savedCount.textContent = plural(saved.length, "copie");
    if (ui?.folderCount) ui.folderCount.textContent = plural(folders.length, "dossier");
  }

  function openCard(live) {
    const el = document.createElement("article");
    el.className = "card tg-card";
    const key = String(live.group.id);
    const name = live.group.title || "Groupe sans nom";
    const rows = live.tabs
      .map((t, i) => `
        <li class="tg-tab">
          <button type="button" class="tg-tab-btn" data-tg-action="tab" data-key="${key}" data-index="${i}" title="${esc(t.title || t.url || "Onglet sans titre")}">
            <img class="fav-ico" src="${esc(t.favIconUrl || faviconUrl(t.url))}" alt="" loading="lazy">
            <span class="tg-tab-title">${esc(t.title || t.url || "Onglet sans titre")}</span>
            <span class="muted tg-tab-host">${esc(hostnameOf(t.url || ""))}</span>
          </button>
          <button type="button" class="btn btn-ghost btn-sm tg-row-action" data-tg-action="detach" data-key="${key}" data-index="${i}" aria-label="Sortir « ${esc(t.title || t.url || "Onglet")} » du groupe">Sortir</button>
        </li>`)
      .join("");
    el.innerHTML = `
      <div class="tg-head">
        <div class="tg-info">
          <h3 class="tg-name"><span class="tg-dot" aria-hidden="true" style="background:${colorHex(live.group.color)}"></span>${esc(name)}</h3>
          <p class="muted tg-meta">fenêtre #${live.group.windowId} · ${plural(live.tabs.length, "onglet")}${live.group.shared ? " · partagé" : ""}</p>
          ${faviconStrip(live.tabs.map((t) => t.url), FAVICON_MAX)}
        </div>
        <div class="tg-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="edit-live" data-key="${key}">Modifier</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="collapse" data-key="${key}">${live.group.collapsed ? "Déplier" : "Replier"}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="copy-open" data-key="${key}">Copier ici</button>
          <button type="button" class="btn btn-primary btn-sm" data-tg-action="focus" data-key="${key}" aria-label="Aller au groupe « ${esc(name)} »">Focus</button>
        </div>
      </div>
      ${live.tabs.length ? `<ul class="tg-tabs">${rows}</ul>` : '<p class="muted tg-state">Aucun onglet dans ce groupe.</p>'}`;
    return el;
  }

  function savedCard(group) {
    const el = document.createElement("article");
    el.className = "card tg-card";
    const rows = group.tabs.map((t, i) => `
      <li class="tg-tab"><button type="button" class="tg-tab-btn" data-tg-action="saved-tab" data-id="${esc(group.id)}" data-index="${i}" title="${esc(t.url)}">
        <img class="fav-ico" src="${esc(faviconUrl(t.url))}" alt="" loading="lazy">
        <span class="tg-tab-title">${esc(t.title || hostnameOf(t.url))}</span>
        <span class="muted tg-tab-host">${esc(hostnameOf(t.url))}</span>
      </button></li>`).join("");
    el.innerHTML = `
      <div class="tg-head">
        <div class="tg-info">
          <h3 class="tg-name"><span class="tg-dot" aria-hidden="true" style="background:${colorHex(group.color)}"></span>${esc(group.title)}</h3>
          <p class="muted tg-meta">${plural(group.tabs.length, "onglet")} · copie locale</p>
          ${faviconStrip(group.tabs.map((t) => t.url), FAVICON_MAX)}
        </div>
        <div class="tg-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="edit-saved" data-id="${esc(group.id)}">Modifier</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="delete-saved" data-id="${esc(group.id)}">Supprimer la copie</button>
          <button type="button" class="btn btn-primary btn-sm" data-tg-action="reopen-saved" data-id="${esc(group.id)}">Rouvrir en groupe</button>
        </div>
      </div>
      <ul class="tg-tabs">${rows}</ul>`;
    return el;
  }

  function folderCard(folder) {
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
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="copy-folder" data-id="${esc(folder.id)}">Copier ici</button>
          <button type="button" class="btn btn-primary btn-sm" data-tg-action="reopen-folder" data-id="${esc(folder.id)}">Rouvrir en groupe</button>
        </div>
      </div>`;
    return el;
  }

  function renderOpen() {
    ui.openList.replaceChildren();
    if (openError) {
      ui.openList.append(stateP("Impossible de lire les groupes ouverts : " + (openError?.message || openError)));
      ui.ungrouped.classList.add("hidden");
      return;
    }
    if (!tabGroupsApi()) {
      ui.openList.append(stateP("L'API des groupes d'onglets (chrome.tabGroups) est indisponible dans ce navigateur : les groupes ouverts ne peuvent pas être lus."));
      ui.ungrouped.classList.add("hidden");
      return;
    }
    if (!open.length) {
      ui.openList.append(stateP("Aucun groupe ouvert. Ouvrez un groupe Chrome depuis sa barre de favoris : il apparaîtra ici et vous pourrez en faire une copie modifiable sans le garder ouvert."));
      ui.ungrouped.classList.add("hidden");
      return;
    }
    for (const live of open) ui.openList.append(openCard(live));
    ui.ungrouped.textContent = `+ ${plural(ui.ungroupedCount, "onglet")} hors groupes`;
    ui.ungrouped.classList.toggle("hidden", !ui.ungroupedCount);
  }

  function renderSaved() {
    ui.savedList.replaceChildren();
    if (savedError) {
      ui.savedList.append(stateP("Impossible de lire les copies locales : " + (savedError?.message || savedError)));
      return;
    }
    if (!saved.length) {
      ui.savedList.append(stateP("Bibliothèque vide. Ouvrez un groupe enregistré depuis sa barre de favoris : il sera capturé automatiquement. Vous pourrez ensuite le modifier, le rouvrir ou le supprimer d'ici, sans le garder ouvert dans Chrome."));
      return;
    }
    for (const group of saved) ui.savedList.append(savedCard(group));
  }

  function renderFolders() {
    ui.folderList.replaceChildren();
    if (folderError) {
      ui.folderList.append(stateP("Impossible de lire les dossiers de favoris : " + (folderError?.message || folderError)));
      return;
    }
    if (!folders.length) {
      ui.folderList.append(stateP("Aucun dossier dans la barre de favoris."));
      return;
    }
    for (const folder of folders) ui.folderList.append(folderCard(folder));
  }

  function renderLoading() {
    ui.openList.replaceChildren(stateP("Chargement des groupes…"));
    ui.savedList.replaceChildren(stateP("Chargement des copies…"));
    ui.folderList.replaceChildren(stateP("Chargement des dossiers…"));
    ui.ungrouped.classList.add("hidden");
  }

  function setBusy(on) {
    if (!ui?.root) return;
    ui.root.querySelectorAll("button").forEach((b) => { b.disabled = on; });
    if (ui.status) ui.status.textContent = on ? "Opération en cours…" : "";
  }

  /* ---------- chargement et rafraîchissement ---------- */

  async function fetchAll() {
    const [opened, stored, bookmarked] = await Promise.allSettled([
      loadOpenGroups(), loadSavedGroups(), loadSavedFolders(),
    ]);
    openError = opened.status === "rejected" ? opened.reason : null;
    if (!openError) {
      open = opened.value.groups;
      openById = new Map(open.map((live) => [String(live.group.id), live]));
      ui.ungroupedCount = opened.value.ungrouped;
    }
    savedError = stored.status === "rejected" ? stored.reason : null;
    if (!savedError) saved = stored.value;
    folderError = bookmarked.status === "rejected" ? bookmarked.reason : null;
    if (!folderError) folders = bookmarked.value;
  }

  async function load() {
    if (!ui?.openList) return;
    renderLoading();
    await fetchAll();
    renderOpen();
    renderSaved();
    renderFolders();
    renderCount();
  }

  // Re-render complet silencieux (événements Chrome) : en cas d'échec on garde l'affichage actuel.
  async function refreshAll() {
    if (!ui?.openList) return;
    try {
      await fetchAll();
      renderOpen();
      renderSaved();
      renderFolders();
      renderCount();
    } catch { /* silencieux */ }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshAll().catch(() => {}), 300);
  }

  /* ---------- styles (classes préfixées tg-) ---------- */

  const STYLES = `
#tabgroups-root { display: flex; flex-direction: column; gap: 28px; }
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
#tabgroups-root .tg-tabs { list-style: none; margin: 10px 0 0; padding: 8px 0 0; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--border, #e4e4e7); }
#tabgroups-root .tg-tab { display: flex; align-items: center; gap: 4px; min-width: 0; }
#tabgroups-root .tg-tab-btn { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; width: 100%; text-align: left; background: none; border: none; border-radius: 6px; padding: 4px 6px; font: inherit; font-size: 13px; color: inherit; cursor: pointer; min-width: 0; }
#tabgroups-root .tg-tab-btn:hover { background: var(--muted-bg, #f4f4f5); }
#tabgroups-root .tg-tab-btn:focus-visible { outline: 2px solid #52525b; outline-offset: -2px; }
#tabgroups-root .tg-tab-btn .fav-ico { flex: none; }
#tabgroups-root .tg-row-action { flex: none; }
#tabgroups-root .tg-tab-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
#tabgroups-root .tg-tab-host { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; min-width: 0; text-align: right; }
#tabgroups-root .tg-editor { width: min(720px, calc(100vw - 32px)); max-height: min(85vh, 840px); padding: 0; border: 1px solid var(--border, #e4e4e7); border-radius: 14px; color: var(--fg, #18181b); background: var(--bg, white); box-shadow: 0 20px 65px #0003; }
#tabgroups-root .tg-editor::backdrop { background: #09090b80; }
#tabgroups-root .tg-editor-form { display: flex; flex-direction: column; max-height: min(85vh, 840px); }
#tabgroups-root .tg-editor-head, #tabgroups-root .tg-editor-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border, #e4e4e7); }
#tabgroups-root .tg-editor-head h2 { margin: 0; font-size: 17px; }
#tabgroups-root .tg-editor-foot { border-bottom: 0; border-top: 1px solid var(--border, #e4e4e7); justify-content: flex-end; }
#tabgroups-root .tg-editor-body { overflow: auto; padding: 18px 20px; display: grid; gap: 14px; }
#tabgroups-root .tg-field { display: grid; gap: 5px; font-size: 12px; font-weight: 600; }
#tabgroups-root .tg-field input, #tabgroups-root .tg-field select { width: 100%; max-width: none; box-sizing: border-box; }
#tabgroups-root .tg-field-inline { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 12px; }
#tabgroups-root .tg-edit-list { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
#tabgroups-root .tg-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto; align-items: center; gap: 6px; }
#tabgroups-root .tg-edit-row input { width: 100%; min-width: 0; max-width: none; box-sizing: border-box; }
#tabgroups-root .tg-edit-controls { display: flex; gap: 3px; }
#tabgroups-root .tg-edit-add { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto; gap: 6px; }
#tabgroups-root .tg-edit-add input { min-width: 0; width: 100%; max-width: none; box-sizing: border-box; }
#tabgroups-root .tg-editor-note { font-size: 12px; margin: 0; }
@media (max-width: 600px) {
  #tabgroups-root .tg-field-inline { grid-template-columns: 1fr; }
  #tabgroups-root .tg-edit-row, #tabgroups-root .tg-edit-add { grid-template-columns: 1fr; }
  #tabgroups-root .tg-edit-controls { justify-content: flex-end; }
}
`;

  function injectStyles() {
    if (document.getElementById("tg-styles")) return;
    const style = document.createElement("style");
    style.id = "tg-styles";
    style.textContent = STYLES;
    (document.head || document.documentElement).append(style);
  }

  /* ---------- wiring (toujours au boot, avant toute garde de retour) ---------- */

  function bindHeader() {
    if (headerBound) return;
    headerBound = true;
    document.getElementById("btn-groups-refresh")?.addEventListener("click", () => load().catch(() => {}));
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    for (const ev of ["onCreated", "onUpdated", "onRemoved", "onMoved"]) {
      chrome.tabGroups?.[ev]?.addListener?.(scheduleRefresh);
    }
    for (const ev of ["onCreated", "onUpdated", "onRemoved", "onMoved", "onAttached", "onDetached", "onReplaced"]) {
      chrome.tabs?.[ev]?.addListener?.(scheduleRefresh);
    }
    for (const ev of ["onCreated", "onRemoved"]) {
      chrome.windows?.[ev]?.addListener?.(scheduleRefresh);
    }
    chrome.bookmarks?.onCreated?.addListener?.(scheduleRefresh);
    chrome.bookmarks?.onRemoved?.addListener?.(scheduleRefresh);
    chrome.bookmarks?.onChanged?.addListener?.(scheduleRefresh);
    chrome.bookmarks?.onMoved?.addListener?.(scheduleRefresh);
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) scheduleRefresh();
    });
  }

  /* ---------- construction ---------- */

  function buildUI(root) {
    ui = {};
    root.innerHTML = `
      <section class="block" aria-labelledby="tg-open-title">
        <div class="block-title">
          <h2 id="tg-open-title">Groupes ouverts</h2>
          <span class="muted" data-tg-open-count aria-live="polite"></span>
        </div>
        <p class="section-note">Groupes actuellement ouverts dans Chrome : renommage, couleur, repli, sortie d'un onglet… Tout groupe ouvert et nommé est <strong>capturé automatiquement</strong> dans la bibliothèque ci-dessous — l'unique moyen de lire les groupes enregistrés de Chrome, qui ne sont visibles par aucune extension tant qu'ils restent fermés.</p>
        <div class="toolbar">
          <label class="check tg-auto-label"><input type="checkbox" data-tg-auto checked> Capture automatique</label>
          <button type="button" class="btn btn-ghost btn-sm" data-tg-action="capture-now">Capturer maintenant</button>
          <span class="muted tg-status" role="status" aria-live="polite"></span>
        </div>
        <div class="tg-list" data-tg-open aria-label="Groupes d'onglets ouverts"></div>
        <p class="muted tg-ungrouped hidden" data-tg-ungrouped></p>
      </section>
      <section class="block" aria-labelledby="tg-saved-title">
        <div class="block-title">
          <h2 id="tg-saved-title">Ma bibliothèque de groupes</h2>
          <span class="muted" data-tg-saved-count aria-live="polite"></span>
        </div>
        <p class="section-note">Pour récupérer un groupe enregistré dans la barre de favoris : <strong>cliquez sa pastille une fois</strong> — il s'ouvre et entre ici automatiquement. Vous pouvez alors supprimer la pastille Chrome (clic droit → Supprimer le groupe) et gérer le groupe à partir de cette page : onglets, URL, ordre, titre, couleur, réouverture en un clic. Chrome ne fournit aucun accès aux groupes enregistrés fermés, ouverts-les donc une seule fois.</p>
        <div class="tg-list" data-tg-saved aria-label="Copies de groupes enregistrées dans l'extension"></div>
      </section>
      <section class="block" aria-labelledby="tg-folders-title">
        <div class="block-title">
          <h2 id="tg-folders-title">Dossiers de favoris</h2>
          <span class="muted" data-tg-folder-count aria-live="polite"></span>
        </div>
        <p class="section-note">Vrais dossiers de la barre de favoris. Ce sont des favoris ordinaires, distincts des groupes Chrome enregistrés. Vous pouvez en copier les liens dans votre bibliothèque ou les rouvrir dans un groupe.</p>
        <div class="tg-list" data-tg-folders aria-label="Dossiers de favoris"></div>
      </section>
      <dialog class="tg-editor" aria-labelledby="tg-editor-title">
        <form class="tg-editor-form">
          <div class="tg-editor-head">
            <h2 id="tg-editor-title">Modifier le groupe</h2>
            <button type="button" class="btn btn-ghost btn-sm" data-tg-action="editor-close" aria-label="Fermer">✕</button>
          </div>
          <div class="tg-editor-body">
            <div class="tg-field-inline">
              <label class="tg-field">Nom<input type="text" data-tg-edit-title maxlength="200" required></label>
              <label class="tg-field">Couleur<select data-tg-edit-color>${Object.keys(GROUP_COLORS).map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
            </div>
            <label class="tg-field tg-edit-collapsed"><span><input type="checkbox" data-tg-edit-collapsed> Groupe replié dans Chrome</span></label>
            <div class="tg-edit-tabs">
              <strong>Onglets</strong>
              <p class="muted tg-editor-note">Modifiez les liens et leur ordre. Les changements seront enregistrés dans la copie locale.</p>
              <ol class="tg-edit-list" data-tg-edit-list></ol>
              <div class="tg-edit-add">
                <input type="text" data-tg-add-title placeholder="Nom du nouvel onglet" aria-label="Nom du nouvel onglet">
                <input type="url" data-tg-add-url placeholder="https://exemple.com" aria-label="URL du nouvel onglet">
                <button type="button" class="btn btn-ghost btn-sm" data-tg-action="editor-add">Ajouter</button>
              </div>
            </div>
          </div>
          <div class="tg-editor-foot">
            <button type="button" class="btn btn-ghost btn-sm" data-tg-action="editor-close">Annuler</button>
            <button type="submit" class="btn btn-primary btn-sm">Enregistrer</button>
          </div>
        </form>
      </dialog>`;
    ui.root = root;
    ui.status = root.querySelector(".tg-status");
    ui.openList = root.querySelector("[data-tg-open]");
    ui.openCount = root.querySelector("[data-tg-open-count]");
    ui.savedList = root.querySelector("[data-tg-saved]");
    ui.savedCount = root.querySelector("[data-tg-saved-count]");
    ui.folderList = root.querySelector("[data-tg-folders]");
    ui.folderCount = root.querySelector("[data-tg-folder-count]");
    ui.ungrouped = root.querySelector("[data-tg-ungrouped]");
    ui.ungroupedCount = 0;
    ui.autoCheck = root.querySelector("[data-tg-auto]");
    ui.autoCheck.checked = autoCaptureOn;
    ui.autoCheck.addEventListener("change", async () => {
      autoCaptureOn = ui.autoCheck.checked;
      try {
        await chrome.storage.local.set({ [AUTO_KEY]: autoCaptureOn });
        if (autoCaptureOn) await captureNow().catch(() => {});
        toast(autoCaptureOn
          ? "Capture automatique activée : chaque groupe ouvert entre dans la bibliothèque."
          : "Capture automatique désactivée.");
      } catch { toast("Réglage impossible à enregistrer."); }
    });
    ui.editor = root.querySelector(".tg-editor");
    ui.editorTitle = root.querySelector("[data-tg-edit-title]");
    ui.editorColor = root.querySelector("[data-tg-edit-color]");
    ui.editorCollapsed = root.querySelector("[data-tg-edit-collapsed]");
    ui.editorList = root.querySelector("[data-tg-edit-list]");
    ui.editorAddTitle = root.querySelector("[data-tg-add-title]");
    ui.editorAddUrl = root.querySelector("[data-tg-add-url]");
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tg-action]");
      if (!btn) return;
      handleAction(btn).catch((err) => toast("Opération impossible : " + (err?.message || err)));
    });
    ui.editor.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      saveEditor().catch((err) => toast("Enregistrement impossible : " + (err?.message || err)));
    });
    ui.editor.addEventListener("close", () => { editorTarget = null; });
  }

  async function runBusy(action) {
    if (busy) return;
    busy = true;
    setBusy(true);
    try { await action(); }
    finally { busy = false; setBusy(false); }
  }

  function snapshot(title, color, entries) {
    const tabs = entries.map(cleanEntry).filter(Boolean);
    if (!tabs.length) {
      toast("Aucun onglet Web copiable dans ce groupe.");
      return null;
    }
    return {
      id: crypto.randomUUID(),
      title: String(title || "Groupe sans nom").trim(),
      color: Object.hasOwn(GROUP_COLORS, color) ? color : "grey",
      tabs,
      updatedAt: Date.now(),
    };
  }

  async function copyToLibrary(group) {
    if (!group) return;
    await runBusy(async () => {
      await storeSavedGroups([group, ...saved]);
      toast(`« ${group.title} » copié dans la bibliothèque.`);
    });
  }

  function editRow(entry) {
    const row = document.createElement("li");
    row.className = "tg-edit-row";
    row.innerHTML = `
      <input type="text" data-tg-row-title maxlength="300" placeholder="Nom" aria-label="Nom de l'onglet">
      <input type="url" data-tg-row-url required placeholder="https://exemple.com" aria-label="URL de l'onglet">
      <span class="tg-edit-controls">
        <button type="button" class="btn btn-ghost btn-sm" data-tg-action="editor-up" aria-label="Monter l'onglet">↑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tg-action="editor-down" aria-label="Descendre l'onglet">↓</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tg-action="editor-remove" aria-label="Retirer l'onglet">✕</button>
      </span>`;
    row.querySelector("[data-tg-row-title]").value = entry.title || "";
    row.querySelector("[data-tg-row-url]").value = entry.url || "";
    return row;
  }

  function openEditor(mode, id) {
    const item = mode === "live" ? openById.get(String(id)) : saved.find((g) => g.id === id);
    if (!item) { toast("Ce groupe n'est plus disponible."); return; }
    editorTarget = { mode, id };
    const group = mode === "live" ? item.group : item;
    ui.editor.querySelector("#tg-editor-title").textContent = mode === "live" ? "Modifier le groupe Chrome" : "Modifier la copie locale";
    ui.editorTitle.value = group.title || "";
    ui.editorColor.value = Object.hasOwn(GROUP_COLORS, group.color) ? group.color : "grey";
    ui.editorCollapsed.checked = !!group.collapsed;
    ui.editor.querySelector(".tg-edit-collapsed").classList.toggle("hidden", mode !== "live");
    ui.editor.querySelector(".tg-edit-tabs").classList.toggle("hidden", mode !== "saved");
    ui.editorList.replaceChildren(...(mode === "saved" ? item.tabs.map(editRow) : []));
    ui.editorAddTitle.value = "";
    ui.editorAddUrl.value = "";
    ui.editor.showModal();
    ui.editorTitle.focus();
  }

  async function saveEditor() {
    if (!editorTarget || busy) return;
    const { mode, id } = editorTarget;
    const title = ui.editorTitle.value.trim() || "Groupe sans nom";
    const color = ui.editorColor.value;
    if (mode === "live") {
      const live = openById.get(String(id));
      if (!live) throw new Error("Le groupe Chrome a été fermé.");
      await runBusy(async () => {
        await chrome.tabGroups.update(live.group.id, { title, color, collapsed: ui.editorCollapsed.checked });
        ui.editor.close();
        await refreshAll();
        toast("Groupe Chrome modifié.");
      });
      return;
    }
    const rows = [...ui.editorList.querySelectorAll(".tg-edit-row")];
    if (!rows.length) { toast("Ajoutez au moins un onglet avant d'enregistrer."); return; }
    const tabs = [];
    for (const row of rows) {
      const urlInput = row.querySelector("[data-tg-row-url]");
      const url = urlInput.value.trim();
      if (!restorable(url)) {
        urlInput.focus();
        toast("Chaque URL doit commencer par http:// ou https://.");
        return;
      }
      tabs.push({ url, title: row.querySelector("[data-tg-row-title]").value.trim() });
    }
    const index = saved.findIndex((g) => g.id === id);
    if (index < 0) throw new Error("Cette copie a été supprimée.");
    const next = [...saved];
    next[index] = { ...next[index], title, color, tabs, updatedAt: Date.now() };
    await runBusy(async () => {
      await storeSavedGroups(next);
      ui.editor.close();
      toast("Copie mise à jour.");
    });
  }

  async function openOrFocusUrl(url) {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => tab.url === url);
    if (existing) return activateTab(existing);
    await chrome.tabs.create({ url });
  }

  async function handleAction(btn) {
    const action = btn.dataset.tgAction;
    if (action === "editor-close") { ui.editor.close(); return; }
    if (busy) return;
    if (action.startsWith("editor-")) {
      if (action === "editor-add") {
        const url = ui.editorAddUrl.value.trim();
        if (!restorable(url)) { ui.editorAddUrl.focus(); toast("Saisissez une URL http:// ou https://."); return; }
        ui.editorList.append(editRow({ url, title: ui.editorAddTitle.value.trim() }));
        ui.editorAddTitle.value = "";
        ui.editorAddUrl.value = "";
        ui.editorAddTitle.focus();
      } else {
        const row = btn.closest(".tg-edit-row");
        if (!row) return;
        if (action === "editor-remove") row.remove();
        if (action === "editor-up" && row.previousElementSibling) row.before(row.previousElementSibling);
        if (action === "editor-down" && row.nextElementSibling) row.after(row.nextElementSibling);
      }
      return;
    }
    const live = openById.get(btn.dataset.key);
    const group = saved.find((item) => item.id === btn.dataset.id);
    const folder = folders.find((item) => item.id === btn.dataset.id);
    if (action === "capture-now") return runBusy(captureNow);
    if (action === "focus" && live) return focusGroup(live);
    if (action === "tab" && live) return activateTab(live.tabs[Number(btn.dataset.index)]);
    if (action === "edit-live") return openEditor("live", btn.dataset.key);
    if (action === "edit-saved") return openEditor("saved", btn.dataset.id);
    if (action === "collapse" && live) {
      return runBusy(async () => {
        await chrome.tabGroups.update(live.group.id, { collapsed: !live.group.collapsed });
        await refreshAll();
      });
    }
    if (action === "detach" && live) {
      const tab = live.tabs[Number(btn.dataset.index)];
      if (!tab) return;
      return runBusy(async () => {
        await chrome.tabs.ungroup(tab.id);
        await refreshAll();
        toast("Onglet sorti du groupe ; la page reste ouverte.");
      });
    }
    if (action === "copy-open" && live) return copyToLibrary(snapshot(live.group.title, live.group.color, live.tabs));
    if (action === "copy-folder" && folder) return copyToLibrary(snapshot(folder.title, "grey", folder.children));
    if (action === "reopen-saved" && group) return reopenEntries(group.title, group.color, group.tabs);
    if (action === "reopen-folder" && folder) return reopenEntries(folder.title, "grey", folder.children);
    if (action === "saved-tab" && group) return openOrFocusUrl(group.tabs[Number(btn.dataset.index)]?.url);
    if (action === "delete-saved" && group) {
      if (!window.confirm(`Supprimer la copie locale « ${group.title} » ?`)) return;
      return runBusy(async () => {
        await storeSavedGroups(saved.filter((item) => item.id !== group.id));
        toast("Copie supprimée.");
      });
    }
  }

  async function focusGroup(live) {
    try {
      await chrome.windows.update(live.group.windowId, { focused: true });
      if (live.tabs.length) await chrome.tabs.update(live.tabs[0].id, { active: true });
    } catch {
      toast("Impossible d'atteindre ce groupe : fenêtre ou onglet disparu.");
    }
  }

  // Ligne d'onglet cliquable : fenêtre au premier plan + onglet actif ;
  // si l'onglet n'existe plus, on rouvre son URL.
  async function activateTab(tab) {
    try {
      const t = await chrome.tabs.get(tab.id);
      await chrome.windows.update(t.windowId, { focused: true });
      await chrome.tabs.update(t.id, { active: true });
    } catch {
      try {
        await chrome.tabs.create({ url: tab.url });
      } catch (e) {
        toast("Ouverture impossible : " + (e?.message || e));
      }
    }
  }

  function boot() {
    injectStyles();
    // Listeners et bouton d'en-tête d'abord : aucune garde de retour ne doit les court-circuiter.
    bindEvents();
    bindHeader();
    const root = document.getElementById("tabgroups-root");
    if (!root) return;
    if (root.childElementCount) { load().catch(() => {}); return; } // déjà construit : simple rafraîchissement
    buildUI(root);
    loadAutoFlag().then(() => {
      ui.autoCheck.checked = autoCaptureOn;
      return load();
    }).catch(() => {});
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }

  window.BSTabGroups = { init };
})();
