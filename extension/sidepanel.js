"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const labels = { open: "Ouverts", pending: "À revenir", done: "Fermés par vous", outside: "Déplacés ailleurs" };
  let queue = null, live = [], busy = false, timer, refreshId = 0, resourcesMounted = false, resourcesVisible = false, thumbsMode = "mshots", railOn = false;
  async function request(type, payload = {}) {
    const result = await chrome.runtime.sendMessage({ type, payload });
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
    $("panel-count").textContent = active
      ? `${live.filter((t) => /^https?:/i.test(t.pendingUrl || t.url || "")).length} ouverts · cible ${queue.target}${queue.paused ? " · en pause" : ""}`
      : "Activez Respiration depuis Sessions";
    const next = active && PKRespiration.nextEntry(queue);
    $("panel-state").textContent = active ? (queue.reason || (next ? `Au prochain ⌘W : ${next.title}` : "Toutes les pages de la réserve ont été ouvertes.")) : "";
    // Le rail favicon vit en surcouche des pages (rail.js), pas dans le
    // panneau : sa largeur minimale l'interdit. Le segmented reste le
    // commande : liste seule ↔ rail en plus des pages.
    $("panel-mode-list").setAttribute("aria-pressed", String(!railOn));
    $("panel-mode-fav").setAttribute("aria-pressed", String(railOn));
    const host = $("panel-pages");
    const focused = host.contains(document.activeElement) ? document.activeElement.dataset.entry : null;
    const expanded = [...host.querySelectorAll("details[open]")].map((el) => el.dataset.state);
    if (!active) { host.innerHTML = '<p class="panel-empty">Vos pages en attente apparaîtront ici.</p>'; return; }
    const query = $("panel-search").value.trim().toLocaleLowerCase();
    const entries = queue.entries.filter((e) => `${e.title} ${e.url}`.toLocaleLowerCase().includes(query));
    host.innerHTML = Object.entries(labels).map(([state, label]) => {
      const items = entries.filter((e) => e.state === state);
      if (!items.length) return "";
      const rows = items.slice().reverse().map((e) => {
        const current = live.some((t) => t.id === e.tabId && t.active);
        const favicon = `${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(e.url)}&size=32`;
        let domain; try { domain = new URL(e.url).hostname; } catch { domain = e.url; }
        return `<li><button type="button" class="panel-page" data-page-trigger data-entry="${esc(e.id)}"${busy ? " disabled" : ""}${current ? ' aria-current="page"' : ""} aria-label="${esc(`${e.title} — ${label}${e.keepReason === "media" ? " — Lecture en cours" : ""}`)}"><img class="tl-fav" src="${esc(favicon)}" data-page-url="${esc(e.url)}" data-page-title="${esc(e.title || e.url)}" alt="" loading="lazy"><span class="panel-page-text"><strong>${esc(e.title || e.url)}</strong><small>${e.keepReason === "media" ? "▶ Lecture en cours · " : ""}${esc(domain)}</small></span></button></li>`;
      }).join("");
      const title = `${label} · ${items.length}`;
      return ["done", "outside"].includes(state)
        ? `<details class="panel-group" data-state="${state}"${expanded.includes(state) || query ? " open" : ""}><summary>${title}</summary><ul>${rows}</ul></details>`
        : `<section class="panel-group" data-state="${state}"><h2>${title}</h2><ul>${rows}</ul></section>`;
    }).join("") || '<p class="panel-empty">Aucune page ne correspond.</p>';
    if (focused) [...host.querySelectorAll("[data-entry]")].find((el) => el.dataset.entry === focused)?.focus({preventScroll:true});
  }
  async function refresh() {
    const id = ++refreshId;
    try {
      const stored = await chrome.storage.local.get(["bs.respiration", "settings"]);
      const q = stored["bs.respiration"];
      const tabs = q?.windowId != null ? await chrome.tabs.query({windowId:q.windowId}).catch(() => []) : [];
      if (id !== refreshId) return;
      queue = q; live = tabs; thumbsMode = stored.settings?.thumbsMode || "mshots";
      railOn = stored.settings?.railOn === true;
      render();
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
    resourcesVisible = view === "resources";
    document.querySelectorAll("[data-view]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.view === view)));
    $("panel-respiration").hidden = resourcesVisible;
    $("panel-resources").hidden = !resourcesVisible;
    if (resourcesVisible) {
      if (!resourcesMounted) { resourcesMounted = true; await BSMemoryMonitor.mount($("resources-root")); }
      BSMemoryMonitor.start();
    } else BSMemoryMonitor.stop();
  }
  async function setRail(value) {
    if (railOn === value) return;
    railOn = value;
    render();
    try {
      const stored = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...(stored.settings || {}), railOn } }); // propage à tous les rails via storage.onChanged
    } catch { /* choix valable pour cette session */ }
  }
  $("panel-search").addEventListener("input", () => {
    if (resourcesVisible) setView("respiration"); // la recherche porte sur la réserve
    render();
  });
  $("panel-pages").addEventListener("click", (event) => {
    const button = event.target.closest("[data-entry]");
    if (button) act("respiration-select", {id:button.dataset.entry});
  });
  $("panel-pause").addEventListener("click", async () => {
    const win = await chrome.windows.getCurrent();
    act(queue?.paused ? "respiration-resume" : "respiration-pause", {windowId:win.id});
  });
  $("panel-mode-list").addEventListener("click", () => setRail(false));
  $("panel-mode-fav").addEventListener("click", () => setRail(true));
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
