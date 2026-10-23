/* Rail favicon en surcouche des pages — frame principale uniquement.
   Pourquoi ici : le panneau latéral natif de Chrome a une largeur minimale
   (~300 px) qu'aucune API ne peut abaisser ; ce rail de 38 px vit donc dans
   les pages, en position fixe sur le bord de la fenêtre, côté au choix.

   Données : lecture directe de bs.respiration et des préférences locales
   (chrome.storage est accessible aux content scripts, aucun aller-retour
   inutile). L'onglet actif se déduit de location.href + visibilityState :
   le rail visible est toujours celui de l'onglet actif, nul besoin d'un
   push du worker. Les actions (échange LRU, aperçu, panneau) passent par
   le worker, avec les mêmes garde-fous que le raccourci ⌘⌥W. */
"use strict";
(() => {
  if (window !== window.top) return;
  const QUEUE_KEY = "bs.respiration";
  // Une seule largeur pilote tout : le fond du rail, le décalage de la page
  // et l'écart des cartes (toast, vignette). Le fond ne doit pas dépasser la
  // colonne de favicons d'un tiers de sa largeur.
  const RAIL_W = 30, CARD_GAP = 6;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const LABELS = { open: "Ouverts", pending: "À revenir" };

  let queue = null, prefs = { railSide: "left", railOn: false, thumbsMode: "mshots" }, toastTimer = 0, previewTimer = 0, previewCard = null, savedShift = null, fullscreen = false;
  let windowType = null, contextTried = false, appWindow = false;

  /* Le rail pousse la page au lieu de la recouvrir (façon Arc) : html est
     décalé et rétréci de la largeur du rail. Le transform crée un bloc
     conteneur : les éléments position:fixed suivent le décalage au lieu de
     rester collés au bord. Passé par le CSSOM (setProperty), insensible aux
     CSP ; les valeurs d'origine sont restaurées à l'arrêt. */
  function applyShift(active) {
    const el = document.documentElement;
    if (active) {
      if (!savedShift) savedShift = { transform: el.style.getPropertyValue("transform"), marginRight: el.style.getPropertyValue("margin-right") };
      el.style.setProperty("transform", prefs.railSide === "right" ? "translateZ(0)" : `translateX(${RAIL_W}px)`, "important");
      el.style.setProperty("margin-right", `${RAIL_W}px`, "important");
    } else if (savedShift) {
      for (const [prop, value] of Object.entries(savedShift)) {
        if (value) el.style.setProperty(prop, value);
        else el.style.removeProperty(prop);
      }
      savedShift = null;
    }
  }

  const host = document.createElement("div");
  host.id = "pk-web-memory-rail";
  host.setAttribute("popover", "manual"); // couche supérieure : ancré au viewport,
  host.setAttribute("aria-label", "Réserve Respiration"); // insensible au transform de html
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :host { all: initial; position: fixed; top: 0; bottom: 0; width: ${RAIL_W}px; z-index: 2147483646; pointer-events: none; }
  :host([hidden]) { display: none; }
  /* Fermé = aucun rendu (le all:initial de :host battrait sinon le
     display:none de l'UA pour les popovers fermés). */
  :host(:not(:popover-open)) { display: none; }
  :host([data-side="right"]) { right: 0; }
  :host(:not([data-side="right"])) { left: 0; }
  .rail { pointer-events: auto; height: 100%; display: flex; flex-direction: column; align-items: center;
    padding: 4px 0; background: rgba(255, 255, 255, .96); border-right: 1px solid #e4e4e7;
    font: 400 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; }
  :host([data-side="right"]) .rail { border-right: 0; border-left: 1px solid #e4e4e7; }
  /* En-tête et pied fixes : les deux commandes restent joignables même avec
     une réserve de plusieurs centaines de pages. Seule la liste défile. */
  .ctl { flex: none; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 3px 0; }
  .ctl.top { border-bottom: 1px solid #e4e4e7; }
  .ctl.bottom { border-top: 1px solid #e4e4e7; }
  .list { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; align-items: center;
    gap: 2px; padding: 4px 0; overflow-y: auto; scrollbar-width: none; }
  .list::-webkit-scrollbar { display: none; }
  .i { position: relative; flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
    border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
  .i:hover { background: #f4f4f5; }
  .i:focus-visible { outline: 2px solid #18181b; outline-offset: -2px; }
  .i img { width: 18px; height: 18px; }
  .i .g { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: #f4f4f5; color: #71717a; font-size: 10px; font-weight: 700; }
  .i[aria-current] { background: #f4f4f5; box-shadow: inset 2px 0 #18181b; }
  :host([data-side="right"]) .i[aria-current] { box-shadow: inset -2px 0 #18181b; }
  .i[data-media]::after { content: ""; position: absolute; top: 2px; right: 2px; width: 5px; height: 5px; border-radius: 50%; background: #16a34a; }
  .pending .i { opacity: .55; }
  .sep { flex: none; width: 16px; height: 1px; margin: 4px 0; background: #e4e4e7; }
  .flip, .panel, .fs { flex: none; display: grid; place-items: center; width: 22px; height: 22px; padding: 0;
    border: 0; border-radius: 5px; background: transparent; color: #71717a; cursor: pointer; font-size: 11px; }
  .flip:hover, .panel:hover, .fs:hover { background: #f4f4f5; color: #18181b; }
  .t { position: absolute; bottom: 40px; left: ${RAIL_W + CARD_GAP}px; width: 190px;
    padding: 7px 9px; border-radius: 7px; background: #18181b; color: #fafafa; font-size: 11px; text-align: left;
    white-space: normal; word-break: break-word; }
  :host([data-side="right"]) .t { left: auto; right: ${RAIL_W + CARD_GAP}px; }
  .pv { position: fixed; left: ${RAIL_W + CARD_GAP}px; width: 240px; border: 1px solid #e4e4e7; border-radius: 9px; background: #fff; color: #18181b;
    overflow: hidden; box-shadow: 0 8px 28px #0003; z-index: 2; }
  :host([data-side="right"]) .pv { left: auto; right: ${RAIL_W + CARD_GAP}px; }
  .pv .shot { aspect-ratio: 1.6; display: grid; place-items: center; background: #f4f4f5; color: #71717a; font-size: 10px; overflow: hidden; }
  .pv .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .pv .cap { padding: 8px 10px; display: grid; gap: 3px; }
  .pv .cap strong { font-size: 11.5px; font-weight: 600; overflow-wrap: anywhere; }
  .pv .cap span { font: 400 10px/1.4 ui-monospace, monospace; color: #71717a; overflow-wrap: anywhere; }
  @media print { :host { display: none; } }
  @media (prefers-color-scheme: dark) {
    .rail { background: rgba(24, 24, 27, .96); border-color: #3f3f46; color: #fafafa; }
    .i:hover, .i[aria-current] { background: #27272a; }
    .i .g { background: #27272a; color: #a1a1aa; }
    .i[aria-current] { box-shadow: inset 2px 0 #fafafa; }
    :host([data-side="right"]) .i[aria-current] { box-shadow: inset -2px 0 #fafafa; }
    .sep, .ctl.top, .ctl.bottom { border-color: #3f3f46; }
    .sep { background: #3f3f46; }
    .flip:hover, .panel:hover, .fs:hover { background: #27272a; color: #fafafa; }
    .t { background: #fafafa; color: #18181b; }
    .pv { background: #18181b; border-color: #3f3f46; color: #fafafa; }
    .pv .shot { background: #27272a; color: #a1a1aa; }
    .pv .cap span { color: #a1a1aa; }
  }
</style>
<nav class="rail" role="complementary" aria-label="Réserve Respiration">
  <div class="ctl top"></div>
  <div class="list"></div>
  <div class="ctl bottom"></div>
</nav>`;
  const nav = root.querySelector(".rail");
  const list = root.querySelector(".list");

  const send = async (type, payload) => {
    try {
      const result = await chrome.runtime.sendMessage({ type, payload });
      if (!result?.ok) throw new Error(result?.error || "Rechargez la page après une mise à jour de l’extension.");
      return result.data;
    } catch (error) { toast(error.message); return null; }
  };
  function toast(text) {
    root.querySelector(".t")?.remove();
    clearTimeout(toastTimer);
    const card = document.createElement("p");
    card.className = "t";
    card.textContent = text;
    nav.after(card);
    toastTimer = setTimeout(() => card.remove(), 3200);
  }
  function icon(entry, state) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "i";
    item.dataset.id = entry.id;
    item.setAttribute("aria-label", `${entry.title || entry.url} — ${LABELS[state]}${entry.keepReason === "media" ? " — Lecture en cours" : ""}`);
    item.title = entry.title || entry.url;
    if (state === "open" && entry.url === location.href && document.visibilityState === "visible") item.setAttribute("aria-current", "true");
    if (entry.keepReason === "media") item.dataset.media = "";
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.src = `${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(entry.url)}&size=32`;
    img.onerror = () => {
      const letter = document.createElement("span");
      letter.className = "g";
      try { letter.textContent = (new URL(entry.url).hostname || "?").replace(/^www\./, "")[0]?.toUpperCase() || "?"; }
      catch { letter.textContent = "?"; }
      img.replaceWith(letter);
    };
    item.append(img);
    return item;
  }
  function render() {
    // Les fenêtres sans onglets Chrome (PWA installée, popup) ne peuvent pas
    // porter la tournée : le rail n'y pilote rien. `railPwa` permet de passer
    // outre pour ceux qui veulent quand même la réserve sous la main.
    host.dataset.windowType = windowType || "";
    host.dataset.appWindow = String(appWindow);
    const active = queue && !queue.stopped && prefs.railOn === true && !document.fullscreenElement
      && (!appWindow || prefs.railPwa === true);
    try {
      if (active && !host.matches(":popover-open")) host.showPopover();
      else if (!active && host.matches(":popover-open")) host.hidePopover();
    } catch { /* popover indisponible : le rail reste affiché par le CSS */ }
    applyShift(active); // la page est poussée tant que le rail est visible
    if (!active) return;
    host.dataset.side = prefs.railSide === "right" ? "right" : "left";
    const scroll = list.scrollTop; // un rafraîchissement ne renvoie pas en haut
    list.replaceChildren();
    const groups = { open: [], pending: [] };
    for (const e of queue.entries) if (e.state in groups) groups[e.state].push(e);
    for (const e of groups.open.slice().reverse()) list.append(icon(e, "open"));
    if (groups.pending.length) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.title = `À revenir · ${groups.pending.length}`;
      const pending = document.createElement("div");
      pending.className = "pending";
      pending.style.display = "flex";
      pending.style.flexDirection = "column";
      pending.style.gap = "2px";
      // Toute la réserve est affichée : la liste défile, rien n'est remplacé
      // par un « … » qui renvoyait au panneau.
      for (const e of groups.pending.slice().reverse()) pending.append(icon(e, "pending"));
      list.append(sep, pending);
    }
    // Le sens du rail est en tête, le panneau en pied : les deux commandes
    // restent visibles sans faire défiler des centaines de favicônes.
    const flip = document.createElement("button");
    flip.type = "button";
    flip.className = "flip";
    flip.dataset.flip = "";
    flip.textContent = "⇄";
    flip.title = `Déplacer le rail à ${prefs.railSide === "right" ? "gauche" : "droite"}`;
    flip.setAttribute("aria-label", flip.title);
    // Plein écran : Chrome n'expose aucune API pour masquer seulement sa barre
    // d'onglets ; le plein écran efface toute l'interface du navigateur et
    // laisse le rail dans la page. Le bouton inverse la bascule.
    const fs = document.createElement("button");
    fs.type = "button";
    fs.className = "fs";
    fs.dataset.fullscreen = "";
    fs.textContent = "⛶";
    fs.title = fullscreen ? "Quitter le plein écran (barre Chrome rétablie)" : "Masquer la barre de Chrome (plein écran)";
    fs.setAttribute("aria-label", fs.title);
    root.querySelector(".ctl.top").replaceChildren(flip, fs);
    const panel = document.createElement("button");
    panel.type = "button";
    panel.className = "panel";
    panel.dataset.panel = "";
    panel.textContent = "☰";
    panel.title = "Ouvrir le panneau latéral";
    panel.setAttribute("aria-label", panel.title);
    root.querySelector(".ctl.bottom").replaceChildren(panel);
    if (scroll) list.scrollTop = scroll;
  }

  async function pull() {
    const stored = await chrome.storage.local.get([QUEUE_KEY, "settings"]);
    queue = stored[QUEUE_KEY] || null;
    Object.assign(prefs, stored.settings || {});
    // Type de fenêtre fourni par le worker (une fois par page) : une PWA
    // installée est de type « app », un popup « popup ». `display-mode` sert
    // de repli immédiat, y compris si le worker n'a pas encore répondu.
    if (!contextTried) {
      contextTried = true;
      try {
        const context = await chrome.runtime.sendMessage({ type: "rail-context" });
        if (context?.ok) windowType = context.data?.type || null;
      } catch { /* repli display-mode */ }
    }
    appWindow = (windowType && windowType !== "normal") || !matchMedia("(display-mode: browser)").matches;
    render();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[QUEUE_KEY] || changes.settings)) pull();
  });
  document.addEventListener("visibilitychange", render);
  document.addEventListener("fullscreenchange", render);
  window.addEventListener("pageshow", pull);
  // L'impression ne doit ni montrer le rail ni garder la page décalée.
  window.addEventListener("beforeprint", () => {
    applyShift(false);
    try { if (host.matches(":popover-open")) host.hidePopover(); } catch { host.toggleAttribute("hidden", true); }
  });
  window.addEventListener("afterprint", render);

  // Le host entre dans la page une fois pour toutes : render() ne gère que
  // la visibilité ([hidden]) et le contenu. document_idle garantit le body.
  (document.body || document.documentElement).append(host);

  nav.addEventListener("click", async (event) => {
    const pick = event.target.closest("[data-id]");
    if (pick) {
      const data = await send("respiration-rail-select", { id: pick.dataset.id });
      if (data?.message) toast(data.message);
      return;
    }
    if (event.target.closest("[data-flip]")) {
      const current = (await chrome.storage.local.get("settings")).settings || {};
      const side = (current.railSide || prefs.railSide) === "right" ? "left" : "right";
      await chrome.storage.local.set({ settings: { ...current, railSide: side } }); // onChanged propage à tous les rails
      return;
    }
    if (event.target.closest("[data-fullscreen]")) {
      const data = await send("rail-fullscreen");
      if (data?.fullscreen != null) {
        fullscreen = data.fullscreen;
        render();
        if (fullscreen) toast("Barre de Chrome masquée. ⛶ ou F11 pour revenir.");
      }
      return;
    }
    // Le ☰ ouvre le panneau natif. En cas de refus de Chrome, send() affiche
    // déjà l'explication ; pas de toast de succès qui masquerait la page.
    if (event.target.closest("[data-panel]")) await send("rail-panel-open");
  });

  /* Aperçu au survol : capture locale si elle existe, service de miniatures
     si ce réglage est actif, sinon titre seul. Aucun onglet n'est réveillé. */
  const hidePreview = () => { clearTimeout(previewTimer); previewCard?.remove(); previewCard = null; };
  nav.addEventListener("mouseout", (event) => { if (!nav.contains(event.relatedTarget)) hidePreview(); });
  nav.addEventListener("mouseover", async (event) => {
    const pick = event.target.closest("[data-id]");
    if (!pick || previewCard?.dataset.id === pick.dataset.id) return;
    hidePreview();
    const entry = queue?.entries.find((e) => e.id === pick.dataset.id);
    if (!entry) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const card = document.createElement("div");
      card.className = "pv";
      card.dataset.id = entry.id;
      const shot = document.createElement("div");
      shot.className = "shot";
      shot.textContent = "Vignette…";
      const cap = document.createElement("div");
      cap.className = "cap";
      const strong = document.createElement("strong");
      strong.textContent = entry.title || entry.url;
      const span = document.createElement("span");
      span.textContent = entry.url;
      cap.append(strong, span);
      card.append(shot, cap);
      root.append(card);
      previewCard = card;
      const rect = pick.getBoundingClientRect();
      card.style.top = `${Math.max(8, Math.min(rect.top - 40, innerHeight - 260))}px`; // le côté vient du CSS (44 px du bord)
      const data = await chrome.runtime.sendMessage({ type: "rail-preview", payload: { url: entry.url } }).catch(() => null);
      const src = data?.ok ? data.data.src : null;
      const fallback = prefs.thumbsMode === "mshots" && !src
        ? `https://s0.wp.com/mshots/v1/${encodeURIComponent(entry.url)}?w=400&h=300` : src;
      if (!fallback) { shot.textContent = "Vignette indisponible"; return; }
      const img = new Image();
      img.alt = `Aperçu de ${entry.title || entry.url}`;
      img.onload = () => { if (previewCard === card) shot.replaceChildren(img); };
      img.onerror = () => { if (previewCard === card) shot.textContent = "Vignette indisponible"; };
      img.src = fallback;
    }, 260);
  });
  nav.addEventListener("focusout", hidePreview);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hidePreview(); });

  pull();
})();
