/* PK Web Memory — terrain de jeu (store4) : reconstitution du tableau de bord.
   Simulation locale : favoris/visites/onglets fictifs, aucune API chrome.*,
   aucun stockage. Les miniatures et favicônes sont réelles et chargées via
   les mêmes services que l'extension (WordPress mshots, Google S2) pour les
   URL publiques de la démo — avec repli local si le service ne répond pas.
   Les interactions principales sont rejouées : palette ⌘K, inventaire,
   galerie, doublons + quarantaine, sessions, historique (tuiles, calendrier
   heatmap, navigation par jour), instantanés. DOM + textContent uniquement :
   aucune donnée interpolée en HTML. */
(() => {
  "use strict";

  /* ---------- services identiques à l'extension ---------- */
  const S2 = (url, size = 64) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(url))}&sz=${size}`;
  const MSHOTS = (url) => `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=400&h=300`;

  /* ---------- jeu de données fictif (URL publiques réelles) ---------- */
  const DAY = 86400000;
  const dayLabel = (offset) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(Date.now() - offset * DAY));
  const hist = (offset, time, title, url) => ({ id: `h${offset}-${time}`, title, url, offset, time, day: dayLabel(offset) });
  const DATA = () => {
  const TAB_POOL = [
    ["MDN — Guide JavaScript", "https://developer.mozilla.org/fr/docs/Web/JavaScript"],
    ["GitHub — Pull requests", "https://github.com/pulls"],
    ["Figma — Fichier de maquette", "https://www.figma.com/files"],
    ["Hacker News", "https://news.ycombinator.com/"],
    ["web.dev — Core Web Vitals", "https://web.dev/vitals/"],
    ["Can I Use", "https://caniuse.com/"],
    ["Wikipédia — Article du jour", "https://fr.wikipedia.org/"],
    ["Our World in Data", "https://ourworldindata.org/"],
    ["Excalidraw — Schéma", "https://excalidraw.com/"],
    ["Stack Overflow — Question", "https://stackoverflow.com/"],
    ["Notion — Notes de veille", "https://www.notion.so/"],
    ["Linear — Backlog", "https://linear.app/"],
    ["CSS-Tricks — Guides", "https://css-tricks.com/guides/"],
    ["Docs Firefox — Extensions", "https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions"],
    ["YouTube — Conférence", "https://www.youtube.com/"],
    ["Reddit — r/webdev", "https://www.reddit.com/r/webdev/"],
    ["arXiv — cs.LG récent", "https://arxiv.org/list/cs.LG/recent"],
    ["Hugging Face — Modèles", "https://huggingface.co/models"],
    ["Nielsen Norman Group — Articles", "https://www.nngroup.com/articles/"],
    ["Typewolf", "https://www.typewolf.com/"],
    ["The Gradient", "https://thegradient.pub/"],
    ["Papers with Code", "https://paperswithcode.com/"],
    ["Google AI", "https://ai.google/"],
    ["GitHub — Explore", "https://github.com/explore"],
  ];
  const sessionTabs = (count, seed) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const [title, url] = TAB_POOL[(seed + i * 5) % TAB_POOL.length];
      out.push({ title, url });
    }
    return out;
  };
  const SESSIONS = () => ([
    { id: "s01", name: dayLabel(0), savedAt: "18:42", tabs: sessionTabs(52, 0) },
    { id: "s02", name: dayLabel(1), savedAt: "23:10", tabs: sessionTabs(48, 9) },
    { id: "s03", name: dayLabel(2), savedAt: "21:05", tabs: sessionTabs(37, 17) },
  ]);
    return {
      bookmarks: [
        { id: "b01", title: "MDN — Guide JavaScript", url: "https://developer.mozilla.org/fr/docs/Web/JavaScript", folder: "Veille" },
        { id: "b02", title: "Guide JavaScript (copie)", url: "https://developer.mozilla.org/fr/docs/Web/JavaScript", folder: "Tutos" },
        { id: "b03", title: "JavaScript : le guide (à relire)", url: "https://developer.mozilla.org/fr/docs/Web/JavaScript", folder: "À trier" },
        { id: "b04", title: "A Complete Guide to Flexbox", url: "https://css-tricks.com/snippets/css/complete-guide-flexbox/", folder: "Tutos" },
        { id: "b05", title: "Guide Flexbox", url: "https://css-tricks.com/snippets/css/complete-guide-flexbox/", folder: "Tutos" },
        { id: "b06", title: "Docs Firefox — Extensions", url: "https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions", folder: "Veille" },
        { id: "b07", title: "Nielsen Norman Group — Articles", url: "https://www.nngroup.com/articles/", folder: "Veille" },
        { id: "b08", title: "Can I Use — Support navigateurs", url: "https://caniuse.com/", folder: "Tutos" },
        { id: "b09", title: "web.dev — Performance", url: "https://web.dev/", folder: "Veille" },
        { id: "b10", title: "Our World in Data", url: "https://ourworldindata.org/", folder: "Veille" },
        { id: "b11", title: "GitHub — Explore", url: "https://github.com/explore", folder: "Veille" },
        { id: "b12", title: "Wikipédia — Accueil", url: "https://fr.wikipedia.org/", folder: "Maison" },
        { id: "b13", title: "Excalidraw", url: "https://excalidraw.com/", folder: "Outils" },
        { id: "b14", title: "Figma — Community", url: "https://www.figma.com/community", folder: "Outils" },
      ],
      history: [
        hist(0, "18:47", "Hacker News", "https://news.ycombinator.com/"),
        hist(0, "18:12", "MDN — Guide JavaScript", "https://developer.mozilla.org/fr/docs/Web/JavaScript"),
        hist(0, "16:40", "GitHub — Pull requests", "https://github.com/pulls"),
        hist(0, "16:02", "Can I Use — Flexbox", "https://caniuse.com/?search=flexbox"),
        hist(0, "15:21", "Figma — Maquette v12", "https://www.figma.com/files"),
        hist(0, "14:58", "Excalidraw", "https://excalidraw.com/"),
        hist(0, "11:36", "Wikipédia — Zetteldigital", "https://fr.wikipedia.org/wiki/Zettelkasten"),
        hist(0, "11:02", "web.dev — Core Web Vitals", "https://web.dev/vitals/"),
        hist(0, "09:41", "Our World in Data", "https://ourworldindata.org/"),
        hist(0, "09:07", "Stack Overflow", "https://stackoverflow.com/"),
        hist(0, "08:36", "Linear — Backlog", "https://linear.app/"),
        hist(7, "15:03", "Wikipédia — Accueil", "https://fr.wikipedia.org/"),
        hist(1, "23:12", "Reddit — r/webdev", "https://www.reddit.com/r/webdev/"),
        hist(1, "22:40", "Guide JavaScript (copie)", "https://developer.mozilla.org/fr/docs/Web/JavaScript"),
        hist(1, "21:55", "YouTube — Conférence", "https://www.youtube.com/"),
        hist(1, "20:31", "Notion — Notes veille", "https://www.notion.so/"),
        hist(1, "18:05", "Hacker News", "https://news.ycombinator.com/"),
        hist(1, "17:22", "CSS-Tricks — Guides", "https://css-tricks.com/guides/"),
        hist(1, "15:48", "Figma — Community", "https://www.figma.com/community"),
        hist(1, "14:19", "arXiv — cs.HC", "https://arxiv.org/list/cs.HC/recent"),
        hist(1, "12:22", "Our World in Data", "https://ourworldindata.org/"),
        hist(1, "10:44", "Typewolf", "https://www.typewolf.com/"),
        hist(7, "22:51", "Docs Firefox — Extensions", "https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions"),
        hist(7, "20:17", "GitHub — Explore", "https://github.com/explore"),
        hist(7, "18:33", "Nielsen Norman Group — Articles", "https://www.nngroup.com/articles/"),
        hist(7, "16:29", "A Complete Guide to Flexbox", "https://css-tricks.com/snippets/css/complete-guide-flexbox/"),
        hist(7, "15:03", "Wikipédia —_accueil", "https://fr.wikipedia.org/"),
        hist(7, "13:37", "web.dev — Performance", "https://web.dev/"),
        hist(7, "11:26", "Can I Use — Support navigateurs", "https://caniuse.com/"),
        hist(7, "09:47", "Hugging Face — Modèles", "https://huggingface.co/models"),
        hist(30, "21:44", "Papers with Code", "https://paperswithcode.com/"),
        hist(30, "19:52", "arXiv — cs.LG", "https://arxiv.org/list/cs.LG/recent"),
        hist(30, "18:26", "Hugging Face — Spaces", "https://huggingface.co/spaces"),
        hist(30, "16:15", "web.dev — Performance", "https://web.dev/"),
        hist(30, "14:41", "The Gradient", "https://thegradient.pub/"),
        hist(30, "12:58", "Our World in Data — Énergie", "https://ourworldindata.org/energy"),
        hist(30, "10:12", "Google AI", "https://ai.google/"),
        hist(30, "09:03", "Distill — Publications", "https://distill.pub/"),
      ],
      tabs: [
        { id: "t01", title: "PK Web Memory — inventaire", url: "https://developer.chrome.com/docs/extensions" },
        { id: "t02", title: "Guide JavaScript (copie)", url: "https://developer.mozilla.org/fr/docs/Web/JavaScript" },
        { id: "t03", title: "A Complete Guide to Flexbox", url: "https://css-tricks.com/snippets/css/complete-guide-flexbox/" },
        { id: "t04", title: "Our World in Data", url: "https://ourworldindata.org/" },
        { id: "t05", title: "Hacker News", url: "https://news.ycombinator.com/" },
        { id: "t06", title: "Wikipédia — Accueil", url: "https://fr.wikipedia.org/" },
        { id: "t07", title: "Can I Use — Support navigateurs", url: "https://caniuse.com/" },
      ],
      sessions: SESSIONS(),
      snapshots: [],
    };
  };

  /* Visites d'arrière-plan déterministes (calendrier + tuiles) : les journées
     détaillées dans la timeline gardent leur compte exact. */
  const rng = (seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)(20260928);
  const YEAR_DAYS = 364;
  /* Densité réaliste : 90–260 visites en semaine, 30–90 le week-end,
     totaux imposés sur les journées détaillées (échantillon de la timeline). */
  const CURATED_TOTALS = { 0: 147, 1: 183, 7: 96, 30: 128 };
  const buildYear = () => new Array(YEAR_DAYS + 1).fill(0).map((_, i) => {
    const dow = dateOf(i).getDay();
    return Math.floor(dow === 0 || dow === 6 ? 30 + rng() * 60 : 90 + rng() * 170);
  });
  const applyCurated = (counts) => {
    for (const [offset, total] of Object.entries(CURATED_TOTALS)) counts[Number(offset)] = total;
    return counts;
  };
  const dateOf = (indexFromToday) => new Date(Date.now() - indexFromToday * DAY);
  const isoOf = (d) => d.toISOString().slice(0, 10);
  const levelOf = (n) => (n === 0 ? 0 : n < 60 ? 1 : n < 120 ? 2 : n < 200 ? 3 : 4);
  const LEVEL_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  /* ---------- icônes (marqueur statique de confiance) ---------- */
  const ICONS = {
    bookmark: '<path d="M4 2.5h8v11l-4-3-4 3z"/>',
    clock: '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/>',
    history: '<path d="M2 8a6 6 0 1 0 6-6 6.5 6.5 0 0 0-4.5 1.8L2 5.3"/><path d="M2 2v3.3h3.3"/><path d="M8 4.7V8l2.7 1.3"/>',
    settings: '<circle cx="8" cy="8" r="2.6"/><path d="M13.6 9.8 13.3 10.7 13.6 12.2 12.2 13.6 10.7 13.3 9.8 13.6 9 14.9 7 14.9 6.2 13.6 5.3 13.3 3.8 13.6 2.4 12.2 2.7 10.7 2.4 9.8 1.1 9 1.1 7 2.4 6.2 2.7 5.3 2.4 3.8 3.8 2.4 5.3 2.7 6.2 2.4 7 1.1 9 1.1 9.8 2.4 10.7 2.7 12.2 2.4 13.6 3.8 13.3 5.3 13.6 6.2 14.9 7 14.9 9Z"/>',
    search: '<circle cx="6.8" cy="6.8" r="4.8"/><path d="m10.5 10.5 4 4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    save: '<path d="M12 3v10m-4-4 4 4 4-4M4 12v8h16v-8"/>',
    refresh: '<path d="M14 8a6 6 0 1 1-1.76-4.24"/><path d="M14 2v3h-3"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
  };
  const svg = (name, size = 16) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("width", size); el.setAttribute("height", size);
    el.setAttribute("viewBox", name === "close" || name === "save" || name === "left" || name === "right" || name === "refresh" ? "0 0 24 24" : "0 0 16 16");
    el.setAttribute("fill", "none"); el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "1.6"); el.setAttribute("stroke-linecap", "round"); el.setAttribute("stroke-linejoin", "round");
    el.innerHTML = ICONS[name];
    return el;
  };

  /* ---------- helpers ---------- */
  const GRADS = [["#111827", "#344ca2"], ["#1c1a35", "#7a3ff1"], ["#102229", "#138f95"], ["#291721", "#cf557e"], ["#1a2419", "#72a756"], ["#1c1b25", "#776bcb"]];
  const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const letterOf = (url) => (domainOf(url)[0] || "?").toUpperCase();
  const gradOf = (url) => GRADS[hash(domainOf(url)) % GRADS.length];
  const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const matches = (item, tokens) => {
    if (!tokens.length) return true;
    const hay = `${item.title} ${domainOf(item.url)}`.toLocaleLowerCase();
    return tokens.every((t) => hay.includes(t));
  };
  const tokenize = (q) => q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const elt = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  /* Favicône réelle (S2) avec repli lettre sur dégradé. L'image est insérée
     immédiatement : `loading="lazy"` sur un élément détaché ne charge jamais. */
  function fav(url, size = 16) {
    const [a, b] = gradOf(url);
    const tile = elt("span", size >= 26 ? "pg-favtile" : "pg-fav");
    tile.style.background = `linear-gradient(135deg, ${a}, ${b})`;
    tile.style.fontSize = size >= 26 ? "13px" : `${Math.max(8, size - 6)}px`;
    tile.append(elt("span", "pg-fav-lbl", letterOf(url)));
    const img = document.createElement("img");
    img.loading = "lazy"; img.alt = ""; img.src = S2(url, size >= 26 ? 64 : 32);
    img.addEventListener("load", () => tile.classList.add("ok"));
    img.addEventListener("error", () => img.remove());
    tile.append(img);
    return tile;
  }
  /* Miniature réelle (mshots) avec repli dégradé + domaine. */
  function thumb(url) {
    const [a, b] = gradOf(url);
    const t = elt("span", "pg-thumb");
    t.style.background = `linear-gradient(150deg, ${a}, ${b})`;
    t.append(elt("span", "pg-thumb-lbl", domainOf(url).slice(0, 14)));
    const img = document.createElement("img");
    img.loading = "lazy"; img.alt = ""; img.decoding = "async"; img.src = MSHOTS(url);
    img.addEventListener("load", () => t.classList.add("ok"));
    img.addEventListener("error", () => img.remove());
    t.append(img);
    return t;
  }

  const ui = {};
  let state;
  const initState = () => {
    state = { ...DATA(), sessionSeq: 2, tabSeq: 100, snapSeq: 1, histFilter: null };
    state.year = applyCurated(buildYear());
  };

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(message, action) {
    const bar = ui.toast;
    bar.replaceChildren(elt("span", "pg-toast-msg", message));
    if (action) {
      const btn = elt("button", "pg-toast-btn", action.label);
      btn.type = "button";
      btn.addEventListener("click", () => { bar.style.display = "none"; action.run(); });
      bar.append(btn);
    }
    bar.style.display = "flex";
    ui.status.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { bar.style.display = "none"; }, 6000);
  }

  /* ---------- squelette application ---------- */
  const BOOKMARK_TABS = [["inventory", "Inventaire actif"], ["gallery", "Galerie"], ["dedupe", "Doublons"], ["dead", "Liens morts"], ["backup", "Backup"]];
  const statCard = (label, action) => {
    const wrap = action ? elt("button", "pg-card pg-card-action") : elt("div", "pg-card");
    if (action) wrap.type = "button";
    wrap.append(elt("div", "pg-card-num", "—"), elt("div", "pg-card-label", label));
    return wrap;
  };
  const block = (title, hint) => {
    const b = elt("div", "pg-block");
    const head = elt("div", "pg-block-title");
    head.append(elt("h2", null, title));
    if (hint) head.append(elt("span", "muted", hint));
    b.append(head);
    return b;
  };

  function buildApp(root) {
    root.textContent = "";

    const top = elt("div", "pg-top");
    top.append(elt("p", "pg-badge", "Simulation · données fictives · miniatures mshots & favicônes S2 comme l'extension · aucun accès à votre navigateur"));
    ui.resetBtn = elt("button", "pg-reset", "Réinitialiser la démo");
    ui.resetBtn.type = "button";
    top.append(ui.resetBtn);
    root.append(top);
    ui.status = elt("p", "pg-status");
    ui.status.setAttribute("role", "status");
    root.append(ui.status);

    const app = elt("div", "pg-app");
    app.setAttribute("role", "application");
    app.setAttribute("aria-label", "Reconstitution du tableau de bord PK Web Memory — simulation");

    /* rail latéral */
    const rail = elt("nav", "pg-rail");
    rail.setAttribute("aria-label", "Sections (démo)");
    const railMain = elt("div", "pg-rail-main");
    for (const [section, icon, label] of [["bookmarks", "bookmark", "Favoris"], ["historynav", "clock", "Historique de navigation"], ["sessions", "history", "Sessions"]]) {
      const btn = elt("button", "pg-rail-tab");
      btn.type = "button";
      btn.dataset.section = section;
      btn.title = label; btn.setAttribute("aria-label", label);
      btn.append(svg(icon, 20));
      railMain.append(btn);
    }
    rail.append(railMain);
    const settings = elt("button", "pg-rail-tab pg-rail-settings");
    settings.type = "button";
    settings.title = "Réglages (non inclus dans la démo)";
    settings.setAttribute("aria-label", "Réglages (non inclus dans la démo)");
    settings.append(svg("settings", 20));
    rail.append(settings);
    app.append(rail);

    /* colonne principale */
    const shell = elt("div", "pg-shell");
    const header = elt("header", "pg-header");
    const headerTop = elt("div", "pg-header-top");
    const brand = elt("div", "pg-brand");
    ui.brandIcon = elt("span", "pg-brand-ic");
    ui.brandIcon.append(svg("bookmark", 20));
    brand.append(ui.brandIcon, elt("h1", null, "PK Web Memory"));
    headerTop.append(brand);
    const actions = elt("div", "pg-header-actions");
    ui.searchBtn = elt("button", "pg-btn pg-btn-ghost pg-search-launch");
    ui.searchBtn.type = "button";
    ui.searchBtn.setAttribute("aria-label", "Rechercher dans les favoris, l'historique et les onglets ouverts");
    ui.searchBtn.append(svg("search", 14), elt("span", null, "Rechercher"), elt("kbd", null, "⌘ K"));
    actions.append(ui.searchBtn);
    const rescan = elt("button", "pg-btn pg-btn-ghost");
    rescan.type = "button"; rescan.title = "Relire les favoris (démo)";
    rescan.append(svg("refresh", 12), elt("span", null, "Réanalyser"));
    actions.append(rescan);
    ui.countBadge = elt("span", "pg-count-badge muted", "");
    actions.append(ui.countBadge);
    headerTop.append(actions);
    header.append(headerTop);

    ui.headerBookmarks = elt("nav", "pg-header-tabs");
    ui.headerBookmarks.setAttribute("aria-label", "Sections des favoris");
    for (const [tab, label] of BOOKMARK_TABS) {
      const b = elt("button", "pg-header-tab");
      b.type = "button"; b.dataset.tab = tab; b.textContent = label;
      ui.headerBookmarks.append(b);
    }
    header.append(ui.headerBookmarks);
    ui.headerPlain = elt("nav", "pg-header-tabs");
    ui.headerPlain.append(elt("span", "pg-header-plain-title", "Historique de navigation"));
    ui.headerPlain.hidden = true;
    header.append(ui.headerPlain);
    shell.append(header);

    const main = elt("main", "pg-main");
    ui.panels = {};
    /* — favoris — */
    const bm = elt("div", "pg-section");

    const inv = elt("section", "pg-panel");
    inv.dataset.panel = "inventory";
    const cards = elt("div", "pg-cards");
    ui.cardTotal = statCard("Bookmarks", true); ui.cardFolders = statCard("Dossiers", false);
    ui.cardDomains = statCard("domaines", false); ui.cardDupes = statCard("doublons (niveau 1)", true);
    ui.cardDead = statCard("liens morts confirmés", true);
    cards.append(ui.cardTotal, ui.cardFolders, ui.cardDomains, ui.cardDupes, ui.cardDead);
    inv.append(cards);
    const grid2 = elt("div", "pg-grid2");
    const b1 = block("Dossiers les plus fournis", "Par chemin"); ui.folderRanks = elt("div", "pg-rank-list");
    b1.append(ui.folderRanks);
    const b2 = block("Domaines les plus fréquents", "Par site"); ui.domainRanks = elt("div", "pg-rank-list");
    b2.append(ui.domainRanks);
    grid2.append(b1, b2);
    inv.append(grid2);
    bm.append(inv);

    const gal = elt("section", "pg-panel");
    gal.dataset.panel = "gallery";
    const gtools = elt("div", "pg-toolbar");
    const gsearch = elt("label", "pg-gal-search");
    gsearch.append(svg("search", 13));
    ui.galleryInput = elt("input");
    ui.galleryInput.type = "search"; ui.galleryInput.placeholder = "Rechercher un favori par titre ou URL…";
    ui.galleryInput.setAttribute("aria-label", "Rechercher dans les favoris par titre ou URL");
    gsearch.append(ui.galleryInput);
    ui.galleryFolder = elt("select");
    ui.galleryFolder.setAttribute("aria-label", "Filtrer par dossier");
    gtools.append(gsearch, ui.galleryFolder);
    gal.append(gtools);
    gal.append(elt("p", "pg-section-note", "Miniatures mshots réelles, identiques à la galerie de l'extension — cache local de 30 jours côté extension (capture n° 4)."));
    ui.galleryGrid = elt("div", "pg-gallery");
    gal.append(ui.galleryGrid);
    bm.append(gal);

    const ded = elt("section", "pg-panel");
    ded.dataset.panel = "dedupe";
    const dtools = elt("div", "pg-toolbar");
    const seg = elt("div", "pg-segmented");
    seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Niveau de détection des doublons");
    for (const [level, label, active] of [["1", "1 · Exact", true], ["2", "2 · Tracking", false], ["3", "3 · Large", false]]) {
      const s = elt("button", active ? "pg-segment active" : "pg-segment");
      s.type = "button"; s.dataset.level = level; s.textContent = label;
      if (!active) { s.disabled = true; s.title = "Non simulé dans la démo"; }
      seg.append(s);
    }
    dtools.append(seg, elt("span", "muted", "URL strictement identique"));
    ded.append(dtools);
    ui.dedupeSummary = elt("p", "pg-section-note");
    ded.append(ui.dedupeSummary);
    ui.dedupeGroups = elt("div", "pg-groups");
    ded.append(ui.dedupeGroups);
    const dactions = elt("div", "pg-toolbar pg-dedupe-actions");
    ui.cleanAll = elt("button", "pg-btn pg-btn-primary");
    ui.cleanAll.type = "button"; ui.cleanAll.dataset.cleanAll = "";
    ui.undoAll = elt("button", "pg-btn pg-btn-ghost");
    ui.undoAll.type = "button"; ui.undoAll.dataset.undo = "";
    dactions.append(ui.cleanAll, ui.undoAll);
    ded.append(dactions);
    bm.append(ded);

    const dead = elt("section", "pg-panel");
    dead.dataset.panel = "dead";
    const deadTools = elt("div", "pg-toolbar");
    ui.scanBtn = elt("button", "pg-btn pg-btn-primary");
    ui.scanBtn.type = "button"; ui.scanBtn.textContent = "Lancer le scan";
    deadTools.append(ui.scanBtn, elt("span", "muted", "0 favori vérifié"));
    dead.append(deadTools);
    dead.append(elt("p", "pg-section-note", "Simulation : aucun scan réseau ici. Dans l'extension, seuls les HTTP 404/410 confirmés sont déclarés morts — état montré sur la capture n° 7."));
    ui.deadSummary = elt("p", "pg-section-note");
    ui.deadSummary.hidden = true;
    dead.append(ui.deadSummary);
    ui.deadList = elt("div", "pg-empty");
    ui.deadList.textContent = "Aucun lien mort confirmé.";
    dead.append(ui.deadList);
    bm.append(dead);

    const backup = elt("section", "pg-panel");
    backup.dataset.panel = "backup";
    const blayout = elt("div", "pg-backup-layout");
    const bmain = elt("div", "pg-backup-main");
    const bsafe = block("Sauvegarde complète", "");
    bsafe.append(elt("p", "muted", "Export des favoris actifs en fichier téléchargé par Chrome. L'historique local conserve un instantané avant les exports, nettoyages et restaurations."));
    const bbtns = elt("div", "pg-toolbar");
    ui.exportJson = elt("button", "pg-btn pg-btn-ghost"); ui.exportJson.type = "button"; ui.exportJson.textContent = "⇩ Export JSON";
    ui.exportHtml = elt("button", "pg-btn pg-btn-ghost"); ui.exportHtml.type = "button"; ui.exportHtml.textContent = "⇩ Export HTML";
    bbtns.append(ui.exportJson, ui.exportHtml);
    bsafe.append(bbtns);
    bmain.append(bsafe);
    const bquar = block("Quarantaine", "");
    bquar.append(elt("p", "muted", "Les doublons mis en quarantaine dans la démo restent restaurables jusqu'à la réinitialisation — comme les doublons réels jusqu'à la purge manuelle."));
    bmain.append(bquar);
    blayout.append(bmain);
    const bhist = block("Historique", "");
    ui.snapshotList = elt("div", "pg-history-list");
    bhist.append(ui.snapshotList);
    blayout.append(bhist);
    backup.append(blayout);
    bm.append(backup);
    ui.panels.bookmarks = bm;
    main.append(bm);

    /* — historique : tuiles + navigation par jour + calendrier + timeline — */
    const hist = elt("div", "pg-section");
    const hcards = elt("div", "pg-cards");
    ui.hCards = [statCard("visites aujourd'hui"), statCard("visites 7 jours"), statCard("visites ce mois"), statCard("visites cette année")];
    hcards.append(...ui.hCards);
    hist.append(hcards);

    const daynav = elt("div", "pg-daynav");
    const dayGroup = elt("div", "pg-daynav-group");
    ui.dayPrev = elt("button", "pg-daynav-btn");
    ui.dayPrev.type = "button"; ui.dayPrev.setAttribute("aria-label", "Jour précédent"); ui.dayPrev.append(svg("left", 14));
    ui.dayLabel = elt("span", "pg-daynav-label", "Tous les jours");
    ui.dayCount = elt("span", "pg-daynav-count", "");
    ui.dayNext = elt("button", "pg-daynav-btn");
    ui.dayNext.type = "button"; ui.dayNext.setAttribute("aria-label", "Jour suivant"); ui.dayNext.append(svg("right", 14));
    dayGroup.append(ui.dayPrev, ui.dayLabel, ui.dayNext);
    ui.dayAll = elt("button", "pg-daynav-all", "Tous");
    ui.dayAll.type = "button";
    daynav.append(dayGroup, ui.dayAll, ui.dayCount);
    hist.append(daynav);

    const hmWrap = elt("div", "pg-hm-wrap");
    hmWrap.setAttribute("role", "group");
    hmWrap.setAttribute("aria-label", "Calendrier des visites (démo)");
    ui.heatmap = elt("div", "pg-hm");
    hmWrap.append(ui.heatmap);
    hist.append(hmWrap);
    hist.append(elt("p", "pg-section-note", "Chaque case est une journée — cliquez pour filtrer la timeline. Dans l'extension, le calendrier couvre l'année complète de votre historique."));
    ui.histList = elt("div", "pg-hg-list");
    hist.append(ui.histList);
    ui.panels.historynav = hist;
    main.append(hist);

    /* — sessions — */
    const sess = elt("div", "pg-section");
    ui.sessionsRoot = elt("div");
    sess.append(ui.sessionsRoot);
    ui.panels.sessions = sess;
    main.append(sess);
    shell.append(main);
    app.append(shell);

    /* — palette ⌘K — */
    ui.gsBackdrop = elt("div", "pg-gs-backdrop");
    ui.gsBackdrop.hidden = true;
    const gs = elt("div", "pg-gs-dialog");
    gs.setAttribute("role", "dialog"); gs.setAttribute("aria-label", "Recherche globale (démo)");
    const gsField = elt("div", "pg-gs-field");
    gsField.append(svg("search", 16));
    ui.gsInput = elt("input", "pg-gs-input");
    ui.gsInput.type = "search"; ui.gsInput.placeholder = "Rechercher un site, un titre ou une URL…";
    ui.gsInput.setAttribute("aria-label", "Rechercher un site, un titre ou une URL (démo)");
    const gsClose = elt("button", "pg-gs-close"); gsClose.type = "button"; gsClose.textContent = "Esc";
    gsClose.setAttribute("aria-label", "Fermer la recherche");
    gsField.append(ui.gsInput, gsClose);
    gs.append(gsField);
    gs.append(elt("div", "pg-gs-caption", "Favoris · Historique · Onglets ouverts"));
    ui.gsResults = elt("div", "pg-gs-results");
    gs.append(ui.gsResults);
    const gsFooter = elt("div", "pg-gs-footer", null);
    gsFooter.append(elt("span", null, "↑↓ naviguer"), elt("span", null, "↵ ouvrir (simulé)"), elt("span", null, "échap fermer"));
    gs.append(gsFooter);
    ui.gsBackdrop.append(gs);
    app.append(ui.gsBackdrop);

    /* — tiroir « Enregistrer & fermer » — */
    ui.drawerBackdrop = elt("div", "pg-drawer-backdrop");
    ui.drawerBackdrop.hidden = true;
    const drawer = elt("div", "pg-drawer");
    drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-label", "Enregistrer la session (démo)");
    const dhead = elt("div", "pg-drawer-head");
    dhead.append(elt("h2", null, "Enregistrer & fermer"));
    const dclose = elt("button", "pg-icon-btn"); dclose.type = "button"; dclose.setAttribute("aria-label", "Fermer");
    dclose.append(svg("close", 16));
    dhead.append(dclose);
    drawer.append(dhead);
    drawer.append(elt("p", "pg-drawer-desc", "Nommez la session et choisissez les onglets à conserver. Les onglets cochés quittent la fenêtre — restauration possible depuis la timeline."));
    ui.drawerName = elt("input", "pg-drawer-input");
    ui.drawerName.type = "text"; ui.drawerName.maxLength = 60; ui.drawerName.placeholder = "ex. Veille du lundi";
    ui.drawerName.setAttribute("aria-label", "Nom de la session");
    ui.drawerChecks = elt("div", "pg-drawer-checks");
    const dform = elt("form", "pg-drawer-form");
    ui.drawerSubmit = elt("button", "pg-btn pg-btn-primary");
    ui.drawerSubmit.type = "submit";
    dform.append(ui.drawerName, ui.drawerChecks, ui.drawerSubmit);
    drawer.append(dform);
    ui.drawerBackdrop.append(drawer);
    app.append(ui.drawerBackdrop);

    /* — toast — */
    ui.toast = elt("div", "pg-toast");
    ui.toast.style.display = "none";
    app.append(ui.toast);

    root.append(app);
  }

  /* ---------- navigation ---------- */
  let section = "bookmarks";
  let bmTab = "inventory";
  function setSection(next) {
    section = next;
    for (const btn of document.querySelectorAll(".pg-rail-tab[data-section]")) {
      const on = btn.dataset.section === next;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-current", on ? "page" : "false");
    }
    for (const [key, node] of Object.entries(ui.panels)) node.hidden = key !== next;
    ui.headerBookmarks.hidden = next !== "bookmarks";
    ui.headerPlain.hidden = next === "bookmarks";
    ui.headerPlain.firstChild.textContent = next === "sessions" ? "Sessions" : "Historique de navigation";
    ui.brandIcon.replaceChildren(svg(next === "sessions" ? "history" : next === "historynav" ? "clock" : "bookmark", 20));
    if (next === "bookmarks") renderBookmarks();
    if (next === "historynav") renderHistory();
    if (next === "sessions") renderSessions();
  }
  function setBmTab(tab) {
    bmTab = tab;
    for (const btn of ui.headerBookmarks.children) btn.classList.toggle("active", btn.dataset.tab === tab);
    for (const panel of ui.panels.bookmarks.querySelectorAll(".pg-panel")) panel.hidden = panel.dataset.panel !== tab;
    renderBookmarks();
  }

  /* ---------- rendu : favoris ---------- */
  function renderBookmarks() {
    if (section !== "bookmarks") return;
    const bms = state.bookmarks;
    ui.cardTotal.querySelector(".pg-card-num").textContent = String(bms.length);
    ui.cardFolders.querySelector(".pg-card-num").textContent = String(new Set(bms.map((b) => b.folder)).size);
    const domains = new Map();
    for (const b of bms) domains.set(domainOf(b.url), (domains.get(domainOf(b.url)) || 0) + 1);
    ui.cardDomains.querySelector(".pg-card-num").textContent = String(domains.size);
    ui.cardDupes.querySelector(".pg-card-num").textContent = String(dupeExtra());
    ui.cardDead.querySelector(".pg-card-num").textContent = "0";

    const byFolder = new Map();
    for (const b of bms) byFolder.set(b.folder, (byFolder.get(b.folder) || 0) + 1);
    renderRanks(ui.folderRanks, [...byFolder.entries()].sort((a, b) => b[1] - a[1]), null);
    renderRanks(ui.domainRanks, [...domains.entries()].sort((a, b) => b[1] - a[1]), "domain");

    if (bmTab === "gallery") renderGallery();
    if (bmTab === "dedupe") renderDedupe();
    if (bmTab === "backup") renderSnapshots();
  }
  function renderRanks(list, rows, kind) {
    list.textContent = "";
    if (!rows.length) { list.append(elt("p", "muted", "Rien à classer pour l'instant.")); return; }
    const max = rows[0][1];
    for (const [label, n] of rows.slice(0, 6)) {
      const row = elt("div", kind === "domain" ? "pg-rank-row has-fav" : "pg-rank-row");
      if (kind === "domain") row.append(fav(`https://${label}`, 16));
      row.append(elt("span", "pg-rank-label", label));
      const track = elt("span", "pg-rank-track");
      const bar = elt("span"); bar.style.width = `${Math.round((n / max) * 100)}%`;
      track.append(bar); row.append(track);
      row.append(elt("span", "pg-rank-n", String(n)));
      list.append(row);
    }
  }
  function renderGallery() {
    const current = ui.galleryFolder.value;
    ui.galleryFolder.textContent = "";
    const all = elt("option", null, "Tous les dossiers"); all.value = "";
    ui.galleryFolder.append(all);
    for (const f of [...new Set(state.bookmarks.map((b) => b.folder))].sort()) {
      const opt = elt("option", null, f); opt.value = f;
      ui.galleryFolder.append(opt);
    }
    ui.galleryFolder.value = current || "";
    ui.galleryGrid.textContent = "";
    const tokens = tokenize(ui.galleryInput.value);
    const folder = ui.galleryFolder.value;
    const items = state.bookmarks.filter((b) => (!folder || b.folder === folder) && matches(b, tokens));
    if (!items.length) { ui.galleryGrid.append(elt("p", "pg-empty", "Aucun favori ne correspond.")); return; }
    for (const b of items) {
      const card = elt("button", "pg-gcard");
      card.type = "button";
      card.title = b.url;
      card.append(thumb(b.url));
      const body = elt("span", "pg-gcard-body");
      body.append(elt("b", null, b.title), elt("small", null, domainOf(b.url)));
      card.append(body, elt("span", "pg-gcard-folder", b.folder));
      card.addEventListener("click", () => toast(`Ouverture simulée : ${domainOf(b.url)}`));
      ui.galleryGrid.append(card);
    }
  }
  const dupeGroups = () => {
    const byUrl = new Map();
    for (const b of state.bookmarks) {
      if (!byUrl.has(b.url)) byUrl.set(b.url, []);
      byUrl.get(b.url).push(b);
    }
    return [...byUrl.values()].filter((g) => g.length > 1);
  };
  const dupeExtra = () => dupeGroups().reduce((n, g) => n + g.length - 1, 0);
  function renderDedupe() {
    const groups = dupeGroups();
    ui.dedupeGroups.textContent = "";
    if (!groups.length) {
      ui.dedupeSummary.textContent = "Aucun doublon exact — chaque URL est unique.";
      ui.cleanAll.disabled = true;
    } else {
      ui.dedupeSummary.textContent = `${pl(groups.length, "groupe", "groupes")} · ${pl(dupeExtra(), "doublon à retirer", "doublons à retirer")}`;
      for (const g of groups) {
        const art = elt("div", "pg-group");
        const head = elt("div", "pg-group-head");
        head.append(elt("code", null, g[0].url), elt("span", "pg-chip-count", `×${g.length}`));
        art.append(head);
        for (const [i, b] of g.entries()) {
          const row = elt("div", "pg-group-row");
          row.append(fav(b.url, 16));
          row.append(elt("span", "pg-group-title", b.title), elt("span", "muted", b.folder));
          row.append(elt("span", i === 0 ? "pg-chip keep" : "pg-chip dup", i === 0 ? "CONSERVÉ" : "DOUBLON"));
          art.append(row);
        }
        const btn = elt("button", "pg-btn pg-btn-ghost pg-btn-sm");
        btn.type = "button"; btn.dataset.quarantine = g[0].url;
        btn.textContent = `Mettre en quarantaine (${g.length - 1})`;
        art.append(btn);
        ui.dedupeGroups.append(art);
      }
      ui.cleanAll.disabled = false;
    }
    ui.cleanAll.textContent = `Tout mettre en quarantaine (${dupeExtra()})`;
    ui.undoAll.textContent = state.lastQuarantine ? `Annuler la quarantaine (${state.lastQuarantine.items.length})` : "Annuler la quarantaine (0)";
    ui.undoAll.disabled = !state.lastQuarantine;
  }
  function renderSnapshots() {
    ui.snapshotList.textContent = "";
    if (!state.snapshots.length) {
      ui.snapshotList.append(elt("p", "muted", "Aucun instantané pour l'instant. Un historique est créé avant chaque export ou nettoyage (simulé)."));
      return;
    }
    for (const s of [...state.snapshots].reverse()) {
      const row = elt("div", "pg-history-row");
      row.append(elt("span", "pg-history-dot"), elt("span", "pg-history-copy", s.label), elt("span", "muted", s.when));
      ui.snapshotList.append(row);
    }
  }
  const addSnapshot = (label) => { state.snapshots.push({ id: state.snapSeq++, label, when: "à l'instant" }); if (bmTab === "backup" && section === "bookmarks") renderSnapshots(); };

  /* ---------- rendu : historique (tuiles + calendrier + timeline) ---------- */
  function histDays() {
    return [...new Set(state.history.map((h) => h.day))];
  }
  function renderHistory() {
    /* tuiles */
    const today = state.year[0];
    const week = state.year.slice(0, 7).reduce((a, b) => a + b, 0);
    const month = state.year.slice(0, 30).reduce((a, b) => a + b, 0);
    const year = state.year.reduce((a, b) => a + b, 0);
    [today, week, month, year].forEach((n, i) => ui.hCards[i].querySelector(".pg-card-num").textContent = n.toLocaleString("fr-FR"));

    /* navigation par jour */
    const days = histDays();
    const idx = state.histFilter === null ? -1 : days.indexOf(state.histFilter);
    ui.dayPrev.disabled = state.histFilter === null || idx <= 0;
    ui.dayNext.disabled = state.histFilter === null || idx >= days.length - 1;
    ui.dayAll.disabled = state.histFilter === null;
    ui.dayLabel.textContent = state.histFilter === null ? "Tous les jours" : state.histFilter;
    const totalFor = (day) => { const entry = state.history.find((h) => h.day === day); return entry ? CURATED_TOTALS[entry.offset] ?? 0 : 0; };
    ui.dayCount.textContent = state.histFilter === null ? `${state.year.reduce((a, b) => a + b, 0).toLocaleString("fr-FR")} visites cette année` : `${totalFor(state.histFilter).toLocaleString("fr-FR")} visites`;

    /* calendrier façon GitHub : jours de semaine à gauche, mois ancrés à leur
       première colonne, taille de case calculée pour remplir la largeur,
       légende de niveaux. */
    ui.heatmap.textContent = "";
    const weeks = Math.ceil((YEAR_DAYS + 1) / 7);
    const inner = elt("div", "pg-hm-inner");
    const dowCol = elt("div", "pg-hm-dows");
    const anchor = dateOf(6);
    for (let r = 0; r < 7; r++) {
      const d = new Date(anchor.getTime() + (r - anchor.getDay()) * DAY);
      const cell = elt("span", "pg-hm-dow");
      if (d.getDay() === 1 || d.getDay() === 3 || d.getDay() === 5) {
        cell.textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d);
      }
      dowCol.append(cell);
    }
    const right = elt("div", "pg-hm-right");
    const monthsRow = elt("div", "pg-hm-months");
    const grid = elt("div", "pg-hm-grid");
    for (let w = 0; w < weeks; w++) {
      const col = elt("div", "pg-hm-col");
      const base = (weeks - 1 - w) * 7;
      const startOffset = dateOf(base).getDay(); /* colonne alignée dimanche */
      for (let r = 0; r < 7; r++) {
        const dayIndex = base - startOffset + r;
        if (dayIndex < 0 || dayIndex > YEAR_DAYS) { col.append(elt("span", "pg-hm-cell pad")); continue; }
        const date = dateOf(dayIndex);
        const count = state.year[dayIndex];
        const cell = elt("button", "pg-hm-cell");
        cell.type = "button";
        cell.style.background = LEVEL_COLORS[levelOf(count)];
        if (dayIndex === 0) cell.classList.add("today");
        const iso = isoOf(date);
        const curatedDay = state.history.find((h) => isoOf(dateOf(h.offset)) === iso)?.day;
        if (state.histFilter !== null && curatedDay === state.histFilter) cell.classList.add("selected");
        cell.setAttribute("aria-label", `${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} : ${count} visite(s)`);
        cell.title = cell.getAttribute("aria-label");
        cell.addEventListener("click", () => {
          if (curatedDay !== undefined) { state.histFilter = state.histFilter === curatedDay ? null : curatedDay; }
          else { state.histFilter = null; toast("Cette journée n'est pas détaillée dans la démo — la timeline échantillonne 4 journées."); }
          renderHistory();
        });
        col.append(cell);
      }
      grid.append(col);
    }
    const avail = Math.max(300, ui.heatmap.clientWidth) - 28 - 24 - 8;
    const cellSize = Math.min(20, Math.max(9, Math.floor((avail - (weeks - 1) * 3) / weeks)));
    inner.style.setProperty("--hm-cell", `${cellSize}px`);
    inner.style.setProperty("--hm-cols", String(weeks));
    const colMonth = (w) => dateOf((weeks - 1 - w) * 7).getMonth();
    let lastLeft = -Infinity;
    for (let w = 0; w < weeks; w++) {
      if (w + 1 < weeks && colMonth(w) === colMonth(w + 1)) continue;
      const text = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(dateOf((weeks - 1 - w) * 7));
      const left = w * (cellSize + 3);
      if (left - lastLeft < 40) continue;
      const label = elt("span", "pg-hm-month", text[0].toUpperCase() + text.slice(1));
      label.style.gridColumnStart = String(w + 1);
      monthsRow.append(label);
      lastLeft = left;
    }
    right.append(monthsRow, grid);
    inner.append(dowCol, right);
    const legend = elt("div", "pg-hm-legend");
    legend.append(elt("span", null, "Moins"));
    for (const color of LEVEL_COLORS) {
      const sample = elt("span", "pg-hm-sample");
      sample.style.background = color;
      legend.append(sample);
    }
    legend.append(elt("span", null, "Plus"));
    ui.heatmap.append(inner, legend);

    /* timeline filtrée */
    ui.histList.textContent = "";
    const openUrls = new Set(state.tabs.map((t) => t.url));
    const rows = state.histFilter === null ? state.history : state.history.filter((h) => h.day === state.histFilter);
    if (!rows.length) { ui.histList.append(elt("p", "pg-empty", state.histFilter ? `Aucune visite détaillée pour « ${state.histFilter} ».` : "Aucune visite fictive.")); return; }
    const byDay = new Map();
    for (const v of rows) {
      if (!byDay.has(v.day)) byDay.set(v.day, []);
      byDay.get(v.day).push(v);
    }
    for (const [day, visits] of byDay) {
      const card = elt("section", "pg-hg-day");
      const title = elt("h3", "pg-hg-day-title");
      title.append(elt("span", null, day), elt("span", null, `${totalFor(day).toLocaleString("fr-FR")} visites`));
      card.append(title);
      const body = elt("div", "pg-hg-body");
      const shown = visits.slice(0, 12);
      for (const v of shown) {
        const row = elt("div", openUrls.has(v.url) ? "pg-hg-row open" : "pg-hg-row");
        row.append(fav(v.url, 16));
        const copy = elt("span", "pg-hg-copy");
        copy.append(elt("b", null, v.title));
        copy.append(elt("span", "pg-hg-url", domainOf(v.url)));
        row.append(copy);
        if (openUrls.has(v.url)) row.append(elt("span", "pg-open-pill", "OUVERT"));
        row.append(elt("span", "pg-hg-time", v.time));
        body.append(row);
      }
      const rest = totalFor(day) - shown.length;
      if (rest > 0) {
        const more = elt("p", "pg-hg-more");
        more.textContent = `+ ${(rest).toLocaleString("fr-FR")} autres visites ce jour-là (échantillon de la démo)`;
        body.append(more);
      }
      card.append(body);
      ui.histList.append(card);
    }
  }

  /* ---------- rendu : sessions ---------- */
  function renderSessions() {
    const root = ui.sessionsRoot;
    root.textContent = "";
    const openUrls = new Set(state.tabs.map((t) => t.url));

    const liveDay = elt("div", "pg-tl-day");
    liveDay.append(elt("span", null, "En cours"), elt("span", "pg-tl-rule"), elt("span", "pg-tl-total", pl(state.tabs.length, "onglet", "onglets")));
    root.append(liveDay);

    const live = elt("section", "pg-tl-session live");
    const head = elt("div", "pg-tl-head");
    const heading = elt("div", "pg-tl-heading");
    const h3 = elt("h3");
    h3.append(elt("span", "pg-tl-title", "Fenêtre en cours"), elt("span", "pg-tl-count", `${state.tabs.length} onglet(s)`));
    heading.append(h3);
    head.append(heading);
    const tools = elt("div", "pg-tl-actions");
    ui.saveCloseBtn = elt("button", "pg-tl-tool");
    ui.saveCloseBtn.type = "button"; ui.saveCloseBtn.dataset.saveClose = "";
    ui.saveCloseBtn.append(svg("save", 14), elt("span", null, "Enregistrer & fermer"));
    tools.append(ui.saveCloseBtn);
    head.append(tools);
    live.append(head);

    const body = elt("div", "pg-tl-body");
    const preview = elt("figure", "pg-tl-preview");
    if (state.tabs.length) {
      const shot = elt("span", "pg-tl-preview-shot");
      shot.append(thumb(state.tabs[0].url));
      preview.append(shot, elt("figcaption", null, domainOf(state.tabs[0].url)), elt("span", "pg-tl-preview-count", `${state.tabs.length} onglet(s) ouvert(s)`));
    } else {
      preview.append(elt("span", "pg-tl-preview-empty", "Plus aucun onglet ouvert — restaurez une session ou réinitialisez la démo."));
    }
    body.append(preview);
    const list = elt("div", "pg-tl-list");
    for (const t of state.tabs) {
      const row = elt("div", "pg-tl-row nothumb");
      const link = elt("span", "pg-tl-link");
      link.append(fav(t.url, 16));
      link.append(elt("span", "pg-tl-truncate", t.title));
      row.append(link);
      row.append(elt("span", "pg-tl-domain", domainOf(t.url)));
      const closeBtn = elt("button", "pg-tl-close");
      closeBtn.type = "button"; closeBtn.dataset.closeTab = t.id;
      closeBtn.title = "Fermer l'onglet (démo)"; closeBtn.setAttribute("aria-label", `Fermer ${t.title}`);
      closeBtn.append(svg("close", 14));
      row.append(closeBtn);
      list.append(row);
    }
    if (!state.tabs.length) list.append(elt("p", "pg-tl-empty", "Fenêtre vide."));
    body.append(list);
    live.append(body);
    root.append(live);

    if (state.sessions.length) {
      const pastDay = elt("div", "pg-tl-day");
      pastDay.append(elt("span", null, "Jours précédents"), elt("span", "pg-tl-rule"), elt("span", "pg-tl-total", pl(state.sessions.length, "session", "sessions")));
      root.append(pastDay);
      const archives = elt("div", "pg-tl-archives");
      for (const s of state.sessions) {
        const row = elt("article", "pg-tl-archive-row");
        const ahead = elt("div", "pg-tl-archive-head");
        ahead.append(elt("span", "pg-tl-archive-title", s.name));
        ahead.append(elt("span", "pg-tl-archive-meta", `${s.tabs.length} onglet(s) · ${s.savedAt}`));
        const actions = elt("span", "pg-tl-archive-actions");
        const restore = elt("button", "pg-btn pg-btn-ghost pg-btn-sm");
        restore.type = "button"; restore.dataset.restore = s.id;
        restore.textContent = "Restaurer";
        restore.title = "Rouvrir les onglets pas déjà ouverts (démo)";
        actions.append(restore);
        ahead.append(actions);
        row.append(ahead);
        const mosaic = elt("div", "pg-tl-mosaic");
        for (const t of s.tabs) {
          const tile = fav(t.url, 34);
          tile.title = t.title;
          if (openUrls.has(t.url)) tile.classList.add("is-open");
          mosaic.append(tile);
        }
        row.append(mosaic);
        archives.append(row);
      }
      root.append(archives);
    }
  }

  /* ---------- palette ⌘K ---------- */
  let gsIndex = -1;
  const gsSources = () => ([
    { key: "Favoris", items: state.bookmarks.map((b) => ({ title: b.title, url: b.url, badge: `Dossier · ${b.folder}` })) },
    { key: "Historique", items: state.history.map((h) => ({ title: h.title, url: h.url, badge: "Visite" })) },
    { key: "Onglets ouverts", items: state.tabs.map((t) => ({ title: t.title, url: t.url, badge: "Ouvert", open: true })) },
  ]);
  function renderGs() {
    const tokens = tokenize(ui.gsInput.value);
    ui.gsResults.textContent = "";
    let total = 0;
    let idx = 0;
    const rows = [];
    for (const src of gsSources()) {
      const hits = src.items.filter((i) => matches(i, tokens)).slice(0, 4);
      total += hits.length;
      if (!hits.length) continue;
      const group = elt("div", "pg-gs-group");
      group.append(elt("div", "pg-gs-group-title", `${src.key} · ${hits.length}`));
      for (const item of hits) {
        const row = elt("div", "pg-gs-row");
        row.dataset.idx = String(idx++);
        const tile = thumb(item.url);
        tile.append(fav(item.url, 18));
        row.append(tile);
        const main = elt("div", "pg-gs-main");
        main.append(elt("span", "pg-gs-title", item.title), elt("span", "pg-gs-url", item.url));
        const badges = elt("div", "pg-gs-badges");
        badges.append(elt("span", "pg-gs-badge", item.badge));
        if (item.open) badges.append(elt("span", "pg-gs-badge open", "OUVERT"));
        main.append(badges);
        row.append(main);
        row.addEventListener("click", () => gsOpen(row.dataset.idx));
        rows.push({ row, title: item.title });
        group.append(row);
      }
      ui.gsResults.append(group);
    }
    if (!total) ui.gsResults.append(elt("p", "pg-gs-empty", tokens.length ? `Aucun résultat pour « ${ui.gsInput.value.trim()} ».` : "Commencez à taper pour chercher dans les trois sources."));
    ui.gsRows = rows;
    gsIndex = rows.length ? 0 : -1;
    gsPaint();
  }
  const gsPaint = () => { for (const { row } of ui.gsRows || []) row.classList.toggle("sel", Number(row.dataset.idx) === gsIndex); ui.gsRows?.[gsIndex]?.row.scrollIntoView({ block: "nearest" }); };
  const gsOpen = (idx) => { const target = ui.gsRows?.[Number(idx)]; if (target) toast(`Ouverture simulée : ${target.title}`); closePalette(); };
  function openPalette() {
    ui.gsBackdrop.hidden = false;
    ui.gsInput.value = "";
    renderGs();
    ui.gsInput.focus();
  }
  function closePalette() { ui.gsBackdrop.hidden = true; ui.searchBtn.focus(); }

  /* ---------- tiroir session ---------- */
  function openDrawer() {
    ui.drawerChecks.textContent = "";
    for (const t of state.tabs) {
      const label = elt("label", "pg-check");
      const box = elt("input"); box.type = "checkbox"; box.value = t.id; box.checked = true;
      label.append(box, fav(t.url, 16), elt("span", "pg-check-title", t.title), elt("span", "muted", domainOf(t.url)));
      ui.drawerChecks.append(label);
    }
    if (!state.tabs.length) ui.drawerChecks.append(elt("p", "muted", "Aucun onglet ouvert à enregistrer."));
    ui.drawerName.value = dayLabel(0);
    drawerUpdateSubmit();
    ui.drawerBackdrop.hidden = false;
    ui.drawerName.focus();
  }
  const closeDrawer = () => { ui.drawerBackdrop.hidden = true; ui.saveCloseBtn?.focus(); };
  function drawerUpdateSubmit() {
    const n = ui.drawerChecks.querySelectorAll("input:checked").length;
    ui.drawerSubmit.textContent = n ? `Enregistrer ${n === 1 ? "l'onglet" : `les ${n} onglets`}` : "Enregistrer";
    ui.drawerSubmit.disabled = !n;
  }
  function saveSession(event) {
    event.preventDefault();
    const name = ui.drawerName.value.trim().slice(0, 60);
    if (!name) { ui.drawerName.focus(); toast("Donnez un nom à la session."); return; }
    const ids = new Set([...ui.drawerChecks.querySelectorAll("input:checked")].map((i) => i.value));
    if (!ids.size) return;
    const picked = state.tabs.filter((t) => ids.has(t.id));
    state.sessions.unshift({
      id: `s${state.sessionSeq++}`, name, savedAt: "à l'instant",
      tabs: picked.map(({ title, url }) => ({ title, url })),
    });
    state.tabs = state.tabs.filter((t) => !ids.has(t.id));
    const restore = () => {
      const mine = state.sessions.find((s) => s.name === name && s.savedAt === "à l'instant");
      if (mine) state.sessions = state.sessions.filter((s) => s !== mine);
      state.tabs.push(...picked);
      renderAll();
      toast("Session annulée — onglets rouverts.");
    };
    closeDrawer();
    renderAll();
    addSnapshot(`Session « ${name} » enregistrée`);
    toast(`${pl(picked.length, "onglet enregistré", "onglets enregistrés")} dans « ${name} » : ${picked[0].title}${picked.length > 1 ? ` et ${picked.length - 1} autre(s)` : ""}.`, { label: "Rouvrir", run: restore });
  }
  function restoreSession(id) {
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return;
    const open = new Set(state.tabs.map((t) => t.url));
    const reopened = [];
    let skipped = 0;
    for (const t of session.tabs) {
      if (open.has(t.url)) { skipped++; continue; }
      open.add(t.url);
      reopened.push({ id: `t${state.tabSeq++}`, title: t.title, url: t.url });
    }
    state.tabs.push(...reopened);
    renderAll();
    toast(reopened.length
      ? `« ${session.name} » restaurée — ${pl(reopened.length, "onglet rouvert", "onglets rouverts")}${skipped ? `, ${skipped} déjà ouvert(s) ignoré(s)` : ""}.`
      : `« ${session.name} » : tous ses onglets sont déjà ouverts.`);
  }

  /* ---------- actions favoris ---------- */
  function quarantine(urls) {
    const targets = new Set(urls);
    const kept = new Set();
    const removed = [];
    const next = [];
    state.bookmarks.forEach((b, index) => {
      if (targets.has(b.url) && kept.has(b.url)) { removed.push({ item: b, index }); return; }
      kept.add(b.url);
      next.push(b);
    });
    if (!removed.length) return;
    state.bookmarks = next;
    state.lastQuarantine = { items: removed };
    addSnapshot(`Quarantaine — ${pl(removed.length, "doublon", "doublons")}`);
    renderAll();
    toast(`${pl(removed.length, "doublon mis en quarantaine", "doublons mis en quarantaine")} — chaque URL garde un favori.`, { label: "Annuler", run: undoQuarantine });
  }
  function undoQuarantine() {
    const removed = state.lastQuarantine?.items;
    if (!removed) return;
    [...removed].sort((a, b) => a.index - b.index).forEach(({ item, index }) => state.bookmarks.splice(Math.min(index, state.bookmarks.length), 0, item));
    state.lastQuarantine = null;
    renderAll();
    toast(`${pl(removed.length, "favori remis en place", "favoris remis en place")}.`);
  }
  function closeTab(id) {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    state.tabs = state.tabs.filter((t) => t.id !== id);
    renderAll();
    toast(`« ${tab.title} » fermé (simulé).`, {
      label: "Rouvrir",
      run: () => { state.tabs.push(tab); renderAll(); toast("Onglet rouvert."); },
    });
  }
  function resetAll() {
    initState();
    ui.galleryInput.value = "";
    state.histFilter = null;
    setSection("bookmarks");
    setBmTab("inventory");
    renderAll();
    toast("Démo réinitialisée — données fictives d'origine.");
  }

  /* ---------- rendu global ---------- */
  function renderAll() {
    ui.countBadge.textContent = `${state.tabs.length} onglet(s)`;
    setSection(section);
    if (section === "bookmarks") setBmTab(bmTab);
  }

  /* ---------- événements ---------- */
  function bindEvents(root) {
    const app = root.querySelector(".pg-app");
    app.addEventListener("click", (e) => {
      const railBtn = e.target.closest(".pg-rail-tab[data-section]");
      if (railBtn) { setSection(railBtn.dataset.section); return; }
      if (e.target.closest(".pg-rail-settings")) { toast("Réglages non inclus dans la démo."); return; }
      const tabBtn = e.target.closest(".pg-header-tab");
      if (tabBtn) { setBmTab(tabBtn.dataset.tab); return; }
      if (e.target.closest(".pg-search-launch")) { openPalette(); return; }
      const card = e.target.closest(".pg-card-action");
      if (card) {
        if (card === ui.cardDupes) { setBmTab("dedupe"); return; }
        if (card === ui.cardDead) { setBmTab("dead"); return; }
        if (card === ui.cardTotal || card === ui.cardFolders) { setBmTab("gallery"); return; }
      }
      if (e.target.closest("[data-clean-all]")) { quarantine(dupeGroups().map((g) => g[0].url)); return; }
      if (e.target.closest("[data-undo]")) { undoQuarantine(); return; }
      const one = e.target.closest("[data-quarantine]");
      if (one) { quarantine([one.dataset.quarantine]); return; }
      if (e.target.closest("#pg-export-json")) { addSnapshot("Export JSON (simulé)"); toast("Export JSON simulé — aucun fichier téléchargé."); return; }
      if (e.target.closest("#pg-export-html")) { addSnapshot("Export HTML (simulé)"); toast("Export HTML simulé — aucun fichier téléchargé."); return; }
      if (e.target.closest(".pg-gs-close") || e.target === ui.gsBackdrop) { closePalette(); return; }
      if (e.target.closest(".pg-drawer-head button") || e.target === ui.drawerBackdrop) { closeDrawer(); return; }
      if (e.target.closest("[data-save-close]")) { openDrawer(); return; }
      const closeTabBtn = e.target.closest("[data-close-tab]");
      if (closeTabBtn) { closeTab(closeTabBtn.dataset.closeTab); return; }
      const restoreBtn = e.target.closest("[data-restore]");
      if (restoreBtn) { restoreSession(restoreBtn.dataset.restore); return; }
      if (e.target.closest(".pg-tl-preview-shot") || e.target.closest(".pg-tl-row .pg-thumb")) { toast("Aperçu élargi non simulé dans la démo."); return; }
    });
    ui.exportJson.id = "pg-export-json";
    ui.exportHtml.id = "pg-export-html";

    /* navigation par jour */
    ui.dayPrev.addEventListener("click", () => { const d = histDays(); const i = d.indexOf(state.histFilter); if (i > 0) { state.histFilter = d[i - 1]; renderHistory(); } });
    ui.dayNext.addEventListener("click", () => { const d = histDays(); const i = d.indexOf(state.histFilter); if (i >= 0 && i < d.length - 1) { state.histFilter = d[i + 1]; renderHistory(); } });
    ui.dayAll.addEventListener("click", () => { state.histFilter = null; renderHistory(); });

    ui.gsInput.addEventListener("input", renderGs);
    ui.gsInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (ui.gsRows.length) { gsIndex = (gsIndex + 1) % ui.gsRows.length; gsPaint(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (ui.gsRows.length) { gsIndex = (gsIndex - 1 + ui.gsRows.length) % ui.gsRows.length; gsPaint(); } }
      else if (e.key === "Enter") { e.preventDefault(); gsOpen(String(gsIndex)); }
      else if (e.key === "Escape") { closePalette(); }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && root.getBoundingClientRect().top < innerHeight && root.getBoundingClientRect().bottom > 0) {
        e.preventDefault();
        openPalette();
      } else if (e.key === "Escape" && !ui.drawerBackdrop.hidden) closeDrawer();
      else if (e.key === "Escape" && !ui.gsBackdrop.hidden) closePalette();
    });
    ui.drawerChecks.addEventListener("change", drawerUpdateSubmit);
    document.querySelector(".pg-drawer-form").addEventListener("submit", saveSession);
    ui.galleryInput.addEventListener("input", () => { if (bmTab === "gallery") renderGallery(); });
    ui.galleryFolder.addEventListener("change", () => renderGallery());
    ui.scanBtn.addEventListener("click", () => {
      ui.scanBtn.disabled = true;
      const summary = ui.scanBtn.parentElement.querySelector(".muted");
      summary.textContent = "Scan simulé en cours…";
      setTimeout(() => {
        summary.textContent = `${state.bookmarks.length} favoris couverts · 0 lien mort confirmé`;
        ui.deadSummary.hidden = false;
        ui.deadSummary.textContent = "Simulation terminée : aucune requête réseau émise. Dans l'extension, chaque URL serait vérifiée une fois, sans cookies.";
        ui.scanBtn.disabled = false;
        ui.scanBtn.textContent = "Relancer le scan";
      }, 900);
    });
    ui.resetBtn.addEventListener("click", resetAll);
  }

  function init() {
    const root = document.getElementById("playground-root");
    if (!root) return;
    initState();
    buildApp(root);
    bindEvents(root);
    setSection("bookmarks");
    setBmTab("inventory");
    renderAll();
    ui.status.textContent = "Cliquez sur « Rechercher », parcourez les onglets, enregistrez une session, explorez le calendrier de l'historique.";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
