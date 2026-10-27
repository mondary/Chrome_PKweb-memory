"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const labels = { open: "Ouverts", pending: "À revenir", done: "Fermés par vous", outside: "Déplacés ailleurs" };
  let queue = null, live = [], busy = false, timer, refreshId = 0, resourcesMounted = false, currentView = "respiration", thumbsMode = "mshots", panelView = "list", railOn = false, respirationMode = "close", badgeMode = "tabs", badgeScope = "tour";
  async function request(type, payload = {}) {
    let result;
    try {
      result = await chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      // Extension rechargée (↻) alors que le panneau était ouvert : le
      // contexte est invalide, la page se rafraîchit une fois toute seule.
      let lost = false;
      try { lost = !chrome.runtime?.id; } catch { lost = true; }
      if ((lost || /context invalidated/i.test(error.message)) && !sessionStorage.getItem("bsp-reloaded")) {
        try { sessionStorage.setItem("bsp-reloaded", "1"); } catch { /* indisponible */ }
        location.reload();
        throw new Error("L’extension a été rechargée : le panneau se rafraîchit…");
      }
      throw error;
    }
    if (!result?.ok) throw new Error(result?.error || "Rechargez l’extension pour utiliser le panneau latéral.");
    return result.data;
  }
  function render() {
    const active = queue && !queue.stopped;
    const pause = $("panel-pause");
    pause.hidden = !active;
    pause.dataset.paused = String(!!queue?.paused);
    const pauseLabel = queue?.paused ? "Reprendre la tournée" : "Mettre la tournée en pause";
    pause.setAttribute("aria-label", pauseLabel);
    pause.title = pauseLabel;
    pause.disabled = busy;
    const suspend = queue?.mode === "suspend";
    const webTabs = live.filter((t) => /^https?:/i.test(t.pendingUrl || t.url || ""));
    const loaded = webTabs.filter((t) => !t.discarded).length;
    const suspended = webTabs.filter((t) => t.discarded).length;
    const playing = active ? queue.entries.filter((e) => e.state === "open" && e.keepReason === "media").length : 0;
    const modes = $("panel-modes");
    if (modes) {
      modes.hidden = !active;
      $("panel-mode-close").setAttribute("aria-pressed", String(active && !suspend));
      $("panel-mode-suspend").setAttribute("aria-pressed", String(!!active && suspend));
      const target = queue?.target ?? 10;
      $("panel-mode-close-hint").textContent = `${target} onglets, le reste en réserve`;
      $("panel-mode-suspend-hint").textContent = `${target} chargés, le reste visible`;
      for (const button of modes.querySelectorAll("[data-panel-mode]")) button.disabled = busy;
    }
    const apply = $("panel-apply");
    if (apply) {
      const extra = active ? Math.max(0, (suspend ? loaded : webTabs.length) - queue.target - playing) : 0;
      apply.hidden = !extra;
      apply.disabled = busy;
      apply.textContent = suspend
        ? `Suspendre ${extra} onglet${extra > 1 ? "s" : ""} en trop`
        : `Fermer ${extra} onglet${extra > 1 ? "s" : ""} en trop`;
    }
    $("panel-count").textContent = active
      ? suspend
        ? `${loaded} chargés · ${suspended} suspendus · cible ${queue.target}${playing ? ` + ${playing} lecture(s)` : ""}${queue.paused ? " · en pause" : ""}`
        : `${webTabs.length} ouverts · cible ${queue.target}${playing ? ` + ${playing} lecture(s)` : ""}${queue.paused ? " · en pause" : ""}`
      : "Activez Respiration depuis Sessions";
    const next = active && !suspend && PKRespiration.nextEntry(queue);
    $("panel-state").textContent = active ? (queue.reason || (suspend
      ? suspended ? "Le reste est suspendu dans Chrome ; cliquez un onglet pour le recharger." : "Tous les onglets sont chargés."
      : next ? `Au prochain ⌘W : ${next.title}` : "Toutes les pages de la réserve ont été ouvertes.")) : "";
    const pendingTotal = active ? queue.entries.filter((e) => e.state === "pending").length : 0;
    const brokenTotal = active ? queue.entries.filter((e) => {
      if (e.state !== "open" || e.tabId == null || !/^https?:/i.test(e.url)) return false;
      const tab = live.find((t) => t.id === e.tabId);
      const url = tab?.pendingUrl || tab?.url || "";
      return !!tab && (!url || url === "about:blank" || !/^https?:\/\//i.test(url));
    }).length : 0;
    const repair = $("panel-repair-suspend");
    repair.hidden = !brokenTotal;
    repair.disabled = busy;
    repair.textContent = `Réparer ${brokenTotal} onglet${brokenTotal > 1 ? "s" : ""} suspendu${brokenTotal > 1 ? "s" : ""} vide${brokenTotal > 1 ? "s" : ""}`;
    // Le segmented est le mode d'affichage DU PANNEAU : liste détaillée ou
    // mosaïque de favicons. Le rail de page (rail.js) est indépendant et
    // s'active dans les Réglages.
    $("panel-mode-list").setAttribute("aria-pressed", String(panelView === "list"));
    $("panel-mode-fav").setAttribute("aria-pressed", String(panelView === "fav"));
    const host = $("panel-pages");
    const focused = host.contains(document.activeElement) ? document.activeElement.dataset.entry : null;
    const expanded = [...host.querySelectorAll("details[open]")].map((el) => el.dataset.state);
    if (!active) { host.innerHTML = '<p class="panel-empty">Vos pages en attente apparaîtront ici.</p>'; return; }
    const query = $("panel-search").value.trim().toLocaleLowerCase();
    const entries = queue.entries.filter((e) => `${e.title} ${e.url}`.toLocaleLowerCase().includes(query));
    host.innerHTML = Object.entries(labels).map(([state, label]) => {
      const items = entries.filter((e) => e.state === state);
      if (!items.length) return "";
      const groupLabel = state === "open" && suspend ? "Chargés / suspendus" : label;
      const title = `${groupLabel} · ${items.length}`;
      const pendingAction = state === "pending"
        ? `<button type="button" class="panel-action" data-reopen-suspend${busy ? " disabled" : ""}>Rouvrir ${pendingTotal} page${pendingTotal > 1 ? "s" : ""} à revenir en suspendu</button>`
        : "";
      // En mode suspendu, les onglets chargés restent en tête, les suspendus
      // en dessous : même lecture que la barre Chrome.
      const orderedItems = state === "open" && suspend
        ? [...items.filter((e) => !e.discarded).reverse(), ...items.filter((e) => e.discarded).reverse()]
        : items.slice().reverse();
      const content = panelView === "fav"
        ? `<div class="panel-grid">${orderedItems.map((e) => {
            const current = live.some((t) => t.id === e.tabId && t.active);
            const favicon = `${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(e.url)}&size=32`;
            const hint = `${e.title || e.url} — ${label}${e.keepReason === "media" ? " — Lecture en cours" : ""}${e.discarded && e.state === "open" ? " — Suspendu" : ""}`;
            return `<button type="button" class="panel-fav" data-state="${state}"${e.discarded && e.state === "open" ? " data-discarded" : ""} data-page-trigger data-entry="${esc(e.id)}"${busy ? " disabled" : ""}${current ? ' aria-current="page"' : ""} aria-label="${esc(hint)}" title="${esc(hint)}"><img class="tl-fav" src="${esc(favicon)}" data-page-url="${esc(e.url)}" data-page-title="${esc(e.title || e.url)}" alt="" loading="lazy"></button>`;
          }).join("")}</div>`
        : `<ul>${orderedItems.map((e) => {
            const current = live.some((t) => t.id === e.tabId && t.active);
            const favicon = `${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(e.url)}&size=32`;
            let domain; try { domain = new URL(e.url).hostname; } catch { domain = e.url; }
            return `<li><button type="button" class="panel-page" data-page-trigger data-entry="${esc(e.id)}"${busy ? " disabled" : ""}${current ? ' aria-current="page"' : ""} aria-label="${esc(`${e.title} — ${label}${e.keepReason === "media" ? " — Lecture en cours" : ""}${e.discarded && e.state === "open" ? " — Suspendu" : ""}`)}"><img class="tl-fav" src="${esc(favicon)}" data-page-url="${esc(e.url)}" data-page-title="${esc(e.title || e.url)}" alt="" loading="lazy"><span class="panel-page-text"><strong>${esc(e.title || e.url)}</strong><small>${e.keepReason === "media" ? "▶ Lecture en cours · " : ""}${e.discarded && e.state === "open" ? "Suspendu · " : ""}${esc(domain)}</small></span></button></li>`;
          }).join("")}</ul>`;
      return ["done", "outside"].includes(state)
        ? `<details class="panel-group" data-state="${state}"${expanded.includes(state) || query ? " open" : ""}><summary>${title}</summary>${content}</details>`
        : `<section class="panel-group" data-state="${state}"><h2>${title}</h2>${content}${pendingAction}</section>`;
    }).join("") || '<p class="panel-empty">Aucune page ne correspond.</p>';
    if (focused) [...host.querySelectorAll("[data-entry]")].find((el) => el.dataset.entry === focused)?.focus({preventScroll:true});
  }
  async function refresh() {
    const id = ++refreshId;
    try {
      const stored = await chrome.storage.local.get(["bs.respiration", "settings", "bs.sessions.library"]);
      const q = stored["bs.respiration"];
      const tabs = q?.windowId != null ? await chrome.tabs.query({windowId:q.windowId}).catch(() => []) : [];
      if (id !== refreshId) return;
      queue = q; live = tabs; thumbsMode = stored.settings?.thumbsMode || "mshots";
      panelView = stored.settings?.panelView === "fav" ? "fav" : "list";
      railOn = stored.settings?.railOn === true;
      respirationMode = stored.settings?.respirationMode === "suspend" ? "suspend" : "close";
      const libSettings = stored["bs.sessions.library"]?.settings || {};
      badgeMode = ["tabs", "dupes", "respiration", "none"].includes(libSettings.badge) ? libSettings.badge : "tabs";
      badgeScope = libSettings.badgeScope === "all" ? "all" : "tour";
      render();
      syncSettingsView();
    } catch (error) { $("panel-message").textContent = error.message; }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
  async function act(type, payload = {}) {
    if (busy) return;
    busy = true; render(); $("panel-message").textContent = "Mise à jour…";
    try { $("panel-message").textContent = (await request(type, payload)).message; }
    catch (error) { $("panel-message").textContent = error.message; }
    finally { busy = false; await refresh(); }
  }
  async function setView(view) {
    currentView = view;
    document.querySelectorAll("[data-view]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.view === view)));
    $("panel-respiration").hidden = view !== "respiration";
    $("panel-resources").hidden = view !== "resources";
    $("panel-settings").hidden = view !== "settings";
    if (view === "resources") {
      if (!resourcesMounted) { resourcesMounted = true; await BSMemoryMonitor.mount($("resources-root")); }
      BSMemoryMonitor.start();
    } else BSMemoryMonitor.stop();
    if (view === "settings") syncSettingsView();
  }
  function syncSettingsView() {
    const rail = $("panel-rail-toggle");
    if (rail) rail.checked = railOn;
    const mode = $("panel-mode-select");
    if (mode) mode.value = respirationMode;
    const hint = $("panel-mode-hint");
    if (hint) hint.textContent = queue && !queue.stopped
      ? `La tournée en cours est en mode ${queue.mode === "suspend" ? "Suspendre" : "Fermer"} ; ce choix s’applique immédiatement à elle.`
      : "Le mode s’applique à la prochaine tournée.";
    const badge = $("panel-badge-select");
    if (badge) badge.value = badgeMode;
    const scope = $("panel-badge-scope");
    if (scope) scope.value = badgeScope;
    if (currentView === "settings") void updateBadgeState();
  }
  async function updateBadgeState() {
    const el = $("panel-badge-state");
    if (!el) return;
    try {
      const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
      const web = (tabs) => tabs.filter((tab) => /^https?:/i.test(tab.pendingUrl || tab.url || ""));
      const allTabs = wins.filter((win) => !win.incognito).flatMap((win) => win.tabs || []);
      const tourTabs = queue?.windowId != null
        ? (wins.find((win) => win.id === queue.windowId)?.tabs || live)
        : live;
      const useTour = badgeScope === "tour" && queue && !queue.stopped && queue.windowId != null;
      const scoped = useTour ? tourTabs : allTabs;
      const duplicates = (tabs) => {
        const seen = new Map(); let count = 0;
        for (const tab of web(tabs)) {
          const url = tab.pendingUrl || tab.url;
          if (seen.has(url)) count++; else seen.set(url, true);
        }
        return count;
      };
      const shown = badgeMode === "none" ? "aucune"
        : badgeMode === "dupes" ? `${duplicates(scoped)} doublon(s)`
        : badgeMode === "respiration"
          ? (queue && !queue.stopped && !queue.paused ? "▶ tournée active"
            : queue && !queue.stopped ? "⏸ en pause" : "vide (aucune tournée)")
          : `${web(scoped).length} onglet(s) web`;
      el.textContent = `Pastille : ${shown} · ${web(tourTabs).length} onglet(s) web dans la fenêtre de la tournée · ${web(allTabs).length} dans toutes les fenêtres normales.`;
    } catch (error) { el.textContent = error.message; }
  }
  async function saveBadgeSettings() {
    try {
      const data = await request("get", {});
      const settings = { ...(data.library?.settings || {}), badge: badgeMode, badgeScope };
      await request("settings", { settings });
    } catch (error) { $("panel-badge-state").textContent = error.message; }
    void updateBadgeState();
  }
  async function setPanelView(value) {
    if (panelView === value) return;
    panelView = value;
    render();
    try {
      const stored = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...(stored.settings || {}), panelView } });
    } catch { /* choix valable pour cette session */ }
  }
  $("panel-search").addEventListener("input", () => {
    if (currentView !== "respiration") setView("respiration"); // la recherche porte sur la réserve
    render();
  });
  $("panel-repair-suspend").addEventListener("click", () => act("respiration-repair-suspend"));
  $("panel-pages").addEventListener("click", (event) => {
    if (event.target.closest("[data-reopen-suspend]")) { act("respiration-reopen-suspend"); return; }
    const button = event.target.closest("[data-entry]");
    if (button) act("respiration-select", {id:button.dataset.entry});
  });

  $("panel-pause").addEventListener("click", async () => {
    const win = await chrome.windows.getCurrent();
    act(queue?.paused ? "respiration-resume" : "respiration-pause", {windowId:win.id});
  });
  $("panel-modes").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-panel-mode]");
    if (!button || busy) return;
    const mode = button.dataset.panelMode === "suspend" ? "suspend" : "close";
    busy = true; render();
    try {
      const result = await request("respiration-set-mode", { mode, resume: true });
      const stored = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...(stored.settings || {}), respirationMode: mode } });
      respirationMode = mode;
      $("panel-message").textContent = result.message;
    } catch (error) { $("panel-message").textContent = error.message; }
    finally { busy = false; await refresh(); }
  });
  $("panel-apply").addEventListener("click", () => act("respiration-compact"));
  $("panel-mode-list").addEventListener("click", () => setPanelView("list"));
  $("panel-mode-fav").addEventListener("click", () => setPanelView("fav"));
  $("panel-rail-toggle").addEventListener("change", async (event) => {
    railOn = event.target.checked;
    const stored = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...(stored.settings || {}), railOn } });
  });
  $("panel-mode-select").addEventListener("change", async (event) => {
    respirationMode = event.target.value === "suspend" ? "suspend" : "close";
    const stored = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...(stored.settings || {}), respirationMode } });
    syncSettingsView();
  });
  $("panel-badge-select").addEventListener("change", async (event) => {
    badgeMode = event.target.value;
    await saveBadgeSettings();
  });
  $("panel-badge-scope").addEventListener("change", async (event) => {
    badgeScope = event.target.value === "all" ? "all" : "tour";
    await saveBadgeSettings();
  });
  $("panel-close").addEventListener("click", async () => {
    try { const win = await chrome.windows.getCurrent(); await chrome.sidePanel.close({ windowId: win.id }); } catch { /* déjà fermé */ }
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  PKPagePreview.bind({
    previewSource: async (url) => (await request("preview", {url})).src,
    fallbackThumb: (url) => thumbsMode === "mshots" ? `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=400&h=300` : null,
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes["bs.respiration"] || changes.settings)) schedule();
  });
  for (const name of ["onActivated", "onCreated", "onRemoved", "onUpdated", "onAttached", "onDetached"])
    chrome.tabs[name].addListener(schedule);
  request("respiration-status").then(refresh).catch((error) => { $("panel-message").textContent = error.message; });
})();
