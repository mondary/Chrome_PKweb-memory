/* Section Sessions — timeline fusionnée de src3 : session en cours toujours
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
    save: '<path d="M12 3v10m-4-4 4 4 4-4M4 12v8h16v-8"/>',
  };
  const icon = (name, size = 16) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.layers}</svg>`;

  let initialized = false;
  let library = null;
  let windows = [];
  let highlightId = null;
  let busy = false;
  let lastUndo = null;
  let liveTimer = 0;
  const expanded = new Set();
  const previewCache = new Map();
  let thumbsMode = "mshots";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const root = () => document.getElementById("sessions-root");

  async function request(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) throw new Error(response?.error || "Le service worker ne répond pas. Rechargez l’extension.");
    return response.data;
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
  const faviconImg = (tab) => `<img class="tl-fav" src="${esc(`${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(tab.url)}&size=32`)}" alt="" loading="lazy">`;

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

  function row(tab, { live = false, sessionId = "", pos = "" } = {}) {
    const thumb = `<button type="button" class="tl-thumb" data-action="enlarge" data-id="${esc(sessionId)}" data-url="${esc(tab.url)}" data-title="${esc(tab.title)}" aria-label="Agrandir la capture de ${esc(tab.title)}" title="Agrandir la capture"><img alt="" loading="lazy"></button>`;
    const link = live
      ? `<button type="button" class="tl-link" data-action="focus" data-tab="${tab.id}" data-url="${esc(tab.url)}" title="${esc(tab.url)}">${faviconImg(tab)}<span class="tl-truncate">${esc(tab.title)}</span></button>`
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

  // Mosaïque de favicons façon ancien mode : rappel visuel immédiat du
  // contenu d'une session archivée, sans même ouvrir son détail.
  function faviconMosaic(tabs) {
    const shown = tabs.slice(0, 12);
    const rest = tabs.length - shown.length;
    return `<div class="tl-mosaic" aria-hidden="true">${shown.map((tab) => faviconImg(tab)).join("")}${rest > 0 ? `<span class="tl-mosaic-more">+${rest}</span>` : ""}</div>`;
  }

  function sessionBlock(session, { live = false, archived = false } = {}) {
    const tabs = C().allTabs(session);
    const isOpen = live || expanded.has(session.id) || highlightId === session.id;
    const actions = live
      ? `<button type="button" class="tl-tool" data-action="rename-live" data-id="${session.windows[0].id}" title="Nommer cette session et l’enregistrer">${icon("edit", 13)} Renommer</button><button type="button" class="btn btn-ghost btn-sm" data-action="select-live" data-id="${session.windows[0].id}" title="Enregistrer uniquement les onglets cochés">${icon("check", 13)} Sélection…</button><button type="button" class="btn btn-ghost btn-sm" data-action="sleep-window" data-id="${session.windows[0].id}">${icon("moon", 13)} Veille</button><button type="button" class="btn btn-ghost btn-sm" data-action="merge-live" data-id="${session.windows[0].id}" title="Ouvrir les onglets d’anciennes sessions dans cette fenêtre">${icon("layers", 13)} Fusionner…</button><button type="button" class="btn btn-ghost btn-sm" data-action="export-live" data-id="${session.windows[0].id}" title="Copier ou télécharger ces onglets (URL, titres, Markdown, HTML, CSV, JSON)">${icon("copy", 13)} Exporter…</button><button type="button" class="btn btn-ghost btn-sm" data-action="save-window" data-id="${session.windows[0].id}">${icon("save", 13)} Enregistrer</button><button type="button" class="btn btn-primary btn-sm" data-action="save-close" data-id="${session.windows[0].id}">${icon("save", 13)} Enregistrer &amp; fermer</button>`
      : archived
        ? `<button type="button" class="tl-tool" data-action="edit" data-id="${esc(session.id)}">${icon("edit", 13)} Modifier</button><button type="button" class="btn btn-ghost btn-sm" data-action="restore" data-id="${esc(session.id)}" title="Ouvrir tous les onglets dans une nouvelle fenêtre">${icon("open", 13)} Tout rouvrir</button><button type="button" class="btn btn-primary btn-sm" data-action="unarchive" data-id="${esc(session.id)}" title="Remettre cette session dans la timeline">${icon("archive", 13)} Restaurer</button>`
        : `<button type="button" class="tl-tool" data-action="favorite" data-id="${esc(session.id)}" aria-pressed="${session.favorite}" aria-label="${session.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}" title="${session.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("star", 13)}</button><button type="button" class="tl-tool" data-action="edit" data-id="${esc(session.id)}">${icon("edit", 13)} Modifier</button><button type="button" class="btn btn-ghost btn-sm" data-action="restore" data-id="${esc(session.id)}">${icon("open", 13)} Tout rouvrir</button>`;
    // Outils disponibles même repliés : inutile de déplier « Afficher les N onglets »
    // pour dédoublonner, fusionner, copier ou archiver.
    const tools = !live
      ? `<div class="tl-tools"><button type="button" data-action="dedupe" data-id="${esc(session.id)}">Retirer les doublons</button><button type="button" data-action="merge" data-id="${esc(session.id)}">${icon("layers", 12)} Fusionner…</button><button type="button" data-action="copy-urls" data-id="${esc(session.id)}">Copier les URL</button><button type="button" data-action="export" data-id="${esc(session.id)}">${icon("copy", 12)} Exporter…</button><button type="button" data-action="archive" data-id="${esc(session.id)}">${icon("archive", 12)} Archiver</button></div>` : "";
    const info = live
      ? `<p class="tl-info">${session.ignored ? `${session.ignored} page(s) interne(s) exclue(s)` : "Session en cours"} · ${tabs.filter((tab) => tab.discarded).length} en veille${session.focused ? " · fenêtre active" : ""}</p>` : "";
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

  // Ligne d'une session archivée : restaurer, rouvrir ou supprimer définitivement.
  function archiveRow(session) {
    return `<div class="tl-archive-row"><span class="tl-archive-title" title="${esc(session.title)}">${esc(session.title)}</span><span class="tl-archive-meta">${C().tabCount(session)} onglet(s) · ${esc(dateLabel(session.createdAt))}</span><span class="tl-archive-actions"><button type="button" class="tl-tool" data-action="unarchive" data-id="${esc(session.id)}" title="Remettre cette session dans la timeline">${icon("open", 12)} Restaurer</button><button type="button" class="tl-tool" data-action="restore" data-id="${esc(session.id)}">${icon("layers", 12)} Tout rouvrir</button><button type="button" class="tl-tool" data-action="delete" data-id="${esc(session.id)}" title="Supprimer définitivement cette session archivée">${icon("close", 12)} Supprimer</button></span></div>`;
  }

  function render() {
    const core = C();
    if (!library || !root()) return;
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
      const open = expanded.has("archives");
      html += `<h2 class="tl-day"><button type="button" class="tl-archives-toggle" data-action="toggle" data-id="archives" aria-expanded="${open}">${icon("archive", 11)}<span>Archives</span>${icon("chevron", 11)}</button><span class="tl-rule"></span><span class="tl-total">${archivedSessions.length} session${archivedSessions.length > 1 ? "s" : ""}</span></h2>`;
      if (open) html += `<div class="tl-archives">${archivedSessions.map(archiveRow).join("")}</div>`;
    }
    root().innerHTML = html || `<p class="tl-empty">Rien d’enregistré pour l’instant. Vos fenêtres ouvertes et vos prochaines sessions apparaîtront ici.</p>`;
    const count = document.getElementById("sessions-count");
    if (count) {
      const webTabs = liveWindows.reduce((n, w) => n + C().tabCount(w), 0);
      const internal = liveWindows.reduce((n, w) => n + (w.ignored || 0), 0);
      count.textContent = `${sessions.length} session${sessions.length > 1 ? "s" : ""} · ${webTabs} onglet(s) ouvert(s)${internal ? ` + ${internal} page(s) interne(s)` : ""}`;
    }
    // Largeur élargie dès qu’il y a une session en cours (aperçu permanent
    // en grand) ou une session ouverte en vue élargie.
    root().closest("main")?.classList.toggle("tl-wide", !!highlightId || liveWindows.length > 0);
    root().classList.toggle("tl-nothumbs", library.settings.previews === false);
    for (const figure of root().querySelectorAll(".tl-preview")) {
      const block = figure.closest(".tl-session");
      const first = block.querySelector(".tl-row[data-active], .tl-row");
      const total = sessionTotalFromId(block.dataset.session);
      figure.append(Object.assign(document.createElement("span"), { className: "tl-preview-count", textContent: `${total} onglet${total > 1 ? "s" : ""}` }));
      if (first) setPreview(figure, first.dataset.url, first.dataset.title);
    }
    fillThumbs();
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

  let lastSignature = "";
  async function refresh() {
    const result = await request("get");
    library = result.library; windows = result.windows;
    // Rendu seulement si l'état a réellement changé : les événements d'onglets
    // sont fréquents et reconstruire la timeline casserait survols et miniatures.
    const signature = JSON.stringify([
      library.settings,
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
      d.addEventListener("close", () => { if (dialogTrigger?.isConnected) dialogTrigger.focus(); });
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
    d.innerHTML = `<div class="tl-dialog-head"><h2 tabindex="-1">${esc(title)}</h2><button type="button" class="tl-tool" data-action="close-dialog" aria-label="Fermer" title="Fermer">${icon("close", 14)}</button></div>${content}`;
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
      let result;
      if (["favorite", "archive", "restore", "dedupe"].includes(action)) {
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

  /* ----- réglages (section Réglages de Favoris) ----- */
  async function loadSessionSettings() {
    const data = await request("get").catch(() => null);
    if (!data) return;
    library = data.library; windows = data.windows;
    const autosave = document.getElementById("setting-sessions-autosave");
    const previews = document.getElementById("setting-sessions-previews");
    const sleep = document.getElementById("setting-sessions-sleep");
    const daily = document.getElementById("setting-sessions-daily");
    const dailyHour = document.getElementById("setting-sessions-daily-hour");
    const dailyClose = document.getElementById("setting-sessions-daily-close");
    const badge = document.getElementById("setting-badge");
    if (autosave) autosave.checked = data.library.settings.autosave;
    if (previews) previews.checked = data.library.settings.previews;
    if (sleep) sleep.value = String(data.library.settings.sleepMinutes);
    if (daily) daily.checked = data.library.settings.dailySave === true;
    if (dailyHour) dailyHour.value = String(data.library.settings.dailyHour ?? 7);
    if (dailyClose) dailyClose.checked = data.library.settings.dailyClose === true;
    if (badge) badge.value = data.library.settings.badge || "tabs";
  }
  function bindSessionSettings() {
    const autosave = document.getElementById("setting-sessions-autosave");
    const previews = document.getElementById("setting-sessions-previews");
    const sleep = document.getElementById("setting-sessions-sleep");
    const daily = document.getElementById("setting-sessions-daily");
    const dailyHour = document.getElementById("setting-sessions-daily-hour");
    const dailyClose = document.getElementById("setting-sessions-daily-close");
    const badge = document.getElementById("setting-badge");
    if (!autosave || !previews || !sleep || !daily || !dailyHour || !dailyClose || !badge) return;
    const push = () => run(async () => {
      const result = await request("settings", { settings: {
        autosave: autosave.checked, previews: previews.checked, sleepMinutes: Number(sleep.value),
        dailySave: daily.checked, dailyHour: Number(dailyHour.value), dailyClose: dailyClose.checked,
        badge: badge.value,
      } });
      toast(result.message);
      refresh().catch(() => {});
    });
    autosave.addEventListener("change", push);
    previews.addEventListener("change", push);
    sleep.addEventListener("change", push);
    daily.addEventListener("change", push);
    dailyHour.addEventListener("change", push);
    dailyClose.addEventListener("change", push);
    badge.addEventListener("change", push);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    const el = root();
    el.addEventListener("click", onRootClick);
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
      if (changes["bs.sessions.library"] || changes["bs.sessions.previews"]) scheduleRefresh();
      if (changes.settings) {
        thumbsMode = changes.settings.newValue?.thumbsMode || "mshots";
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
    await refresh();
  }

  bindSessionSettings();
  loadSessionSettings();
  window.BSSessions = { init };
})();
