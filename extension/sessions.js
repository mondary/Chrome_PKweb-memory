/* Gestionnaire de sessions : capture les fenêtres/onglets ouverts, les stocke datés
   dans chrome.storage.local (« bs.sessions », 40 max, FIFO) et les restaure.
   Script classique chargé avant app.js — n'expose que window.BSSessions = { init }.
   NB : le mapping groupId → nom/couleur nécessite la permission « tabGroups » dans
   le manifest ; en son absence la capture fonctionne sans noms de groupes. */
"use strict";

(() => {
  const KEY = "bs.sessions";
  const GROUPS_KEY = "bs.tabgroups"; // clé du module Groupes — contrat partagé, jamais écrite ici
  const MAX_SESSIONS = 40;
  // Schémas que chrome.tabs.create refuse ou ne doit pas rouvrir depuis une session.
  const BLOCKED_SCHEME = /^(chrome|chrome-untrusted|chrome-extension|edge|about|devtools|view-source|javascript|data|file):/i;

  const store = {
    get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
    set: (obj) => chrome.storage.local.set(obj),
  };

  const GROUP_COLORS = {
    grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00",
    green: "#188038", pink: "#d01884", orange: "#fa7b17", purple: "#a142f4", cyan: "#24c1e0",
  };

  let initialized = false;
  let sessions = [];
  let busy = false;
  let ui = null;

  /* ---------- helpers locaux (aucune dépendance à app.js) ---------- */

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function newId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function domId(id) {
    return "sess-preview-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), 3000);
  }

  function groupColor(c) { return GROUP_COLORS[c] || "var(--muted, #71717a)"; }

  function countTabs(s) { return (s.windows || []).reduce((n, w) => n + (w.tabs || []).length, 0); }

  function groupNames(s) {
    const found = [];
    for (const w of s.windows || []) {
      for (const t of w.tabs || []) {
        if (t.groupName && !found.some(([n]) => n === t.groupName)) found.push([t.groupName, t.groupColor]);
      }
    }
    return found;
  }

  const restorable = (url) => typeof url === "string" && /\S/.test(url) && !BLOCKED_SCHEME.test(url);

  /* ---------- stockage ---------- */

  async function loadSessions() {
    const data = await store.get(KEY);
    if (!data || !Array.isArray(data.sessions)) return [];
    return data.sessions.filter((s) => s && s.id && Array.isArray(s.windows));
  }

  async function saveSessions(next) {
    // Plus récentes en tête, plafonnées aux MAX_SESSIONS dernières (FIFO).
    const capped = next.slice(0, MAX_SESSIONS);
    await store.set({ [KEY]: { version: 1, sessions: capped } });
    return capped;
  }

  /* ---------- capture ---------- */

  async function captureSession() {
    if (busy) return;
    busy = true;
    setBusy(true);
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      const groups = typeof chrome.tabGroups?.query === "function"
        ? await chrome.tabGroups.query({}).catch(() => [])
        : [];
      const groupById = new Map(groups.map((g) => [g.id, g]));
      const captured = [];
      for (const w of windows) {
        if (w.type && w.type !== "normal") continue; // ignore popups, devtools…
        const tabs = [];
        for (const t of w.tabs || []) {
          if (!t.url || t.url.startsWith("chrome-extension://")) continue; // pages de l'extension
          const g = t.groupId && t.groupId !== -1 ? groupById.get(t.groupId) : null;
          tabs.push({
            url: t.url,
            title: t.title || t.url,
            pinned: !!t.pinned,
            active: !!t.active,
            ...(g && g.title ? { groupName: g.title, groupColor: g.color } : {}),
          });
        }
        if (tabs.length) captured.push({ tabs });
      }
      if (!captured.length) { toast("Aucun onglet enregistrable trouvé."); return; }
      const session = {
        id: newId(),
        name: "Session du " + new Date().toLocaleString("fr-FR"),
        capturedAt: Date.now(),
        windows: captured,
      };
      sessions = await saveSessions([session, ...sessions]);
      toast(`Session enregistrée : ${countTabs(session)} onglet(s) dans ${captured.length} fenêtre(s).`);
      render();
    } catch (e) {
      toast("Échec de la capture : " + (e?.message || e));
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  /* ---------- restauration ---------- */

  async function restoreSession(id) {
    const session = sessions.find((s) => s.id === id);
    if (!session || busy) return;
    busy = true;
    setBusy(true);
    let opened = 0;
    let ignored = 0;
    try {
      for (const w of session.windows || []) {
        let windowId = null;
        const byGroup = new Map();
        for (const meta of w.tabs || []) {
          if (!restorable(meta.url)) { ignored++; continue; }
          let tabId = null;
          try {
            if (windowId === null) {
              try {
                const win = await chrome.windows.create({ url: meta.url });
                windowId = win.id;
                tabId = win.tabs?.[0]?.id ?? null;
              } catch {
                const win = await chrome.windows.create({}); // fenêtre vide, onglets un à un
                windowId = win.id;
              }
            }
            if (tabId === null) tabId = (await chrome.tabs.create({ windowId, url: meta.url })).id;
            opened++;
            if (meta.pinned) chrome.tabs.update(tabId, { pinned: true }).catch(() => {});
            if (meta.groupName) {
              if (!byGroup.has(meta.groupName)) byGroup.set(meta.groupName, { color: meta.groupColor, ids: [] });
              byGroup.get(meta.groupName).ids.push(tabId);
            }
          } catch { ignored++; }
        }
        if (windowId !== null && byGroup.size && typeof chrome.tabs?.group === "function") {
          for (const [title, { color, ids }] of byGroup) {
            try {
              const gid = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId } });
              await chrome.tabGroups.update(gid, { title, ...(color ? { color } : {}) });
            } catch { /* regroupement indisponible ou couleur invalide */ }
          }
        }
      }
      toast(`Session « ${session.name} » restaurée : ${opened} onglet(s) ouvert(s)` + (ignored ? `, ${ignored} ignoré(s) (schéma interdit)` : "") + ".");
    } catch (e) {
      toast("Échec de la restauration : " + (e?.message || e));
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  /* ---------- renommer / supprimer ---------- */

  async function renameSession(id) {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    const name = window.prompt("Nouveau nom de la session :", session.name);
    if (name === null || name.trim() === "") return;
    session.name = name.trim();
    sessions = await saveSessions(sessions);
    toast("Session renommée.");
    render();
  }

  async function deleteSession(id) {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    if (!window.confirm(`Supprimer la session « ${session.name} » ?`)) return;
    sessions = await saveSessions(sessions.filter((s) => s.id !== id));
    toast("Session supprimée.");
    render();
  }

  /* ---------- création depuis un groupe sauvegardé (lecture seule de bs.tabgroups) ---------- */

  async function loadSavedGroups() {
    const data = await store.get(GROUPS_KEY);
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    return groups.filter((g) => g && Array.isArray(g.tabs) && g.tabs.length);
  }

  async function togglePicker(force) {
    if (!ui) return;
    const show = force ?? ui.picker.classList.contains("hidden");
    if (show) {
      ui.savedGroups = await loadSavedGroups().catch(() => []);
      renderPicker();
    }
    ui.picker.classList.toggle("hidden", !show);
    ui.fromGroup.setAttribute("aria-expanded", String(show));
  }

  function renderPicker() {
    ui.picker.replaceChildren();
    if (!ui.savedGroups.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Aucun groupe sauvegardé pour l'instant.";
      ui.picker.append(p);
      return;
    }
    for (const g of ui.savedGroups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm sess-picker-btn";
      btn.setAttribute("aria-label", `Créer une session depuis le groupe « ${g.name} » (${g.tabs.length} onglets)`);
      btn.innerHTML = `<span class="sess-dot" aria-hidden="true" style="background:${groupColor(g.color)}"></span>`
        + `<span>« ${esc(g.name)} »</span>`
        + `<span class="muted">${g.tabs.length} onglet(s) · ${esc(fmtDate(g.capturedAt))}</span>`;
      btn.addEventListener("click", () => createFromGroup(g));
      ui.picker.append(btn);
    }
  }

  async function createFromGroup(g) {
    if (busy) return;
    busy = true;
    setBusy(true);
    try {
      const all = (g.tabs || []).filter((t) => t && typeof t.url === "string");
      const tabs = all.filter((t) => restorable(t.url)).map((t) => ({
        url: t.url,
        title: t.title || t.url,
        pinned: !!t.pinned,
        active: false,
        groupName: g.name || "Groupe",
        ...(g.color ? { groupColor: g.color } : {}),
      }));
      const dropped = all.length - tabs.length;
      if (!tabs.length) { toast("Ce groupe ne contient aucun onglet ouvrable."); return; }
      const session = {
        id: newId(),
        name: `Groupe « ${g.name || "sans nom"} » — ${new Date().toLocaleString("fr-FR")}`,
        capturedAt: Date.now(),
        windows: [{ tabs }],
      };
      sessions = await saveSessions([session, ...sessions]);
      await togglePicker(false);
      toast(`Session créée depuis le groupe « ${g.name || "sans nom"} » : ${tabs.length} onglet(s)` + (dropped ? `, ${dropped} ignoré(s)` : "") + ".");
      render();
    } catch (e) {
      toast("Échec de la création : " + (e?.message || e));
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  async function refreshFromGroupButton() {
    if (!ui) return;
    try {
      const groups = await loadSavedGroups();
      ui.savedGroups = groups;
      ui.fromGroup.classList.toggle("hidden", !groups.length);
      ui.groupsNote.classList.toggle("hidden", !!groups.length);
    } catch {
      ui.fromGroup.classList.add("hidden");
      ui.groupsNote.classList.remove("hidden");
    }
  }

  /* ---------- rendu ---------- */

  function sessionCard(s) {
    const el = document.createElement("article");
    el.className = "card sess-card";
    const pid = domId(s.id);
    const groups = groupNames(s);
    el.innerHTML = `
      <div class="sess-card-head">
        <div class="sess-card-info">
          <h3 class="sess-name">${esc(s.name)}</h3>
          <p class="muted sess-date">${esc(fmtDate(s.capturedAt))} · ${(s.windows || []).length} fenêtre(s) · ${countTabs(s)} onglet(s)</p>
          ${groups.length ? `<p class="sess-groups">${groups.map(([n, c]) =>
            `<span class="sess-group-badge"><span class="sess-dot" aria-hidden="true" style="background:${groupColor(c)}"></span>${esc(n)}</span>`).join("")}</p>` : ""}
        </div>
        <div class="sess-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="restore" data-id="${esc(s.id)}" aria-label="Restaurer la session ${esc(s.name)}">Restaurer</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="rename" data-id="${esc(s.id)}" aria-label="Renommer la session ${esc(s.name)}">Renommer</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(s.id)}" aria-label="Supprimer la session ${esc(s.name)}">Supprimer</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="toggle" data-id="${esc(s.id)}" aria-expanded="false" aria-controls="${pid}" aria-label="Afficher ou masquer l'aperçu de la session ${esc(s.name)}">Aperçu</button>
        </div>
      </div>
      <div id="${pid}" class="sess-preview hidden">
        ${(s.windows || []).map((w, i) => `
          <div class="sess-window">
            <p class="sess-window-title">Fenêtre ${i + 1} · ${(w.tabs || []).length} onglet(s)</p>
            <ul class="sess-tabs">
              ${(w.tabs || []).map((t) => `
                <li class="sess-tab">
                  <span class="sess-tab-title">${esc(t.title || t.url)}</span>
                  <span class="muted sess-tab-url" title="${esc(t.url)}">${esc(t.url)}</span>
                  ${t.pinned ? '<span class="sess-tab-flag" title="Onglet épinglé">épinglé</span>' : ""}
                  ${t.groupName ? `<span class="sess-group-badge"><span class="sess-dot" aria-hidden="true" style="background:${groupColor(t.groupColor)}"></span>${esc(t.groupName)}</span>` : ""}
                </li>`).join("")}
            </ul>
          </div>`).join("") || '<p class="muted">Aucun détail disponible pour cette session.</p>'}
      </div>`;
    return el;
  }

  function render() {
    if (!ui) return;
    ui.status.textContent = sessions.length ? `${sessions.length} session(s) enregistrée(s)` : "";
    ui.list.replaceChildren();
    if (!sessions.length) {
      const p = document.createElement("p");
      p.className = "muted sess-state";
      p.textContent = "Aucune session enregistrée. Cliquez sur « Enregistrer la session actuelle » pour capturer vos fenêtres et onglets.";
      ui.list.append(p);
      return;
    }
    for (const s of sessions) ui.list.append(sessionCard(s));
  }

  function renderLoading() {
    ui.status.textContent = "";
    ui.list.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted sess-state";
    p.textContent = "Chargement des sessions…";
    ui.list.append(p);
  }

  function renderError(err) {
    ui.status.textContent = "";
    ui.list.replaceChildren();
    const div = document.createElement("div");
    div.className = "sess-error";
    const msg = document.createElement("p");
    msg.className = "muted";
    msg.textContent = "Impossible de lire les sessions : " + (err?.message || err) + ".";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-ghost btn-sm";
    retry.textContent = "Réessayer";
    retry.setAttribute("aria-label", "Recharger les sessions");
    retry.addEventListener("click", load);
    div.append(msg, retry);
    ui.list.append(div);
  }

  async function load() {
    if (!ui) return;
    renderLoading();
    try {
      sessions = await loadSessions();
      render();
    } catch (e) {
      renderError(e);
    }
  }

  function setBusy(on) {
    if (!ui) return;
    ui.capture.disabled = on;
    ui.fromGroup.disabled = on;
    ui.capture.setAttribute("aria-busy", String(on));
    ui.status.textContent = on ? "Opération en cours…" : (sessions.length ? `${sessions.length} session(s) enregistrée(s)` : "");
  }

  /* ---------- styles (classes préfixées sess-) ---------- */

  const STYLES = `
#sessions-root .sess-list { display: flex; flex-direction: column; gap: 12px; }
#sessions-root .sess-card { padding: 14px 16px; }
#sessions-root .sess-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
#sessions-root .sess-name { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
#sessions-root .sess-date { margin: 0; }
#sessions-root .sess-groups { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
#sessions-root .sess-group-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted, #71717a); border: 1px solid var(--border, #e4e4e7); border-radius: 999px; padding: 2px 8px; flex: none; }
#sessions-root .sess-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
#sessions-root .sess-actions { display: flex; gap: 8px; flex-wrap: wrap; }
#sessions-root .sess-preview { margin-top: 12px; border-top: 1px solid var(--border, #e4e4e7); padding-top: 10px; display: flex; flex-direction: column; gap: 12px; }
#sessions-root .sess-window-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted, #71717a); margin: 0 0 6px; }
#sessions-root .sess-tabs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
#sessions-root .sess-tab { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
#sessions-root .sess-tab-title { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
#sessions-root .sess-tab-url { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
#sessions-root .sess-tab-flag { font-size: 11px; color: var(--muted, #71717a); flex: none; }
#sessions-root .sess-state { padding: 8px 0 24px; }
#sessions-root .sess-error { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 0 24px; }
#sessions-root .sess-picker { display: flex; flex-wrap: wrap; gap: 8px; margin: -6px 0 14px; }
#sessions-root .sess-picker-btn { display: inline-flex; align-items: center; gap: 8px; }
#sessions-root .sess-status { margin-left: auto; }
#sessions-root .sess-groups-note { font-size: 12px; }
`;

  function injectStyles() {
    if (document.getElementById("sess-styles")) return;
    const style = document.createElement("style");
    style.id = "sess-styles";
    style.textContent = STYLES;
    (document.head || document.documentElement).append(style);
  }

  /* ---------- construction et init ---------- */

  function buildUI(root) {
    root.innerHTML = `
      <div class="toolbar">
        <button type="button" class="btn btn-primary" data-sess-capture aria-label="Enregistrer toutes les fenêtres et onglets actuels dans une session">
          Enregistrer la session actuelle
        </button>
        <button type="button" class="btn btn-ghost" data-sess-fromgroup aria-expanded="false" aria-label="Créer une session à partir d'un groupe d'onglets sauvegardé">
          Créer depuis un groupe sauvegardé
        </button>
        <span class="muted sess-groups-note hidden">Aucun groupe sauvegardé pour l'instant — créez-en un depuis le module Groupes.</span>
        <span class="muted sess-status" role="status" aria-live="polite"></span>
      </div>
      <p class="section-note">Les sessions capturent les fenêtres et onglets ouverts (groupes d'onglets inclus) et se restaurent ici. Les 40 dernières sont conservées localement.</p>
      <div class="sess-picker hidden" data-sess-picker aria-label="Groupes d'onglets sauvegardés"></div>
      <div class="sess-list" data-sess-list aria-label="Sessions enregistrées"></div>`;
    ui = {
      root,
      capture: root.querySelector("[data-sess-capture]"),
      fromGroup: root.querySelector("[data-sess-fromgroup]"),
      groupsNote: root.querySelector(".sess-groups-note"),
      status: root.querySelector(".sess-status"),
      picker: root.querySelector("[data-sess-picker]"),
      list: root.querySelector("[data-sess-list]"),
      savedGroups: [],
    };
    ui.capture.addEventListener("click", captureSession);
    ui.fromGroup.addEventListener("click", () => togglePicker());
    ui.list.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "restore") restoreSession(id);
      else if (action === "rename") renameSession(id);
      else if (action === "delete") deleteSession(id);
      else if (action === "toggle") {
        const preview = document.getElementById(domId(id));
        if (!preview) return;
        const hidden = preview.classList.toggle("hidden");
        btn.setAttribute("aria-expanded", String(!hidden));
        btn.textContent = hidden ? "Aperçu" : "Masquer";
      }
    });
    document.addEventListener("click", (e) => {
      if (!ui || ui.picker.classList.contains("hidden")) return;
      if (ui.picker.contains(e.target) || ui.fromGroup.contains(e.target)) return;
      togglePicker(false);
    });
  }

  function boot() {
    injectStyles();
    let root = document.getElementById("sessions-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "sessions-root";
      (document.querySelector("main") || document.body).appendChild(root);
    }
    if (root.childElementCount) return; // déjà construit : init idempotent
    buildUI(root);
    refreshFromGroupButton();
    load();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }

  window.BSSessions = { init };
})();
