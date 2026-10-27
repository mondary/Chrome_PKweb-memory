/* Section Sessions — timeline fusionnée façon Tablerone : session en cours toujours
   dépliée en tête, croix de fermeture par ligne (onglet courant ou lien
   enregistré, avec annulation), sessions groupées par jour dépliables sur
   place, miniature de capture toujours visible en petit à côté de chaque
   lien (clic = vue élargie, repli sur les miniatures de la galerie sans
   capture locale) et fusion de plusieurs sessions. Panier Tablerone complet :
   export URL/titres/Markdown/HTML/CSV/JSON (copie ou téléchargement),
   enregistrement des seuls onglets cochés d'une fenêtre et carte
   « Reprendre » qui resurge la dernière session d'un jour précédent à
   tab zéro. Toutes les écritures passent par le service worker (écrivain
   unique sérialisé). Script classique chargé avant app.js — n'expose que
   window.BSSessions. */
"use strict";

(() => {
  const C = () => globalThis.PKSessionCore;
  const ICONS = {
    window: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    archive: '<path d="M4 8v12h16V8M9 12h6"/><rect x="3" y="3" width="18" height="5" rx="1"/>',
    open: '<path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
    moon: '<path d="M20 13A8 8 0 0 1 11 4a8.5 8.5 0 1 0 9 9Z"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    pin: '<path d="m9 3 8 0-1 6 3 3v2h-6v7m0-7H6v-2l3-3V3Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    zzz: '<path d="M13 3h6l-6 7h6"/><path d="M6 13h5l-5 6h5"/>',
    save: '<path d="M12 3v10m-4-4 4 4 4-4M4 12v8h16v-8"/>',
  };
  const icon = (name, size = 16) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.layers}</svg>`;

  let initialized = false;
  let library = null;
  let respiration = null;
  let respirationProtocol = 0;
  let windows = [];
  let highlightId = null;
  let busy = false;
  let lastUndo = null;
  let liveTimer = 0;
  const expanded = new Set();
  const previewCache = new Map();
  let thumbsMode = "mshots";
  let respirationMode = "close";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const root = () => document.getElementById("sessions-root");

  /* Squelettes de premier chargement : un écran de structure plutôt qu'une
     page vide pendant que le service worker répond. Remplacés au premier rendu. */
  function showSkeleton() {
    const host = root();
    if (!host || library) return;
    const resp = document.getElementById("respiration-root");
    if (resp && !resp.childElementCount) {
      resp.innerHTML = `<section class="respiration-card tl-skel" aria-hidden="true"><div class="respiration-head"><div class="tl-sk-col"><span class="tl-sk-line" style="width:130px"></span><span class="tl-sk-line" style="width:230px"></span></div></div><div class="respiration-stats"><div><span class="tl-sk-line" style="width:55%"></span></div><div><span class="tl-sk-line" style="width:55%"></span></div><div><span class="tl-sk-line" style="width:55%"></span></div></div></section>`;
    }
    if (host.childElementCount) return;
    host.innerHTML = Array.from({ length: 3 }, () => `<section class="tl-session tl-skel" aria-hidden="true"><div class="tl-head"><span class="tl-sk-line" style="width:34%"></span></div><div class="tl-body"><figure class="tl-preview tl-sk-block"></figure><div class="tl-list">${Array.from({ length: 4 }, () => `<div class="tl-row tl-sk-row"><span class="tl-sk-dot"></span><span class="tl-sk-line" style="width:48%"></span><span class="tl-sk-line" style="width:12%"></span></div>`).join("")}</div></div></section>`).join("");
  }

  // Filet manuel : si le premier chargement échoue (extension rechargée,
  // service worker bloqué…), le squelette ne doit pas rester muet.
  function showBootError(message) {
    const host = root();
    if (!host || library || document.getElementById("bss-boot-error")) return;
    host.insertAdjacentHTML("afterbegin",
      `<p class="tl-empty" id="bss-boot-error" role="alert">Sessions n’a pas pu démarrer : ${esc(message)} <button type="button" id="bss-boot-reload" class="btn btn-ghost btn-sm">Recharger la page</button></p>`);
    document.getElementById("bss-boot-reload")?.addEventListener("click", () => location.reload());
  }

  /* Bandeau d'action longue (restauration, fusion…) : visible au-dessus de la
     timeline sans bloquer l'écran, retiré dès la fin de l'action. */
  let busyLabelActive = "";
  function showBusyLabel(label = "") {
    const host = root();
    if (!host) return;
    busyLabelActive = label;
    let el = document.getElementById("tl-busy");
    if (!label) { el?.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "tl-busy";
      el.setAttribute("role", "status");
      host.prepend(el);
    }
    el.innerHTML = `${icon("clock", 13)} <span>${esc(label)}</span>`;
  }

  // Après un rechargement de l'extension (↻ dans chrome://extensions), les
  // pages déjà ouvertes perdent leur contexte : le premier « get » échoue et
  // Sessions resterait bloqué sur le squelette. On recharge la page une fois,
  // automatiquement, au lieu d'exiger un ⌘R manuel.
  function extensionContextLost() {
    try { return !chrome.runtime?.id; } catch { return true; }
  }
  function reloadOnceAfterUpdate() {
    const KEY = "bss-reload-after-update";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 5000) return false;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* stockage indisponible */ }
    location.reload();
    return true;
  }

  async function request(type, payload = {}) {
    if (type.startsWith("respiration-") && respirationProtocol !== 3)
      throw new Error("Respiration vient d’être mise à jour : rechargez cette page (⌘R). La tournée et vos capsules sont conservées ; si le message revient, rechargez l’extension dans chrome://extensions.");
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      if ((extensionContextLost() || /context invalidated/i.test(error.message)) && reloadOnceAfterUpdate())
        throw new Error("L’extension a été rechargée : cette page se rafraîchit…");
      throw error;
    }
    if (!response?.ok) throw new Error(response?.error || "Le service worker ne répond pas. Rechargez l’extension.");
    return response.data;
  }

  /* Fenêtres et onglets vivants lus directement par la page : lecture pure,
     aucun passage par le service worker — la section Sessions reste réactive
     même pendant une rafale de créations d'onglets (restauration massive). */
  async function localLive() {
    try {
      const [wins, groups] = await Promise.all([
        chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }),
        chrome.tabGroups.query({}),
      ]);
      const byId = new Map(groups.map((group) => [group.id, group]));
      return wins.filter((win) => !win.incognito).map((win) => ({
        id: win.id, focused: win.focused,
        ignored: win.tabs.filter((tab) => !C().tabURL(tab)).length,
        tabs: win.tabs.filter((tab) => C().tabURL(tab)).map((tab) => {
          const group = byId.get(tab.groupId);
          return {
            id: tab.id, windowId: win.id, url: C().tabURL(tab), originalUrl: tab.pendingUrl || tab.url,
            title: tab.title || C().tabURL(tab), pinned: tab.pinned, active: tab.active,
            discarded: tab.discarded, audible: tab.audible, lastAccessed: tab.lastAccessed,
            group: group ? String(group.id) : "", groupTitle: group?.title || "", groupColor: group?.color || "grey",
          };
        }),
      }));
    } catch { return []; }
  }

  function toast(msg, undo) {
    let el = document.getElementById("bss-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "bss-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.append(el);
    }
    el.replaceChildren(document.createTextNode(msg || ""));
    lastUndo = undo || null;
    if (lastUndo) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = lastUndo.label || "Annuler";
      btn.addEventListener("click", () => run(async () => {
        const result = await request(lastUndo.type, lastUndo.payload);
        lastUndo = null;
        await refresh();
        toast(result.message);
      }));
      el.append(btn);
    }
    el.style.display = "flex";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = "none"; }, 7000);
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    try { return await action(); } catch (error) { toast(error.message); }
    finally {
      busy = false;
      // Même après une erreur (ex. restauration interrompue), la liste repart
      // d'un état frais : les rafraîchissements perdus pendant l'action sont rejoués.
      scheduleRefresh();
    }
  }

  const domain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const faviconImg = (tab) => `<img class="tl-fav" data-page-url="${esc(tab.url)}" data-page-title="${esc(tab.title || tab.url)}" src="${esc(`${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(tab.url)}&size=32`)}" alt="" loading="lazy">`;

  async function previewSource(url) {
    if (previewCache.has(url)) return previewCache.get(url);
    const { src } = await request("preview", { url });
    previewCache.set(url, src);
    return src;
  }
  // Sans capture locale, repli sur le service de miniatures de la galerie
  // (le réglage « Favicons uniquement » le désactive : placeholders seuls).
  const fallbackThumb = (url) => (thumbsMode === "mshots"
    ? `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=400&h=300` : null);
  function setPreview(figure, url, caption) {
    if (!figure || figure.dataset.url === url) return;
    figure.dataset.url = url;
    const wanted = url;
    previewSource(url).then((src) => {
      if (!figure.isConnected || figure.dataset.url !== wanted) return;
      const shown = src || fallbackThumb(url);
      const box = figure.querySelector(".tl-preview-shot");
      if (shown) box.replaceChildren(Object.assign(document.createElement("img"), { src: shown }));
      else {
        box.innerHTML = `<span class="tl-preview-empty">${icon("image", 22)}Pas encore de capture pour cette page.</span>`;
        box.querySelector("img")?.remove();
      }
      figure.querySelector("figcaption").textContent = caption || domain(url);
    }).catch(() => {});
  }

  const liveSession = (win, index) => ({ ...win, id: `live:${win.id}`, title: `Fenêtre ${index + 1}`, windows: [win], tags: [], note: "" });

  const sessionTotalFromId = (id) => {
    const saved = library?.sessions.find((session) => session.id === id);
    if (saved) return C().tabCount(saved);
    const live = windows.find((win) => `live:${win.id}` === id);
    return live ? live.tabs.length : 0;
  };

  function stateIcons(tab) {
    return `${tab.pinned ? `<span class="tl-state" title="Épinglé">${icon("pin", 11)}</span>` : ""}${tab.discarded ? `<span class="tl-state" title="En veille">${icon("moon", 11)}</span>` : ""}`;
  }

  // Favicon avec badge « Zzz » pour un onglet en veille : la mémoire est
  // libérée (chrome.tabs.discard) mais l'URL d'origine reste intacte.
  const faviconSleep = (tab) => (tab.discarded
    ? `<span class="tl-fav-sleep" title="En veille — l'URL d'origine est conservée">${faviconImg(tab)}<span class="tl-zzz">${icon("zzz", 9)}</span></span>`
    : faviconImg(tab));

  function row(tab, { live = false, sessionId = "", pos = "" } = {}) {
    const thumb = `<button type="button" class="tl-thumb" data-action="enlarge" data-id="${esc(sessionId)}" data-url="${esc(tab.url)}" data-title="${esc(tab.title)}" aria-label="Agrandir la capture de ${esc(tab.title)}" title="Agrandir la capture"><img alt="" loading="lazy"></button>`;
    const link = live
      ? `<button type="button" class="tl-link" data-action="focus" data-tab="${tab.id}" data-url="${esc(tab.url)}" title="${esc(tab.url)}">${faviconSleep(tab)}<span class="tl-truncate">${esc(tab.title)}</span></button>`
      : `<a class="tl-link" href="${esc(tab.url)}" target="_blank" rel="noopener noreferrer" data-url="${esc(tab.url)}" title="${esc(tab.url)}">${faviconImg(tab)}<span class="tl-truncate">${esc(tab.title)}</span>${tab.note ? `<span class="tl-state" title="Note">${icon("edit", 11)}</span>` : ""}</a>`;
    const meta = live
      ? `<span class="tl-meta">${stateIcons(tab)}</span>`
      : `<button type="button" class="tl-note" data-action="note" data-id="${esc(sessionId)}" data-pos="${pos}" aria-label="${tab.note ? "Modifier la note" : "Ajouter une note"}" title="${tab.note ? "Modifier la note" : "Ajouter une note"}">${icon("edit", 12)}</button>`;
    const close = live
      ? `<button type="button" class="tl-close" data-action="close-live" data-tab="${tab.id}" data-url="${esc(tab.url)}" aria-label="Fermer cet onglet" title="Fermer cet onglet">${icon("close", 12)}</button>`
      : `<button type="button" class="tl-close" data-action="remove-link" data-id="${esc(sessionId)}" data-pos="${pos}" data-url="${esc(tab.url)}" aria-label="Retirer ce lien de la session" title="Retirer ce lien">${icon("close", 12)}</button>`;
    return `<div class="tl-row" data-url="${esc(tab.url)}" data-title="${esc(tab.title)}"${live && tab.active ? ' data-active="1"' : ""}>${thumb}${link}<span class="tl-domain">${esc(domain(tab.url))}</span>${meta}${close}</div>`;
  }

  function tabList(session, { live, isOpen }) {
    const parts = [];
    session.windows.forEach((win, wi) => {
      if (session.windows.length > 1 && !live) parts.push(`<p class="tl-window">Fenêtre ${wi + 1}</p>`);
      win.tabs.forEach((tab, ti) => parts.push(row(tab, { live, sessionId: session.id, pos: `${wi}:${ti}` })));
    });
    if (live) return parts.join("");
    const total = C().tabCount(session);
    if (!isOpen && total > 8) {
      return `${parts.slice(0, 8).join("")}<button type="button" class="tl-expand" data-action="expand" data-id="${esc(session.id)}" aria-expanded="false">${icon("chevron", 12)} Afficher les ${total} onglets</button>`;
    }
    return parts.join("");
  }

  // Mosaïque de favicons façon ancien mode : grille complète de tous les
  // favicons de la session, rappel visuel immédiat sans même ouvrir son détail.
  function faviconMosaic(tabs) {
    return `<div class="tl-mosaic" aria-hidden="true">${tabs.map((tab) => faviconImg(tab)).join("")}</div>`;
  }

  function sessionBlock(session, { live = false, archived = false } = {}) {
    const tabs = C().allTabs(session);
    const isOpen = live || expanded.has(session.id) || highlightId === session.id;
    const actions = live
      ? `<button type="button" class="tl-tool" data-action="rename-live" data-id="${session.windows[0].id}" title="Nommer cette session et l’enregistrer">${icon("edit", 13)} Renommer</button><button type="button" class="btn btn-ghost btn-sm" data-action="select-live" data-id="${session.windows[0].id}" title="Enregistrer uniquement les onglets cochés">${icon("check", 13)} Sélection…</button><button type="button" class="btn btn-ghost btn-sm" data-action="sleep-window" data-id="${session.windows[0].id}">${icon("moon", 13)} Veille</button><button type="button" class="btn btn-ghost btn-sm" data-action="merge-live" data-id="${session.windows[0].id}" title="Ouvrir les onglets d’anciennes sessions dans cette fenêtre">${icon("layers", 13)} Fusionner…</button><button type="button" class="btn btn-ghost btn-sm" data-action="dedupe-live" data-id="${session.windows[0].id}" title="Fermer les onglets en double de cette fenêtre (le premier de chaque URL est gardé, jamais l’onglet actif ni les épinglés)">${icon("check", 13)} Dédupliquer</button><button type="button" class="btn btn-ghost btn-sm" data-action="export-live" data-id="${session.windows[0].id}" title="Copier ou télécharger ces onglets (URL, titres, Markdown, HTML, CSV, JSON)">${icon("copy", 13)} Exporter…</button><button type="button" class="btn btn-ghost btn-sm" data-action="save-window" data-id="${session.windows[0].id}">${icon("save", 13)} Enregistrer</button><button type="button" class="btn btn-primary btn-sm" data-action="save-close" data-id="${session.windows[0].id}">${icon("save", 13)} Enregistrer &amp; fermer</button>`
      : archived
        ? `<button type="button" class="tl-tool" data-action="edit" data-id="${esc(session.id)}">${icon("edit", 13)} Modifier</button><button type="button" class="btn btn-ghost btn-sm" data-action="restore" data-id="${esc(session.id)}" title="Ouvrir tous les onglets dans une nouvelle fenêtre">${icon("open", 13)} Tout rouvrir</button><button type="button" class="btn btn-primary btn-sm" data-action="unarchive" data-id="${esc(session.id)}" title="Remettre cette session dans la timeline">${icon("archive", 13)} Restaurer</button>`
        : `<button type="button" class="tl-tool" data-action="favorite" data-id="${esc(session.id)}" aria-pressed="${session.favorite}" aria-label="${session.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}" title="${session.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("star", 13)}</button><button type="button" class="tl-tool" data-action="edit" data-id="${esc(session.id)}">${icon("edit", 13)} Modifier</button><button type="button" class="btn btn-ghost btn-sm" data-action="restore" data-id="${esc(session.id)}">${icon("open", 13)} Tout rouvrir</button>`;
    // Outils disponibles même repliés : inutile de déplier « Afficher les N onglets »
    // pour dédoublonner, fusionner, copier ou archiver.
    const tools = !live
      ? `<div class="tl-tools"><button type="button" data-action="dedupe" data-id="${esc(session.id)}">Retirer les doublons</button><button type="button" data-action="merge" data-id="${esc(session.id)}">${icon("layers", 12)} Fusionner…</button><button type="button" data-action="copy-urls" data-id="${esc(session.id)}">Copier les URL</button><button type="button" data-action="export" data-id="${esc(session.id)}">${icon("copy", 12)} Exporter…</button><button type="button" data-action="archive" data-id="${esc(session.id)}">${icon("archive", 12)} Archiver</button></div>` : "";
    const info = live
      ? `<p class="tl-info">${session.ignored ? `${session.ignored} page(s) interne(s) exclue(s)` : "Session en cours"} · ${tabs.filter((tab) => tab.discarded).length ? `<button type="button" class="tl-info-btn" data-action="sleep-list" title="Voir les onglets en veille et leurs URL d'origine">${tabs.filter((tab) => tab.discarded).length} en veille</button>` : "0 en veille"}${session.focused ? " · fenêtre active" : ""}</p>` : "";
    return `<section class="tl-session ${live ? "tl-live" : ""} ${highlightId === session.id ? "tl-highlight" : ""}" data-session="${esc(session.id)}">
      <div class="tl-head"><div class="tl-heading">${icon(live ? "window" : session.auto ? "clock" : "layers", 15)}<h3>${live ? `<span class="tl-title">${esc(session.title)}</span>` : `<button type="button" class="tl-title-btn" data-action="toggle" data-id="${esc(session.id)}" aria-expanded="${isOpen}"><span class="tl-title">${esc(session.title)}</span></button>`}<span class="tl-count">${tabs.length}</span></h3></div><div class="tl-actions">${actions}</div></div>
      <div class="tl-body">
        <figure class="tl-preview"><button type="button" class="tl-preview-shot" data-action="highlight" data-id="${esc(session.id)}" aria-pressed="${highlightId === session.id}" aria-label="Agrandir l’aperçu et afficher les options" title="Agrandir l’aperçu"></button><figcaption></figcaption></figure>
        <div class="tl-list">${tabList(session, { live, isOpen })}${session.note && !live ? `<p class="tl-note-text">${esc(session.note)}</p>` : ""}${tools}${info}</div>
      </div>
    </section>`;
  }

  function dateLabel(timestamp) {
    const date = new Date(timestamp), now = new Date();
    if (date.toDateString() === now.toDateString()) return "Aujourd’hui";
    now.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString()) return "Hier";
    return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  // Ligne d'une session archivée : nom et actions, puis mosaïque pleine
  // largeur des favicons (rappel visuel du contenu sans déplier).
  function archiveRow(session) {
    const tabs = C().allTabs(session);
    return `<div class="tl-archive-row"><div class="tl-archive-head"><span class="tl-archive-title" title="${esc(session.title)}">${esc(session.title)}</span><span class="tl-archive-meta">${C().tabCount(session)} onglet(s) · ${esc(dateLabel(session.createdAt))}</span><span class="tl-archive-actions"><button type="button" class="tl-tool" data-action="unarchive" data-id="${esc(session.id)}" title="Remettre cette session dans la timeline">${icon("open", 12)} Restaurer</button><button type="button" class="tl-tool" data-action="restore" data-id="${esc(session.id)}">${icon("layers", 12)} Tout rouvrir</button><button type="button" class="tl-tool" data-action="delete" data-id="${esc(session.id)}" title="Supprimer définitivement cette session archivée">${icon("close", 12)} Supprimer</button></span></div>${faviconMosaic(tabs)}</div>`;
  }

  function renderRespiration() {
    const host = document.getElementById("respiration-root");
    if (!host) return;
    const expandedQueue = host.querySelector("[data-r-capsules]")?.open;
    const focused = host.contains(document.activeElement) ? { ...document.activeElement.dataset } : null;
    const q = respiration;
    const button = (action, label, id = "", primary = false, hint = "") => `<button type="button" class="btn ${primary ? "btn-primary" : "btn-ghost"} btn-sm" data-r-action="${action}" data-id="${esc(id)}"${hint ? ` title="${esc(hint)}"` : ""}>${label}</button>`;
    if (!q || q.stopped) {
      host.innerHTML = `<section class="respiration-card"><div class="respiration-head"><div><span class="respiration-eyebrow">VOTRE NAVIGATION, PLUS LÉGÈRE</span><h2>Respiration</h2><p>${respirationMode === "suspend" ? "Gardez les 10 derniers onglets chargés ; les autres restent visibles, suspendus par Chrome." : "Gardez les 10 derniers onglets. Fermez-en un avec ⌘W : le suivant revient tout seul."}</p></div>${button("setup", "Activer Respiration", "", true)}</div>${q ? `<p class="respiration-note">La tournée précédente reste enregistrée dans vos sessions. ${button("resume", "Reprendre cette tournée")}${q.entries.some((e) => e.state === "pending") ? ` ${button("reopen-suspend", "Rouvrir en mode Suspendre")}` : ""} Le mode choisi dans les Réglages s’applique à la prochaine tournée ; les pages déjà fermées restent dans les sessions.</p>` : ""}</section>`;
      return;
    }
    const suspend = q.mode === "suspend";
    const openEntries = q.entries.filter((e) => e.state === "open");
    const pendingEntries = q.entries.filter((e) => e.state === "pending");
    const doneEntries = q.entries.filter((e) => e.state === "done");
    const outsideEntries = q.entries.filter((e) => e.state === "outside");
    const opened = windows.find((w) => w.id === q.windowId)?.tabs.length || 0;
    const loaded = openEntries.filter((e) => !e.discarded).length;
    const suspended = openEntries.filter((e) => e.discarded).length;
    const complete = q.entries.every((e) => ["done", "outside"].includes(e.state));
    const playing = openEntries.filter((e) => e.keepReason === "media").length;
    const over = suspend ? loaded : opened;
    const label = q.paused ? "EN PAUSE" : over > q.target + playing ? (suspend ? "SUSPENSION INCOMPLÈTE" : "RÉDUCTION INCOMPLÈTE") : complete ? "TOURNÉE TERMINÉE" : suspend ? "SUSPENSION ACTIVE" : "RESPIRATION ACTIVE";
    const reasons = { media: "Lecture en cours (vidéo ou audio) · seule exception", active: "Onglet actif · Chrome ne le suspend pas", pinned: "Onglet épinglé · conservé chargé", changed: "Page modifiée pendant la réduction", refused: suspend ? "Suspension refusée par Chrome" : "Fermeture refusée par Chrome" };
    const kept = openEntries.filter((e) => e.keepReason
      && windows.find((w) => w.id === q.windowId)?.tabs.some((t) => t.id === e.tabId));
    const keptHTML = over > q.target ? `<details class="respiration-kept" open><summary>${playing ? `${playing} lecture(s) en cours conservée(s) en plus des ${q.target} derniers onglets` : suspend ? "Des onglets protégés restent chargés au-delà de la cible" : "La réduction doit être relancée"}</summary><ul>${kept.map((e) => `<li>${faviconImg(e)}${button("focus-tab", esc(e.title), String(e.tabId))}<span>${esc(reasons[e.keepReason] || "Ancienne exception · relancez la réduction")}</span></li>`).join("")}</ul></details>` : "";
    // Chaque page est un bouton-favicône : un clic active l'onglet s'il est
    // ouvert, sinon rouvre la page. Toutes les pages sont affichées — pas
    // d'échantillon : la grille montre réellement les 97, 186, etc.
    const fav = (e) => {
      const action = "select";
      const state = e.keepReason === "media" && e.state === "open" ? "▶ Lecture en cours"
        : e.discarded && e.state === "open" ? "Suspendu · clic pour charger" : respirationState(e.state);
      return `<button type="button" class="respiration-fav" data-r-action="${action}" data-id="${esc(e.id)}" data-url="${esc(e.url)}" aria-label="${esc(`${e.title} — ${state}`)}">${faviconImg(e)}</button>`;
    };
    const group = (state, title, hint, entries) => `<section class="respiration-group" data-r-section="${state}"><header><strong>${title}</strong><span>${entries.length} page${entries.length > 1 ? "s" : ""}${hint ? ` · ${hint}` : ""}</span></header>${entries.length ? `<div class="respiration-grid">${entries.map(fav).join("")}</div>` : `<p class="respiration-note">Rien ici pour l’instant.</p>`}</section>`;
    const nextUp = globalThis.PKRespiration?.nextEntry?.(q) || null;
    const nextHTML = nextUp ? `<p class="respiration-next">${faviconImg(nextUp)}<span>Prochaine page qui revient au prochain ⌘W : <strong>${esc(nextUp.title)}</strong></span></p>` : "";
    const usableLots = q.capsules.filter((c) => q.entries.some((e) => e.capsuleId === c.id && ["pending", "open"].includes(e.state))).length;
    const capsuleRow = (c, i) => {
      const entries = q.entries.filter((e) => e.capsuleId === c.id);
      const left = entries.filter((e) => e.state === "pending").length;
      const live = entries.filter((e) => e.state === "open").length;
      const treated = entries.filter((e) => e.state === "done").length;
      return `<li><div class="respiration-capsule"><strong>${esc(c.title)}</strong><span>${live} ouverts · ${left} à revenir · ${treated} fermés par vous</span></div><div class="respiration-actions">${i ? button("up", "Monter", c.id) : ""}${i < q.capsules.length - 1 ? button("down", "Descendre", c.id) : ""}</div></li>`;
    };
    const orderHTML = q.capsules.length > 1
      ? `<details data-r-capsules><summary>Ordre de retour · ${q.capsules.length} lots de pages</summary><p class="respiration-note">Un lot = des pages de même provenance (un groupe Chrome, ou les onglets de la fenêtre). La prochaine page vient du lot en haut ; montez, descendez ou passez au lot suivant.</p><ol class="respiration-capsules">${q.capsules.map(capsuleRow).join("")}</ol></details>`
      : "";
    const budgetText = suspend
      ? `${q.target} chargés${playing ? ` + ${playing} lecture(s)` : ""} · le reste suspendu`
      : `${q.target} onglets ouverts${playing ? ` + ${playing} lecture(s)` : ""} · le reste dans la réserve`;
    const extra = Math.max(0, over - q.target - playing);
    const compactLabel = suspend
      ? `Suspendre ${extra} onglet${extra > 1 ? "s" : ""} en trop`
      : `Fermer ${extra} onglet${extra > 1 ? "s" : ""} en trop`;
    const modeNote = suspend
      ? `${opened} onglet${opened > 1 ? "s" : ""} restent visibles dans Chrome : ${loaded} chargé${loaded > 1 ? "s" : ""}, ${suspended} suspendu${suspended > 1 ? "s" : ""}. Le mode Fermer n’en garde que ${q.target} dans Chrome.`
      : `${opened} onglet${opened > 1 ? "s" : ""} ouvert${opened > 1 ? "s" : ""} dans Chrome ; ${pendingEntries.length} page${pendingEntries.length > 1 ? "s" : ""} dans la réserve.`;
    const playIcon = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" focusable="false"><path d="M5.8 3.6 12 8l-6.2 4.4Z"/></svg>`;
    const pauseIcon = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" focusable="false"><path d="M6 3.6v8.8M10 3.6v8.8"/></svg>`;
    const statsHTML = suspend
      ? `<div class="respiration-stats" role="status"><div data-state="open"><strong>${loaded}<small> / ${q.target}${playing ? ` + ${playing} lecture(s)` : ""}</small></strong><span>Chargés</span></div><div data-state="pending"><strong>${suspended}</strong><span>Suspendus</span></div><div data-state="done"><strong>${doneEntries.length}</strong><span>Fermés par vous</span></div></div>`
      : `<div class="respiration-stats" role="status"><div data-state="open"><strong>${opened}<small> / ${q.target}${playing ? ` + ${playing} lecture(s)` : ""}</small></strong><span>Onglets ouverts</span></div><div data-state="pending"><strong>${pendingEntries.length}</strong><span>Fermés, à revenir</span></div><div data-state="done"><strong>${doneEntries.length}</strong><span>Fermés par vous</span></div></div>`;
    const pendingHint = suspend ? "pages ajoutées, pas encore ouvertes" : "⌘W : retour automatique · clic : échanger";
    const openTitle = suspend ? "Onglets de la fenêtre" : "Ouverts dans la fenêtre";
    const openHint = suspend ? `${loaded} chargés · ${suspended} suspendus` : `sur ${q.target} gardés`;
    const clickHint = suspend
      ? "Survolez une favicône pour voir le titre, l’URL et la vignette ; cliquez pour recharger un onglet suspendu ou activer un onglet chargé."
      : "Survolez une favicône pour voir le titre, l’URL et la vignette ; cliquez pour activer la page ou l’échanger avec l’onglet le moins récemment utilisé. Celui-ci reste en réserve.";
    const modeSwitch = `<div class="respiration-modes" role="group" aria-label="Mode de la tournée">
      <button type="button" class="respiration-mode${suspend ? "" : " active"}" data-r-action="mode-close" aria-pressed="${!suspend}">
        <strong>${q.target} onglets ouverts</strong>
        <small>Le reste est sauvegardé puis fermé</small>
      </button>
      <button type="button" class="respiration-mode${suspend ? " active" : ""}" data-r-action="mode-suspend" aria-pressed="${suspend}">
        <strong>${q.target} chargés, le reste suspendu</strong>
        <small>Les onglets restent visibles dans Chrome</small>
      </button>
    </div>`;
    const actionCard = (name, label, hint, id = "") => `<button type="button" class="respiration-action-card" data-r-action="${name}" data-id="${esc(id)}"><strong>${label}</strong><small>${hint}</small></button>`;
    const moreActions = [
      pendingEntries.length ? actionCard("reopen-suspend", "Rouvrir les pages à revenir", "Les recréer dans Chrome et les suspendre aussitôt.") : "",
      usableLots > 1 ? actionCard("next", "Passer au groupe suivant", "Les prochaines pages viendront d’un autre lot de la tournée.") : "",
      actionCard("enqueue-dialog", "Ajouter des pages à la réserve", "Importer une session existante sans l’ouvrir tout de suite."),
      actionCard("stop", "Arrêter la tournée", "Le remplissage s’arrête ; toutes les pages restent dans les sessions."),
    ].filter(Boolean).join("");
    host.innerHTML = `<section class="respiration-card"><div class="respiration-head"><div><span class="respiration-eyebrow">${label}</span><h2>Respiration <span class="respiration-budget">${budgetText}</span></h2></div><div class="respiration-actions">${button("sidebar", "Toutes les pages", "", false, "Ouvre la liste complète dans le panneau latéral de Chrome.")}${q.paused ? button("resume", `${playIcon}<span>Reprendre la tournée</span>`, "", true, "Relance la réduction automatique.") : button("pause", `${pauseIcon}<span>Mettre en pause</span>`, "", false, "Suspend le remplissage ; les onglets ne sont plus réduits.")}${extra ? button("compact", compactLabel, "", true) : ""}</div></div>${modeSwitch}<p class="respiration-note">${modeNote}</p>${statsHTML}${q.reason ? `<p class="respiration-note">${esc(q.reason)}</p>` : ""}${keptHTML}${nextHTML}<details class="respiration-more"><summary>Plus d’actions</summary><div class="respiration-action-grid">${moreActions}</div></details><div class="respiration-groups">${group("open", openTitle, openHint, openEntries)}${group("pending", "Fermés, à revenir", pendingHint, pendingEntries)}${group("done", "Fermés par vous", "sans retour automatique", doneEntries)}${outsideEntries.length ? group("outside", "Déplacés ailleurs", "", outsideEntries) : ""}</div><p class="respiration-note">${clickHint}</p>${orderHTML}</section>`;
    const queue = host.querySelector("[data-r-capsules]");
    if (expandedQueue && queue) queue.open = true;
    if (focused?.rAction) [...host.querySelectorAll("[data-r-action]")]
      .find((el) => el.dataset.rAction === focused.rAction && el.dataset.id === focused.id && el.dataset.url === focused.url)?.focus({ preventScroll: true });
  }

  function respirationSetup() {
    const choices = windows.filter((w) => w.tabs.length).map((w, i) => `<option value="${w.id}"${w.focused ? " selected" : ""}>Fenêtre ${i + 1} · ${w.tabs.length} onglets · ${esc(w.tabs.at(-1)?.title || "")}</option>`).join("");
    if (!choices) { toast("Ouvrez des pages web dans une fenêtre pour commencer."); return; }
    const suspend = respirationMode === "suspend";
    const intro = suspend
      ? "Tous les onglets restent dans Chrome. Les N plus récents restent chargés ; les autres sont suspendus par Chrome et se rechargent au clic. Aucune page n’est fermée."
      : "Les derniers onglets de la fenêtre restent ouverts. Tous les précédents sont enregistrés puis fermés. Seules les vidéos en cours de lecture restent ouvertes en plus.";
    const warning = suspend
      ? "La tournée reste sauvegardée dans vos sessions. Chrome peut perdre l’état JavaScript des pages suspendues ; enregistrez les formulaires et éditeurs dont vous avez besoin. L’onglet actif, les épinglés et les lectures peuvent rester chargés au-delà de la cible."
      : "<strong>Enregistrez vos brouillons avant de continuer.</strong> Les pages actives, épinglées, formulaires et éditeurs seront aussi fermés s’ils ne sont pas dans les derniers onglets. La sauvegarde conserve les liens, pas les saisies. Les pages internes Chrome restent hors limite.";
    showDialog("Activer Respiration", `<form id="respiration-setup"><p class="tl-dialog-desc">${intro}</p><div class="tl-fields"><label class="tl-field">Fenêtre<select name="windowId">${choices}</select></label><label class="tl-field">Nombre d’onglets web à garder<input name="target" type="number" min="1" max="30" value="10" required></label><label class="tl-field">Mode<select name="mode"><option value="close"${suspend ? "" : " selected"}>Fermer les onglets (réserve)</option><option value="suspend"${suspend ? " selected" : ""}>Suspendre les onglets (Chrome natif)</option></select></label></div><p class="tl-dialog-desc">${warning}</p>${formFooter("Enregistrer et alléger cette fenêtre")}</form>`);
    document.getElementById("respiration-setup").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      runRespiration(async () => {
        const mode = data.get("mode") === "suspend" ? "suspend" : "close";
        const result = await request("respiration-start", { windowId: Number(data.get("windowId")), target: Number(data.get("target")), mode });
        // Le mode de la tournée doit rester le même que celui des Réglages :
        // sinon un réglage anodin rouvrirait le sélecteur sur un autre mode.
        const stored = await chrome.storage.local.get("settings");
        await chrome.storage.local.set({ settings: { ...(stored.settings || {}), respirationMode: mode } });
        respirationMode = mode;
        closeDialog(); await refresh(); toast(result.message);
      });
    });
  }

  const respirationState = (state) => ({ pending: "Fermée · à revenir", open: "Ouverte", done: "Fermée par vous", outside: "Déplacée ailleurs", opening: "Ouverture…", parking: "Fermeture…" }[state] || state);

  function respirationEnqueue() {
    const options = library.sessions.filter((s) => !s.auto && !s.archived && !respiration.capsules.some((c) => c.sessionId === s.id));
    if (!options.length) { toast("Toutes les sessions disponibles sont déjà dans la tournée. Enregistrez une autre fenêtre pour l’ajouter."); return; }
    showDialog("Ajouter des pages à la réserve", `<form id="respiration-enqueue"><label class="tl-field">Session<select name="id">${options.map((s) => `<option value="${esc(s.id)}">${esc(s.title)} · ${C().tabCount(s)} pages</option>`).join("")}</select></label><p class="tl-dialog-desc">Choisissez une session enregistrée. Ses pages seront placées à la suite de la réserve et s’ouvriront quand une place se libère.</p>${formFooter("Ajouter à la réserve")}</form>`);
    document.getElementById("respiration-enqueue").addEventListener("submit", (event) => {
      event.preventDefault(); const id = new FormData(event.target).get("id");
      runRespiration(async () => { const result = await request("respiration-enqueue", { id }); closeDialog(); await refresh(); toast(result.message); });
    });
  }

  async function runRespiration(action) {
    // Un clic utilisateur ne doit pas disparaître pendant un refresh des onglets.
    while (busy) await new Promise((resolve) => setTimeout(resolve, 30));
    return run(action);
  }

  async function onRespirationClick(event) {
    const button = event.target.closest("[data-r-action]");
    if (!button) return;
    const { rAction: action, id } = button.dataset;
    if (action === "sidebar") {
      const winId = respiration?.windowId || windows.find((win) => win.focused)?.id;
      if (winId != null) chrome.sidePanel.open({ windowId: winId })
        .then(() => chrome.windows.update(winId, { focused: true })).catch((error) => toast(error.message));
      return;
    }
    runRespiration(async () => {
      if (action === "setup") { await refresh(); return respirationSetup(); }
      if (action === "focus-tab") return request("focus", { id: Number(id) });
      if (action === "enqueue-dialog") return respirationEnqueue();
      if (action === "mode-close" || action === "mode-suspend") {
        const mode = action === "mode-close" ? "close" : "suspend";
        const result = await request("respiration-set-mode", { mode, resume: true });
        const stored = await chrome.storage.local.get("settings");
        await chrome.storage.local.set({ settings: { ...(stored.settings || {}), respirationMode: mode } });
        respirationMode = mode;
        await refresh(); toast(result.message);
        return;
      }
      const current = await chrome.windows.getCurrent();
      const result = await request(`respiration-${action}`, { id, windowId: current.id });
      await refresh(); toast(result.message);
    });
  }

  function render() {
    const core = C();
    if (!root()) return;
    if (!library) { showSkeleton(); return; }
    renderRespiration();
    const liveWindows = windows.map(liveSession).filter((session) => core.tabCount(session));
    const sessions = library.sessions.filter((session) => !session.archived && !session.auto)
      .sort((a, b) => b.createdAt - a.createdAt);
    let html = "";
    // « Reprendre » : à tab zéro, la dernière session d'un jour précédent
    // (hors favoris, déjà épinglées en tête) resurgit en tête de timeline —
    // le « Remember and rediscover » de Tablerone. Le masquage mémorise la
    // date de la plus récente écartée : les plus anciennes ne remontent pas,
    // une session plus récente resurgira le lendemain.
    const dismissedAt = Number(localStorage.getItem("bss-resume-at") || 0);
    const resume = !liveWindows.length
      && sessions.find((session) => !session.favorite && session.createdAt > dismissedAt
        && dateLabel(session.createdAt) !== "Aujourd’hui");
    if (resume) {
      html += `<section class="tl-resume"><div class="tl-resume-body"><strong>Reprendre « ${esc(resume.title)} »</strong><span class="tl-resume-meta">${C().tabCount(resume)} onglet(s) · ${esc(dateLabel(resume.createdAt))}</span></div><div class="tl-resume-actions"><button type="button" class="btn btn-ghost btn-sm" data-action="dismiss-resume" data-id="${esc(resume.id)}" data-at="${resume.createdAt}">Masquer</button><button type="button" class="btn btn-primary btn-sm" data-action="restore" data-id="${esc(resume.id)}">${icon("open", 13)} Tout rouvrir</button></div></section>`;
    }
    if (liveWindows.length) {
      html += `<h2 class="tl-day"><span>En cours</span><span class="tl-rule"></span><span class="tl-total">${liveWindows.length} fenêtre${liveWindows.length > 1 ? "s" : ""}</span></h2>`;
      html += liveWindows.map((session) => sessionBlock(session, { live: true })).join("");
    }
    // Les sessions favorites sont épinglées dans leur propre groupe, en tête
    // de la timeline — c'est là qu'on les retrouve après un clic sur l'étoile.
    const favorites = sessions.filter((session) => session.favorite);
    if (favorites.length) {
      html += `<h2 class="tl-day"><span>${icon("star", 11)} Favoris</span><span class="tl-rule"></span><span class="tl-total">${favorites.length} session${favorites.length > 1 ? "s" : ""}</span></h2>`;
      html += favorites.map((session) => sessionBlock(session)).join("");
    }
    let previous;
    const byDay = sessions.filter((session) => !session.favorite);
    for (const session of byDay) {
      const day = dateLabel(session.createdAt);
      if (day !== previous) {
        const group = byDay.filter((s) => dateLabel(s.createdAt) === day);
        html += `<h2 class="tl-day"><span>${esc(day)}</span><span class="tl-rule"></span><span class="tl-total">${group.length} session${group.length > 1 ? "s" : ""}</span></h2>`;
        previous = day;
      }
      html += sessionBlock(session);
    }
    // Archives : les sessions archivées restent retrouvables ici (les copies
    // internes « · avant … » servent aux annulations, elles restent cachées).
    const archivedSessions = library.sessions
      .filter((session) => session.archived && !session.auto && !/ · avant /.test(session.title))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (archivedSessions.length) {
      html += `<h2 class="tl-day"><span class="tl-archives-head">${icon("archive", 11)}<span>Archives</span></span><span class="tl-rule"></span><span class="tl-total">${archivedSessions.length} session${archivedSessions.length > 1 ? "s" : ""}</span></h2>`;
      html += `<div class="tl-archives">${archivedSessions.map(archiveRow).join("")}</div>`;
    }
    root().innerHTML = html || `<p class="tl-empty">Rien d’enregistré pour l’instant. Récupérez vos fenêtres et onglets récemment fermés, ou importez une sauvegarde (boutons en haut) — vos prochaines sessions apparaîtront ici.</p>`;
    const count = document.getElementById("sessions-count");
    if (count) {
      const webTabs = liveWindows.reduce((n, w) => n + C().tabCount(w), 0);
      const internal = liveWindows.reduce((n, w) => n + (w.ignored || 0), 0);
      count.textContent = `${sessions.length} session${sessions.length > 1 ? "s" : ""} · ${webTabs} onglet(s) ouvert(s)${internal ? ` + ${internal} page(s) interne(s)` : ""}`;
    }
    // Largeur élargie dès qu’il y a une session en cours (aperçu permanent
    // en grand) ou une session ouverte en vue élargie.
    root().closest("main")?.classList.toggle("tl-wide", !!highlightId || liveWindows.length > 0);
    // Affichage des sessions : grand aperçu à gauche et miniatures de ligne
    // sont désormais indépendants (réglage rowThumbs ; « both » = ancien nom
    // de « full », et previews false masque aussi les miniatures).
    const ROW_THUMBS = { both: "full" };
  const mode = ROW_THUMBS[library.settings.rowThumbs] || library.settings.rowThumbs || "preview";
    root().classList.toggle("tl-nothumbs", library.settings.previews === false || mode === "favicons" || mode === "preview");
    root().classList.toggle("tl-nopreview", mode === "favicons" || mode === "thumbs");
    for (const figure of root().querySelectorAll(".tl-preview")) {
      const block = figure.closest(".tl-session");
      const first = block.querySelector(".tl-row[data-active], .tl-row");
      const total = sessionTotalFromId(block.dataset.session);
      figure.append(Object.assign(document.createElement("span"), { className: "tl-preview-count", textContent: `${total} onglet${total > 1 ? "s" : ""}` }));
      if (first) setPreview(figure, first.dataset.url, first.dataset.title);
    }
    fillThumbs();
    if (busyLabelActive) showBusyLabel(busyLabelActive); // le rendu a remplacé le DOM : le bandeau revient
  }

  // Après une fusion ou un dédoublonnage : amène la session concernée à l'écran
  // et la fait cligner pour montrer où elle est.
  function revealSession(id) {
    const block = root().querySelector(`.tl-session[data-session="${CSS.escape(id)}"]`);
    if (!block) return;
    block.scrollIntoView({ behavior: "smooth", block: "start" });
    block.classList.add("tl-flash");
    setTimeout(() => block.classList.remove("tl-flash"), 1800);
  }

  /* Miniatures par ligne : une seule requête groupée vers le service worker,
     puis repli individuel sur le service de la galerie si la capture locale
     manque. Les lignes non encore rendues (repli « Afficher tout » inclus)
     sont traitées au rendu suivant. */
  async function fillThumbs() {
    if (!library || library.settings.previews === false) return;
    const nodes = [...root().querySelectorAll(".tl-thumb:not([data-filled])")];
    if (!nodes.length) return;
    for (const node of nodes) node.dataset.filled = "1";
    const urls = [...new Set(nodes.map((node) => node.dataset.url))];
    let sources = {};
    try { ({ sources } = await request("previews", { urls })); } catch { /* captures locales indisponibles : repli seul */ }
    for (const node of nodes) {
      const src = sources?.[node.dataset.url] || fallbackThumb(node.dataset.url);
      if (src) node.querySelector("img")?.setAttribute("src", src);
      else node.append(Object.assign(document.createElement("span"), { className: "tl-thumb-fallback", innerHTML: icon("image", 14) }));
    }
  }

  /* Rappel visible en tête de l'onglet Sessions : ce qui est programmé,
     sans aller le chercher dans Réglages. Un clic y va. */
  function renderSessionsHint() {
    const host = document.getElementById("hint-sessions");
    if (!host || !library?.settings) return;
    const s = library.settings;
    const hour = `${String(s.dailyHour ?? 7).padStart(2, "0")}:00`;
    const parts = s.dailySave
      ? [`Session quotidienne : tous les jours à ${hour}`,
        s.dailyExport ? "export fichier : activé" : "export fichier : désactivé",
        s.dailyClose ? "repart à vide" : "onglets conservés"]
      : ["Session quotidienne : désactivée"];
    parts.push(s.autosave ? "sauvegarde 5 min : activée" : "sauvegarde 5 min : désactivée");
    host.innerHTML = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4"/></svg><span>${esc(parts.join(" · "))}</span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>`;
    host.onclick = () => { if (typeof openSettingsBlock === "function") openSettingsBlock("sessions"); };
  }

  let lastSignature = "";
  async function refresh() {
    // La bibliothèque vient du service worker (écrivain unique) ; les fenêtres
    // vivantes sont lues ici même, en parallèle — jamais bloquées par la file.
    const [result, live] = await Promise.all([request("get"), localLive()]);
    library = result.library; windows = live.length ? live : windows; respiration = result.respiration;
    respirationProtocol = result.respirationProtocol || 0;
    renderSessionsHint();
    // Rendu seulement si l'état a réellement changé : les événements d'onglets
    // sont fréquents et reconstruire la timeline casserait survols et miniatures.
    const signature = JSON.stringify([
      library.settings,
      respiration,
      library.sessions.map((session) => [session.id, session.updatedAt, session.archived, session.favorite]),
      windows.map((win) => [win.id, win.focused, win.ignored,
        win.tabs.map((tab) => [tab.id, tab.url, tab.title, tab.active, tab.pinned, tab.discarded])]),
    ]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      render();
    }
  }
  const scheduleRefresh = () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (!busy) run(refresh); }, 300); };

  function sessionById(id) {
    const item = library?.sessions.find((session) => session.id === id);
    if (!item) throw new Error("Session introuvable. Actualisez la section.");
    return item;
  }

  /* ----- dialogues légers (modification, note) ----- */
  let dialogTrigger = null;
  function closeDialog() { const d = document.getElementById("bss-dialog"); d?.close(); }
  function showDialog(title, content) {
    let d = document.getElementById("bss-dialog");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "bss-dialog";
      d.addEventListener("close", () => {
        (dialogTrigger?.isConnected ? dialogTrigger : null)?.focus();
      });
      // Le tiroir vit hors de #sessions-root : fermeture par ses propres
      // boutons, par un clic sur le fond assombri (cible = dialogue, hors de
      // sa boîte) ou par Échap (annulation native du <dialog>).
      d.addEventListener("click", (event) => {
        const rect = d.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside || event.target.closest("[data-action='close-dialog']")) closeDialog();
      });
      document.body.append(d);
    }
    if (!d.open) dialogTrigger = document.activeElement;
    d.setAttribute("aria-labelledby", "bss-dialog-title");
    d.innerHTML = `<div class="tl-dialog-head"><h2 id="bss-dialog-title" tabindex="-1">${esc(title)}</h2><button type="button" class="tl-tool" data-action="close-dialog" aria-label="Fermer" title="Fermer">${icon("close", 14)}</button></div>${content}`;
    if (!d.open) d.showModal();
    (d.querySelector("[autofocus]") || d.querySelector("h2")).focus();
  }
  const formFooter = (label) => `<div class="tl-dialog-foot"><button type="button" class="btn btn-ghost btn-sm" data-action="close-dialog">Annuler</button><button type="submit" class="btn btn-primary btn-sm">${label}</button></div>`;

  function editDialog(session) {
    showDialog("Modifier la session", `<form id="bss-edit"><div class="tl-fields"><label class="tl-field">Nom<input name="title" required maxlength="160" value="${esc(session.title)}" autofocus></label><label class="tl-field">Tags<input name="tags" value="${esc(session.tags.join(", "))}" placeholder="Travail, Lecture"><small>Séparés par des virgules · 12 maximum</small></label><label class="tl-field">Note<textarea name="note" maxlength="4000">${esc(session.note)}</textarea></label></div>${formFooter("Enregistrer")}</form>`);
    document.getElementById("bss-edit").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      run(async () => {
        const result = await request("edit", { id: session.id, revision: session.updatedAt, changes: { title: data.get("title"), tags: data.get("tags").split(","), note: data.get("note") } });
        closeDialog(); await refresh(); toast(result.message);
      });
    });
  }

  function noteDialog(session, pos) {
    const [wi, ti] = pos.split(":").map(Number);
    const tab = session.windows[wi]?.tabs[ti];
    if (!tab) throw new Error("Ligne introuvable. Actualisez la section.");
    const next = structuredClone(session);
    showDialog("Note", `<p class="tl-dialog-desc">${esc(tab.title)}</p><form id="bss-note"><label class="tl-field">Votre note<textarea name="note" maxlength="4000" autofocus>${esc(tab.note || "")}</textarea></label>${formFooter("Enregistrer")}</form>`);
    document.getElementById("bss-note").addEventListener("submit", (event) => {
      event.preventDefault();
      next.windows[wi].tabs[ti].note = new FormData(event.target).get("note");
      run(async () => {
        const result = await request("tabs", { id: session.id, revision: session.updatedAt, windows: next.windows });
        closeDialog(); await refresh(); toast(result.message);
      });
    });
  }

  function mergeDialog(session) {
    const others = (library?.sessions || [])
      .filter((item) => !item.archived && !item.auto && item.id !== session.id)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
    if (!others.length) { toast("Aucune autre session disponible pour une fusion."); return; }
    const items = others.map((item) => `<label class="tl-merge-item"><input type="checkbox" name="src" value="${esc(item.id)}"><span class="tl-merge-body"><span class="tl-merge-title">${esc(item.title)}</span><span class="tl-merge-meta">${C().tabCount(item)} onglet(s) · ${esc(dateLabel(item.createdAt))}</span></span></label>`).join("");
    showDialog("Fusionner des sessions", `<p class="tl-dialog-desc">Les onglets des sessions cochées rejoignent « ${esc(session.title)} ». Les sessions sources sont archivées — la fusion reste annulable.</p><form id="bss-merge"><div class="tl-merge-list">${items}</div>${formFooter("Fusionner")}</form>`);
    document.getElementById("bss-merge").addEventListener("submit", (event) => {
      event.preventDefault();
      const sourceIds = new FormData(event.target).getAll("src");
      if (!sourceIds.length) { toast("Cochez au moins une session à fusionner."); return; }
      run(async () => {
        const result = await request("merge", { id: session.id, revision: session.updatedAt, sourceIds });
        closeDialog(); expanded.add(session.id); await refresh();
        revealSession(session.id); toast(result.message, result.undo);
      });
    });
  }

  function renameLiveDialog(windowId) {
    if (!windows.some((win) => win.id === windowId)) { toast("Fenêtre introuvable. Actualisez la section."); return; }
    showDialog("Nommer et enregistrer cette fenêtre", `<form id="bss-rename"><div class="tl-fields"><label class="tl-field">Nom<input name="title" required maxlength="160" value="Session du ${new Date().toLocaleDateString("fr-FR")}" autofocus></label><label class="tl-field">Tags<input name="tags" placeholder="Travail, Lecture"><small>Séparés par des virgules · 12 maximum</small></label><label class="tl-field">Note<textarea name="note" maxlength="4000"></textarea></label></div>${formFooter("Enregistrer")}</form>`);
    document.getElementById("bss-rename").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      run(async () => {
        const result = await request("save", { windowId, title: data.get("title"), tags: data.get("tags").split(","), note: data.get("note") });
        closeDialog(); await refresh(); toast(result.message);
      });
    });
  }

  function mergeLiveDialog(windowId) {
    const others = (library?.sessions || [])
      .filter((item) => !item.archived && !item.auto)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
    if (!others.length) { toast("Aucune session enregistrée disponible pour une fusion."); return; }
    const items = others.map((item) => `<label class="tl-merge-item"><input type="checkbox" name="src" value="${esc(item.id)}"><span class="tl-merge-body"><span class="tl-merge-title">${esc(item.title)}</span><span class="tl-merge-meta">${C().tabCount(item)} onglet(s) · ${esc(dateLabel(item.createdAt))}</span></span></label>`).join("");
    showDialog("Fusionner dans cette fenêtre", `<p class="tl-dialog-desc">Les onglets des sessions cochées s’ouvrent dans la fenêtre en cours ; les sessions sources sont archivées — la fusion reste annulable.</p><form id="bss-merge-live"><div class="tl-merge-list">${items}</div>${formFooter("Fusionner")}</form>`);
    document.getElementById("bss-merge-live").addEventListener("submit", (event) => {
      event.preventDefault();
      const sourceIds = new FormData(event.target).getAll("src");
      if (!sourceIds.length) { toast("Cochez au moins une session à fusionner."); return; }
      run(async () => {
        const result = await request("merge-live", { windowId, sourceIds });
        closeDialog(); await refresh(); toast(result.message, result.undo);
      });
    });
  }

  /* ----- export façon Tablerone (URLs, titres, Markdown, HTML, CSV, JSON) ----- */
  const EXPORT_FORMATS = [
    ["urls", "URL", "Une adresse par ligne — à coller ailleurs.", "txt"],
    ["titles", "Titres", "Un titre de page par ligne.", "txt"],
    ["markdown", "Markdown", "Liste de liens avec vos notes — docs, billets.", "md"],
    ["html", "HTML", "Liste de liens HTML avec vos notes.", "html"],
    ["csv", "CSV", "Titre, URL, note — tableur (Sheets, Notion, Airtable…).", "csv"],
    ["json", "JSON", "Champs titre, URL, note, épinglé — pour scripter.", "json"],
  ];

  function exportDialog(session) {
    const options = EXPORT_FORMATS.map(([value, label, hint]) => `<label class="tl-merge-item"><input type="radio" name="format" value="${value}"${value === "urls" ? " checked" : ""}><span class="tl-merge-body"><span class="tl-merge-title">${esc(label)}</span><span class="tl-merge-meta">${esc(hint)}</span></span></label>`).join("");
    showDialog("Exporter la session", `<p class="tl-dialog-desc">${esc(session.title)} · ${C().tabCount(session)} onglet(s) — copiés dans le presse-papiers ou téléchargés en fichier.</p><form id="bss-export"><div class="tl-merge-list">${options}</div><div class="tl-dialog-foot"><button type="button" class="btn btn-ghost btn-sm" data-action="close-dialog">Annuler</button><button type="submit" class="btn btn-ghost btn-sm" name="mode" value="download">Télécharger</button><button type="submit" class="btn btn-primary btn-sm" name="mode" value="copy">Copier</button></div></form>`);
    document.getElementById("bss-export").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const format = data.get("format");
      const ext = EXPORT_FORMATS.find(([value]) => value === format)[3];
      const text = C().exportText(session, format);
      if (event.submitter?.value === "download") {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const link = Object.assign(document.createElement("a"), { href: url, download: C().slugFilename(session.title, ext) });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        closeDialog(); toast(`Fichier .${ext} téléchargé.`);
      } else {
        navigator.clipboard.writeText(text)
          .then(() => { closeDialog(); toast("Copié dans le presse-papiers."); })
          .catch(() => toast("Copie impossible : le presse-papiers est refusé."));
      }
    });
  }

  function exportLiveDialog(windowId) {
    const index = windows.findIndex((win) => win.id === windowId);
    if (index < 0) { toast("Fenêtre introuvable. Actualisez la section."); return; }
    exportDialog(liveSession(windows[index], index));
  }

  /* ----- onglets en veille : récapitulatif et réveil -----
     La veille est un discard natif : l'onglet garde son URL d'origine —
     même extension supprimée, rien n'est jamais perdu. Ce dialogue sert
     de rappel : favicon, titre, URL complète et réveil en un clic. */
  function sleepListDialog() {
    const asleep = windows.flatMap((win) => win.tabs).filter((tab) => tab.discarded);
    if (!asleep.length) { toast("Aucun onglet en veille."); return; }
    const items = asleep.map((tab) => `<div class="tl-merge-item">${faviconSleep(tab)}<span class="tl-merge-body"><span class="tl-merge-title">${esc(tab.title)}</span><span class="tl-merge-meta">${esc(tab.url)}</span></span><button type="button" class="btn btn-ghost btn-sm" data-action="wake" data-tab="${tab.id}">Réveiller</button></div>`).join("");
    showDialog("Onglets en veille", `<p class="tl-dialog-desc">Mémoire libérée, URL d'origine intacte : un clic sur l'onglet le recharge à l'identique, même sans l'extension.</p><div class="tl-merge-list">${items}</div><div class="tl-dialog-foot"><button type="button" class="btn btn-primary btn-sm" data-action="close-dialog">Fermer</button></div>`);
  }

  // « Enregistrer juste les sélectionnés » : seuls les onglets cochés de la
  // fenêtre en cours deviennent une session (fermeture optionnelle des
  // enregistrés ; les épinglés restent ouverts, comme partout ailleurs).
  function selectLiveDialog(windowId) {
    const win = windows.find((w) => w.id === windowId);
    if (!win) { toast("Fenêtre introuvable. Actualisez la section."); return; }
    const items = win.tabs.map((tab) => `<label class="tl-merge-item"><input type="checkbox" name="tab" value="${tab.id}"><span class="tl-merge-body"><span class="tl-merge-title">${esc(tab.title)}</span><span class="tl-merge-meta">${esc(domain(tab.url))}${tab.pinned ? " · épinglé" : ""}${tab.discarded ? " · en veille" : ""}</span></span></label>`).join("");
    showDialog("Enregistrer une sélection", `<p class="tl-dialog-desc">Seuls les onglets cochés de cette fenêtre deviennent une session.</p><form id="bss-select"><div class="tl-fields"><label class="tl-field">Nom (optionnel)<input name="title" maxlength="160" placeholder="Sélection du ${new Date().toLocaleDateString("fr-FR")}" autofocus></label></div><div class="tl-merge-list">${items}</div><div class="tl-dialog-foot"><button type="button" class="btn btn-ghost btn-sm" data-action="close-dialog">Annuler</button><button type="submit" class="btn btn-ghost btn-sm" name="mode" value="close">Enregistrer &amp; fermer</button><button type="submit" class="btn btn-primary btn-sm" name="mode" value="save">Enregistrer</button></div></form>`);
    document.getElementById("bss-select").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const tabIds = data.getAll("tab").map(Number);
      if (!tabIds.length) { toast("Cochez au moins un onglet."); return; }
      run(async () => {
        const result = await request("save", { windowId, tabIds,
          close: event.submitter?.value === "close", title: data.get("title") || undefined, tags: [] });
        closeDialog(); expanded.add(result.id); await refresh(); toast(result.message);
      });
    });
  }

  /* ----- interactions ----- */
  function onRootClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === "close-dialog") { closeDialog(); return; }
    if (action === "dismiss-resume") { localStorage.setItem("bss-resume-at", target.dataset.at); render(); return; }
    event.preventDefault?.();
    run(async () => {
      if (action === "expand" || action === "toggle") {
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        render(); return;
      }
      if (action === "highlight") { highlightId = highlightId === id ? null : id; render(); return; }
      if (action === "sleep-list") { sleepListDialog(); return; }
      if (action === "wake") {
        await request("focus", { id: Number(target.dataset.tab) });
        closeDialog(); await refresh(); toast("Onglet réveillé.");
        return;
      }
      if (action === "enlarge") {
        highlightId = id;
        render();
        const figure = root().querySelector(`.tl-session[data-session="${CSS.escape(id)}"] .tl-preview`);
        if (figure) setPreview(figure, target.dataset.url, target.dataset.title);
        return;
      }
      if (action === "edit") return editDialog(sessionById(id));
      if (action === "merge") return mergeDialog(sessionById(id));
      if (action === "rename-live") return renameLiveDialog(Number(id));
      if (action === "export") return exportDialog(sessionById(id));
      if (action === "export-live") return exportLiveDialog(Number(id));
      if (action === "select-live") return selectLiveDialog(Number(id));
      if (action === "merge-live") return mergeLiveDialog(Number(id));
      if (action === "dedupe-live") {
        const result = await request("dedupe-live", { windowId: Number(id) });
        await refresh(); toast(result.message, result.undo); return;
      }
      if (action === "note") return noteDialog(sessionById(id), target.dataset.pos);
      if (action === "focus") { await request("focus", { id: Number(target.dataset.tab) }); return; }
      if (action === "close-live") {
        const result = await request("close-tab", { tabId: Number(target.dataset.tab), expectedURL: target.dataset.url });
        await refresh(); toast(result.message, result.undo); return;
      }
      if (action === "remove-link") {
        const session = sessionById(id);
        const result = await request("remove-tab", { id, revision: session.updatedAt, position: target.dataset.pos, expectedURL: target.dataset.url });
        await refresh(); toast(result.message, result.undo); return;
      }
      if (action === "save-window" || action === "save-close") {
        const result = await request("save", { windowId: Number(id), close: action === "save-close" });
        expanded.add(result.id); await refresh(); toast(result.message); return;
      }
      if (action === "sleep-window") {
        const win = windows.find((w) => w.id === Number(id));
        const result = await request("sleep", { tabIds: win ? win.tabs.map((t) => t.id) : null });
        await refresh(); toast(result.message); return;
      }
      if (action === "copy-urls") {
        await navigator.clipboard.writeText(C().exportText(sessionById(id), "urls"));
        toast("URL copiées."); return;
      }
      if (action === "unarchive") {
        const result = await request("archive", { id, archived: false });
        await refresh(); toast(result.message); return;
      }
      if (action === "delete") {
        if (!confirm("Supprimer définitivement cette session archivée ? Les onglets actuellement ouverts ne sont pas touchés.")) return;
        const result = await request("delete", { id });
        await refresh(); toast(result.message); return;
      }
      if (action === "restore") {
        const target = sessionById(id);
        showBusyLabel(`Ouverture de ${C().tabCount(target)} onglets…`);
        let result;
        try { result = await request("restore", { id }); }
        finally { showBusyLabel(""); }
        await refresh();
        toast(result.message);
        return;
      }
      let result;
      if (["favorite", "archive", "dedupe"].includes(action)) {
        result = await request(action, { id });
      } else return;
      await refresh();
      if (action === "dedupe") revealSession(id);
      toast(result.message);
    });
  }
  const previewFromEvent = (event) => {
    const rowEl = event.target.closest(".tl-row");
    if (!rowEl) return;
    const block = rowEl.closest(".tl-session");
    const figure = rowEl.closest(".tl-body")?.querySelector(".tl-preview");
    if (!figure) return;
    // Repère de position dans les longues sessions : « 12 / 125 » pendant le survol.
    const badge = figure.querySelector(".tl-preview-count");
    if (badge) badge.textContent = `${[...block.querySelectorAll(".tl-row")].indexOf(rowEl) + 1} / ${sessionTotalFromId(block.dataset.session)}`;
    setPreview(figure, rowEl.dataset.url, rowEl.dataset.title);
  };

  /* ----- réglages (section Réglages de PK Web Memory) ----- */
  const DB_HANDLE_DB = "pk-web-memory-file-handles";
  const DB_HANDLE_STORE = "handles";
  const DB_HANDLE_KEY = "main-database";
  function openDatabaseHandleStore() {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_HANDLE_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(DB_HANDLE_STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }
  async function storedDatabaseHandle() {
    const db = await openDatabaseHandleStore();
    try {
      return await new Promise((resolve, reject) => {
        const get = db.transaction(DB_HANDLE_STORE, "readonly").objectStore(DB_HANDLE_STORE).get(DB_HANDLE_KEY);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => reject(get.error);
      });
    } finally { db.close(); }
  }
  async function showDatabaseStatus() {
    const status = document.getElementById("sessions-database-status");
    if (!status) return;
    try {
      const handle = await storedDatabaseHandle();
      if (!handle) { status.textContent = "Aucun fichier SQLite configuré."; return; }
      const permission = await handle.queryPermission({ mode: "readwrite" });
      status.textContent = permission === "granted"
        ? "Base SQLite connectée."
        : "Accès à renouveler : clique sur « Choisir l'emplacement ».";
    } catch { status.textContent = "Emplacement SQLite indisponible : choisis-le de nouveau."; }
  }
  async function chooseDatabaseLocation() {
    if (typeof showDirectoryPicker !== "function") throw new Error("Le sélecteur de dossiers n'est pas disponible dans cette version de Chrome.");
    const parent = await showDirectoryPicker({ mode: "readwrite" });
    const appFolder = await parent.getDirectoryHandle("PK Web Memory", { create: true });
    const file = await appFolder.getFileHandle("PK Web Memory.sqlite", { create: true });
    const permission = await file.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Chrome n'a pas accordé l'accès en écriture au fichier SQLite.");
    const db = await openDatabaseHandleStore();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_HANDLE_STORE, "readwrite");
        tx.objectStore(DB_HANDLE_STORE).put(file, DB_HANDLE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Impossible de mémoriser l'emplacement."));
      });
    } finally { db.close(); }
    const result = await request("database-backup");
    await showDatabaseStatus();
    await refresh();
    toast(result.message);
  }

  async function loadSessionSettings() {
    const data = await request("get").catch(() => null);
    if (!data) return;
    library = data.library; windows = data.windows;
    const uiSettings = (await chrome.storage.local.get("settings").catch(() => ({}))).settings || {};
    respirationMode = uiSettings.respirationMode === "suspend" ? "suspend" : "close";
    const autosave = document.getElementById("setting-sessions-autosave");
    const previews = document.getElementById("setting-sessions-previews");
    const sleep = document.getElementById("setting-sessions-sleep");
    const daily = document.getElementById("setting-sessions-daily");
    const dailyHour = document.getElementById("setting-sessions-daily-hour");
    const dailyClose = document.getElementById("setting-sessions-daily-close");
    const autoBackup = document.getElementById("setting-sessions-autobackup");
    const badge = document.getElementById("setting-badge");
    const badgeScope = document.getElementById("setting-badge-scope");
    const newtab = document.getElementById("setting-newtab");
    const rowThumbs = document.getElementById("setting-rows-thumbs");
    if (autosave) autosave.checked = data.library.settings.autosave;
    if (previews) previews.checked = data.library.settings.previews;
    if (sleep) sleep.value = String(data.library.settings.sleepMinutes);
    if (daily) daily.checked = data.library.settings.dailySave === true;
    if (dailyHour) dailyHour.value = String(data.library.settings.dailyHour ?? 7);
    if (dailyClose) dailyClose.checked = data.library.settings.dailyClose === true;
    if (autoBackup) autoBackup.checked = data.library.settings.autoBackup !== false;
    if (badge) badge.value = data.library.settings.badge || "tabs";
    if (badgeScope) badgeScope.value = data.library.settings.badgeScope === "all" ? "all" : "tour";
    if (newtab) newtab.value = data.library.settings.newtab || "sessions";
    if (rowThumbs) rowThumbs.value = { both: "full" }[data.library.settings.rowThumbs] || data.library.settings.rowThumbs || "full";
    const dailyExport = document.getElementById("setting-sessions-daily-export");
    if (dailyExport) dailyExport.checked = data.library.settings.dailyExport === true;
    await showDatabaseStatus();
    renderSessionsHint();
  }
  function bindSessionSettings() {
    const autosave = document.getElementById("setting-sessions-autosave");
    const previews = document.getElementById("setting-sessions-previews");
    const sleep = document.getElementById("setting-sessions-sleep");
    const daily = document.getElementById("setting-sessions-daily");
    const dailyHour = document.getElementById("setting-sessions-daily-hour");
    const dailyClose = document.getElementById("setting-sessions-daily-close");
    const autoBackup = document.getElementById("setting-sessions-autobackup");
    const badge = document.getElementById("setting-badge");
    const badgeScope = document.getElementById("setting-badge-scope");
    const newtab = document.getElementById("setting-newtab");
    const rowThumbs = document.getElementById("setting-rows-thumbs");
    const dailyExport = document.getElementById("setting-sessions-daily-export");
    if (!autosave || !previews || !sleep || !daily || !dailyHour || !dailyClose || !dailyExport || !autoBackup || !badge || !badgeScope || !newtab || !rowThumbs) return;
    const push = () => run(async () => {
      const result = await request("settings", { settings: {
        autosave: autosave.checked, previews: previews.checked, sleepMinutes: Number(sleep.value),
        dailySave: daily.checked, dailyHour: Number(dailyHour.value), dailyClose: dailyClose.checked,
        dailyExport: dailyExport.checked, autoBackup: autoBackup.checked,
        badge: badge.value, badgeScope: badgeScope.value, newtab: newtab.value, rowThumbs: rowThumbs.value,
      } });
      toast(result.message);
      refresh().catch(() => {});
    });
    autosave.addEventListener("change", push);
    previews.addEventListener("change", push);
    sleep.addEventListener("change", push);
    daily.addEventListener("change", push);
    dailyExport.addEventListener("change", push);
    autoBackup.addEventListener("change", push);
    dailyHour.addEventListener("change", push);
    dailyClose.addEventListener("change", push);
    badge.addEventListener("change", push);
    badgeScope.addEventListener("change", push);
    newtab.addEventListener("change", push);
    rowThumbs.addEventListener("change", push);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    const el = root();
    el.addEventListener("click", onRootClick);
    document.getElementById("btn-sessions-database-location")?.addEventListener("click", () => run(chooseDatabaseLocation));
    // Récupération après accident : les fenêtres/onglets que Chrome garde en
    // « récemment fermés » deviennent une session, et une sauvegarde fichier
    // d'exports JSON de sessions ; la base SQLite se reconnecte via les réglages.
    document.getElementById("btn-sessions-recover")?.addEventListener("click", () => run(async () => {
      const result = await request("recover-closed");
      expanded.add(result.id);
      await refresh();
      toast(result.message);
      revealSession(result.id);
    }));
    const importButton = document.getElementById("btn-sessions-import");
    if (importButton && !importButton.dataset.wired) {
      importButton.dataset.wired = "1";
      const input = Object.assign(document.createElement("input"),
        { type: "file", accept: ".json,application/json", hidden: true });
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        run(async () => {
          let backup;
          try { backup = JSON.parse(await file.text()); }
          catch { toast("Ce fichier n’est pas un JSON valide."); return; }
          const result = await request("import", { backup });
          await refresh();
          toast(result.message);
        });
      });
      importButton.after(input);
      importButton.addEventListener("click", () => input.click());
    }
    PKPagePreview.bind({ previewSource, fallbackThumb });
    el.addEventListener("mouseover", previewFromEvent);
    el.addEventListener("focusin", previewFromEvent);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && highlightId && !document.getElementById("bss-dialog")?.open
        && !document.getElementById("section-sessions").classList.contains("hidden")) {
        highlightId = null; render();
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes["bs.sessions.library"] || changes["bs.sessions.previews"] || changes["bs.respiration"]) scheduleRefresh();
      if (changes["bs.sessions.previews"] || changes["bs.sessions.library"]) previewCache.clear();
      if (changes.settings) {
        thumbsMode = changes.settings.newValue?.thumbsMode || "mshots";
        respirationMode = changes.settings.newValue?.respirationMode === "suspend" ? "suspend" : "close";
        previewCache.clear();
        scheduleRefresh();
      }
    });
    for (const name of ["onCreated", "onRemoved", "onUpdated", "onMoved", "onAttached", "onDetached", "onActivated"]) {
      chrome.tabs[name]?.addListener?.(scheduleRefresh);
    }
    chrome.windows.onFocusChanged?.addListener?.(scheduleRefresh);
    // Filet de sécurité : si un rafraîchissement a été perdu (action longue,
    // service worker endormi…), compteur et timeline se corrigent seuls.
    setInterval(() => {
      if (busy || document.visibilityState !== "visible") return;
      if (document.getElementById("section-sessions")?.classList.contains("hidden")) return;
      run(async () => refresh().catch(() => {})); // silencieux : simple filet de sécurité
    }, 10000);
    chrome.storage.local.get("settings").then((stored) => {
      if (stored?.settings?.thumbsMode) thumbsMode = stored.settings.thumbsMode;
    }).catch(() => {});
    showSkeleton();
    // Un premier « get » qui échoue (service worker en cours de démarrage,
    // extension rechargée…) ne doit pas laisser un écran muet : le filet et
    // les événements retentent, et un bouton permet de recharger tout de suite.
    const bootNotice = setTimeout(() => showBootError("le service worker ne répond pas."), 5000);
    try {
      await refresh();
    } catch (error) {
      scheduleRefresh();
      showBootError(error.message);
    } finally {
      clearTimeout(bootNotice);
    }
  }

  bindSessionSettings();
  document.getElementById("respiration-root")?.addEventListener("click", onRespirationClick);
  loadSessionSettings();
  window.BSSessions = { init };
})();
