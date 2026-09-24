/* Gestionnaire de sessions : capture TOUS les onglets ouverts (chrome.tabs.query({}),
   toutes fenêtres) regroupés par windowId, les stocke datés dans chrome.storage.local
   (« bs.sessions », 40 max, FIFO), les restaure et pilote l'enregistrement
   automatique (chrome.alarms « bs-sessions-autosave », réglages intégrés en tête de
   liste). Script classique chargé avant app.js — n'expose que window.BSSessions = { init }. */
"use strict";

(() => {
  const KEY = "bs.sessions";
  const AUTO_KEY = "bs.sessions.auto";
  const ALARM_NAME = "bs-sessions-autosave";
  const MAX_SESSIONS = 40;
  const FAVICON_MAX = 12;
  // Schémas exclus de la capture (comptés comme ignorés).
  const IGNORED_SCHEME = /^(chrome|chrome-extension|edge|about):/i;
  // Schémas que chrome.tabs.create refuse ou ne doit pas rouvrir depuis une session.
  const BLOCKED_SCHEME = /^(chrome|chrome-untrusted|chrome-extension|edge|about|devtools|view-source|javascript|data|file):/i;

  const INTERVAL_LABELS = { 15: "15 min", 60: "1 h", 360: "6 h", 720: "12 h", 1440: "quotidien" };

  const store = {
    get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
    set: (obj) => chrome.storage.local.set(obj),
  };

  const GROUP_COLORS = {
    grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00",
    green: "#188038", pink: "#d01884", orange: "#fa7b17", purple: "#a142f4", cyan: "#24c1e0",
  };

  let initialized = false;
  let headerBound = false;
  let storageBound = false;
  let sessions = [];
  let autoConfig = { enabled: false, intervalMinutes: 15 };
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

  function hostnameOf(url) {
    try { return new URL(url).hostname || url; } catch { return url || ""; }
  }

  function faviconUrl(tab) {
    return tab.favIconUrl || "https://www.google.com/s2/favicons?sz=16&domain_url=" + encodeURIComponent(tab.url || "");
  }

  // Rangée de favicônes dédupliquées par hostname (classes globales stylées dans style.css).
  function faviconStrip(tabs, max) {
    const seen = new Set();
    const items = [];
    for (const t of tabs || []) {
      if (!t || !t.url) continue;
      const h = hostnameOf(t.url);
      if (!h || seen.has(h)) continue;
      seen.add(h);
      items.push(t);
    }
    if (!items.length) return "";
    const shown = items.slice(0, max);
    const more = items.length - shown.length;
    return '<div class="favicon-strip" aria-hidden="true">'
      + shown.map((t) => `<img class="fav-ico" src="${esc(faviconUrl(t))}" alt="" loading="lazy">`).join("")
      + (more > 0 ? `<span class="fav-more">+${more}</span>` : "")
      + "</div>";
  }

  const restorable = (url) => typeof url === "string" && /\S/.test(url) && !BLOCKED_SCHEME.test(url);

  function alarmsApi() {
    return chrome.alarms && typeof chrome.alarms.get === "function" ? chrome.alarms : null;
  }

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
      const [allTabs, wins, groups] = await Promise.all([
        chrome.tabs.query({}),
        chrome.windows.getAll().catch(() => []), // types de fenêtres, sans populate
        typeof chrome.tabGroups?.query === "function"
          ? chrome.tabGroups.query({}).catch(() => [])
          : Promise.resolve([]),
      ]);
      const winType = new Map(wins.map((w) => [w.id, w.type || "normal"]));
      const groupById = new Map(groups.map((g) => [g.id, g]));
      const byWindow = new Map();
      let ignored = 0;
      for (const t of allTabs) {
        if (!t.url || IGNORED_SCHEME.test(t.url)) { ignored++; continue; }
        if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
        const g = t.groupId && t.groupId !== -1 ? groupById.get(t.groupId) : null;
        byWindow.get(t.windowId).push({
          url: t.url,
          title: t.title || t.url,
          pinned: !!t.pinned,
          active: !!t.active,
          ...(t.favIconUrl ? { favIconUrl: t.favIconUrl } : {}),
          ...(g && g.title ? { groupName: g.title, groupColor: g.color } : {}),
        });
      }
      const captured = [...byWindow.entries()]
        .filter(([id]) => {
          const type = winType.get(id) || "normal";
          return type !== "devtools" && type !== "popup"; // exclues uniquement du comptage affiché
        })
        .map(([, tabs]) => ({ tabs }));
      const tabCount = captured.reduce((n, w) => n + w.tabs.length, 0);
      if (!captured.length || !tabCount) { toast("Aucun onglet enregistrable trouvé."); return; }
      const session = {
        id: newId(),
        name: "Session du " + new Date().toLocaleString("fr-FR"),
        capturedAt: Date.now(),
        windows: captured,
      };
      sessions = await saveSessions([session, ...sessions]);
      toast(`Session : ${captured.length} fenêtre(s) · ${tabCount} onglet(s)` + (ignored ? ` · ${ignored} ignoré(s)` : "") + ".");
      render(); // re-render immédiat : nouvelle carte en tête + compteur à jour
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

  /* ---------- enregistrement automatique ---------- */

  function renderNextRun(alarm) {
    if (!ui?.autoNext) return;
    ui.autoNext.textContent = alarm
      ? "Prochain déclenchement : " + fmtDate(alarm.scheduledTime)
      : "désactivé";
  }

  // Lit l'état réel : config persistée + alarme existante (qui fait foi en son absence).
  async function refreshAutoPanel() {
    if (!ui?.autoToggle) return;
    const raw = await store.get(AUTO_KEY).catch(() => null);
    const cfg = raw && typeof raw === "object" ? raw : {};
    const alarm = await (alarmsApi()?.get(ALARM_NAME).catch(() => null) ?? null);
    autoConfig = {
      enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : !!alarm,
      intervalMinutes: Number(cfg.intervalMinutes) || alarm?.periodInMinutes || 15,
    };
    if (autoConfig.enabled && !alarm && alarmsApi()) {
      // alarme perdue (mise à jour de l'extension…) : on la recrée
      await alarmsApi().create(ALARM_NAME, { periodInMinutes: Math.max(1, autoConfig.intervalMinutes) });
    }
    ui.autoToggle.checked = autoConfig.enabled;
    ui.autoInterval.value = String(autoConfig.intervalMinutes);
    renderNextRun(await alarmsApi()?.get(ALARM_NAME).catch(() => null) ?? null);
  }

  async function persistAuto() {
    await store.set({ [AUTO_KEY]: { enabled: autoConfig.enabled, intervalMinutes: autoConfig.intervalMinutes } });
  }

  async function setAutoEnabled(on) {
    autoConfig.enabled = on;
    await persistAuto();
    const alarms = alarmsApi();
    if (on && alarms) {
      await alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, autoConfig.intervalMinutes) });
    } else if (alarms) {
      await alarms.clear(ALARM_NAME).catch(() => {});
    }
    await refreshAutoPanel();
    toast(on ? "Enregistrement automatique activé." : "Enregistrement automatique désactivé.");
  }

  async function setAutoInterval(minutes) {
    autoConfig.intervalMinutes = minutes;
    await persistAuto();
    const alarms = alarmsApi();
    if (autoConfig.enabled && alarms) {
      await alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, minutes) });
    }
    await refreshAutoPanel();
    toast(`Intervalle automatique : ${INTERVAL_LABELS[minutes] || minutes + " min"}` + (autoConfig.enabled ? "." : " (enregistrement automatique désactivé)."));
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
          <h3 class="sess-name">${s.auto ? '<span class="sess-auto-badge">auto</span>' : ""}${esc(s.name)}</h3>
          <p class="muted sess-date">${esc(fmtDate(s.capturedAt))} · ${(s.windows || []).length} fenêtre(s) · ${countTabs(s)} onglet(s)</p>
          ${faviconStrip((s.windows || []).flatMap((w) => w.tabs || []), FAVICON_MAX)}
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

  function renderCount() {
    const el = document.getElementById("sessions-count");
    if (el) el.textContent = sessions.length ? `${sessions.length} session(s)` : "";
  }

  function render() {
    renderCount();
    if (!ui?.list) return;
    ui.status.textContent = "";
    ui.list.replaceChildren();
    if (!sessions.length) {
      const p = document.createElement("p");
      p.className = "muted sess-state";
      p.textContent = "Aucune session enregistrée. Cliquez sur « Enregistrer la session » pour capturer vos fenêtres et onglets.";
      ui.list.append(p);
      return;
    }
    for (const s of sessions) ui.list.append(sessionCard(s));
  }

  function renderLoading() {
    if (!ui?.list) return;
    ui.status.textContent = "";
    ui.list.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted sess-state";
    p.textContent = "Chargement des sessions…";
    ui.list.append(p);
  }

  function renderError(err) {
    if (!ui?.list) return;
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
    if (!ui?.list) return;
    renderLoading();
    try {
      sessions = await loadSessions();
      render();
    } catch (e) {
      renderError(e);
    }
  }

  function setBusy(on) {
    if (ui?.saveBtn) {
      ui.saveBtn.disabled = on;
      ui.saveBtn.setAttribute("aria-busy", String(on));
    }
    if (ui?.status) ui.status.textContent = on ? "Opération en cours…" : "";
  }

  /* ---------- styles (classes préfixées sess-) ---------- */

  const STYLES = `
#sessions-root { display: flex; flex-direction: column; gap: 20px; }
#sessions-root .sess-list { display: flex; flex-direction: column; gap: 12px; }
#sessions-root .sess-card { padding: 14px 16px; }
#sessions-root .sess-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
#sessions-root .sess-card-info { min-width: 0; }
#sessions-root .sess-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin: 0 0 4px; }
#sessions-root .sess-auto-badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted, #71717a); border: 1px solid var(--border, #e4e4e7); border-radius: 999px; padding: 1px 7px; flex: none; }
#sessions-root .sess-date { margin: 0 0 8px; }
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
#sessions-root .sess-status { margin-left: auto; }
#sessions-root .sess-auto-row { flex-wrap: wrap; }
#sessions-root .sess-auto-next { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

  function injectStyles() {
    if (document.getElementById("sess-styles")) return;
    const style = document.createElement("style");
    style.id = "sess-styles";
    style.textContent = STYLES;
    (document.head || document.documentElement).append(style);
  }

  /* ---------- wiring (toujours au boot, avant toute garde de retour) ---------- */

  function bindHeader() {
    if (headerBound) return;
    headerBound = true;
    ui = ui || {};
    ui.saveBtn = document.getElementById("btn-session-save");
    ui.saveBtn?.addEventListener("click", () => captureSession());
  }

  // Réactivité : toute écriture de bs.sessions (bouton, renommage, auto-save du service
  // worker) re-render la liste et le compteur silencieusement.
  function bindStorage() {
    if (storageBound) return;
    storageBound = true;
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== "local" || !changes[KEY]) return;
      loadSessions()
        .then((s) => { sessions = s; render(); })
        .catch(() => {});
    });
  }

  /* ---------- construction ---------- */

  function buildUI(root) {
    ui = ui || {}; // conserve ui.saveBtn déjà câblé par bindHeader()
    root.innerHTML = `
      <div class="panel active" id="sess-panel-list">
        <p class="section-note">Les sessions capturent toutes les fenêtres et onglets ouverts (groupes d'onglets inclus) et se restaurent ici. Les 40 dernières sont conservées localement, les automatiques sont marquées « auto ».</p>
        <div class="field-row sess-auto-row">
          <label for="sess-auto-toggle">Auto :</label>
          <input type="checkbox" id="sess-auto-toggle" aria-label="Activer l'enregistrement automatique des sessions">
          <select id="sess-auto-interval" aria-label="Intervalle d'enregistrement automatique">
            <option value="15">15 min</option>
            <option value="60">1 h</option>
            <option value="360">6 h</option>
            <option value="720">12 h</option>
            <option value="1440">quotidien</option>
          </select>
          <span class="muted sess-auto-next" id="sess-auto-next" role="status" aria-live="polite">désactivé</span>
        </div>
        <div class="toolbar">
          <span class="muted sess-status" role="status" aria-live="polite"></span>
        </div>
        <div class="sess-list" data-sess-list aria-label="Sessions enregistrées"></div>
      </div>`;
    ui.status = root.querySelector(".sess-status");
    ui.list = root.querySelector("[data-sess-list]");
    ui.autoToggle = root.querySelector("#sess-auto-toggle");
    ui.autoInterval = root.querySelector("#sess-auto-interval");
    ui.autoNext = root.querySelector("#sess-auto-next");
    ui.autoToggle?.addEventListener("change", () => setAutoEnabled(ui.autoToggle.checked).catch((e) => toast("Réglage impossible : " + (e?.message || e))));
    ui.autoInterval?.addEventListener("change", () => setAutoInterval(Number(ui.autoInterval.value) || 15).catch((e) => toast("Réglage impossible : " + (e?.message || e))));
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
  }

  function boot() {
    injectStyles();
    // Wiring d'abord : aucune garde de retour ne doit empêcher le câblage des contrôles.
    bindHeader();
    bindStorage();
    let root = document.getElementById("sessions-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "sessions-root";
      (document.querySelector("main") || document.body).appendChild(root);
    }
    if (root.childElementCount) { // déjà construit : simple rafraîchissement
      load().catch(() => {});
      refreshAutoPanel().catch(() => {});
      return;
    }
    buildUI(root);
    load().catch(() => {});
    refreshAutoPanel().catch(() => {});
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }

  window.BSSessions = { init };
})();
