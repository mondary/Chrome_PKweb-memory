/* PK Web Memory — Tableau de bord : page de liens utiles adossée à UN dossier de
   favoris Chrome, volontairement à plat : une catégorie n'est jamais un
   sous-dossier, c'est un préfixe de nom. « Travail — GitHub » range le lien dans
   « Travail » ; sans préfixe, il reste en « Sans catégorie ». Les sous-dossiers
   qui traînent dans le dossier sont aplatis automatiquement (la catégorie
   devient le préfixe). La liste reste exactement celle du gestionnaire de
   favoris Chrome ; seuls les noms de catégories (ordre), la largeur des cartes
   et les catégories vides sont gardés en stockage local. Module autonome
   (comme resources.js) : ponts optionnels vers app.js (toast, poubelle,
   réglages, rescan suspendu, miniatures d'aperçu). */
(function () {
  "use strict";

  const STORE_KEY = "bs.dashboard";
  const SEP = " — ";
  const ROOT_NAME = "Sans catégorie";
  // Dossiers reconnus automatiquement au premier lancement, dans la barre puis
  // dans les autres favoris : l'utilisateur n'a rien à configurer s'il en a déjà un.
  const DEFAULT_TITLES = ["dashboard", "tableau de bord", "liens utiles", "liens", "start", "accueil"];

  const ICON = {
    folder: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 4.4a1 1 0 0 1 1-1h3.1l1.5 1.7h5.9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/></svg>',
    // Le dossier hôte du tableau de bord porte la marque de la section (le
    // quadrillage du rail) : il se reconnaît au premier coup d'œil, comme un
    // favicon — Chrome ne permet pas d'en poser un sur un dossier de favoris.
    dash: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg>',
    caret: '<svg class="db-chip-caret" aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5 8 10.5 12 6.5"/></svg>',
    plus: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>',
    dots: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.6" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="12.4" r="1.4"/></svg>',
    arrow: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    external: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h5v5M14 2 7 9"/><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/></svg>',
    pencil: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.6 11.9l-2.7.7.7-2.7z"/></svg>',
    copy: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.4"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
    trash: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6.5 2.5h3M4.2 4l.7 9.2c0 .4.4.8.8.8h4.6c.4 0 .8-.4.8-.8L11.8 4M6.5 7v4.5M9.5 7v4.5"/></svg>',
    link: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 9.4a3.2 3.2 0 0 0 4.5 0l2-2a3.2 3.2 0 0 0-4.5-4.5l-.9.9"/><path d="M9.4 6.6a3.2 3.2 0 0 0-4.5 0l-2 2a3.2 3.2 0 0 0 4.5 4.5l.9-.9"/></svg>',
    up: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4 7.5 8 3.5l4 4"/></svg>',
    down: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M4 8.5l4 4 4-4"/></svg>',
    wider: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4 3 8l3 4M10 4l3 4-3 4"/></svg>',
    shrink: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l3 4-3 4M11 4l-3 4 3 4"/></svg>',
  };

  const storage = {
    get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
    set: (obj) => chrome.storage.local.set(obj),
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function faviconUrl(url, size = 32) {
    return `${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=${size}`;
  }
  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function plural(n, one, many) {
    return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
  }
  // Ponts vers app.js : utilisés s'ils existent pour rester cohérent avec le
  // reste de l'app (même poubelle, mêmes réglages, même rescan suspendu).
  function toast(msg) {
    const fn = window.BSToast;
    if (typeof fn === "function") return fn(msg);
    const box = document.getElementById("toast");
    if (!box) return;
    box.textContent = msg;
    box.classList.remove("hidden");
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.add("hidden"), 3000);
  }
  // withSuppressedRescan (app.js) ne supporte pas l'empilement : un garde local
  // évite qu'un appel imbriqué ne réactive le rescan trop tôt.
  let rescanGuard = false;
  function withoutRescan(fn) {
    const wrap = window.BSSuppressRescan;
    if (typeof wrap !== "function" || rescanGuard) return fn();
    rescanGuard = true;
    return wrap(fn).finally(() => { rescanGuard = false; });
  }
  async function bury(bookmarks, reason) {
    const fn = window.BSBuryBookmarks;
    if (typeof fn === "function") return fn(bookmarks, reason);
    for (const b of bookmarks) {
      try { await chrome.bookmarks.remove(b.id); } catch { /* déjà retiré */ }
    }
  }
  // Après une modification, le tableau de bord se redessine et le reste de
  // l'app (inventaire, galerie, doublons, liens morts) se recalcule : les
  // écritures du tableau de bord sont suspendues au rescan automatique, comme
  // celles de la galerie.
  async function afterChange() {
    await render();
    window.BSRefresh?.();
  }

  /* ---------- état ---------- */

  let root = null;          // conteneur #dashboard-root
  let chipHost = null;      // emplacement de la puce « dossier courant » (en-tête)
  let actionHost = null;    // emplacement de la recherche et des boutons (en-tête)
  let folderId = null;      // dossier affiché (toujours à plat)
  let folderTitle = "";
  let model = null;         // { cats: [{name, links, end}], rootLinks, rootEnd, total }
  let checks = {};
  let search = "";
  let mounted = false;
  let renderToken = 0;
  let dragState = null;     // { id, fromIndex, fromCat }
  let cardDrag = null;      // { name } — carte de catégorie tirée par son titre
  let spans = {};           // largeur des cartes par catégorie (colonnes de grille)
  let view = "list";        // affichage : index typographique (« list ») ou cartes (« cards »)
  let popup = null;
  let formTarget = null;    // nom de la catégorie dont le formulaire est ouvert
  let newCategoryPending = false;

  /* ---------- réglages ---------- */

  async function loadSettings() {
    const saved = (await storage.get(STORE_KEY)) || {};
    return {
      folderId: typeof saved.folderId === "string" ? saved.folderId : null,
      openIn: saved.openIn === "current" ? "current" : "new",
      view: saved.view === "cards" ? "cards" : "list",
      cats: Array.isArray(saved.cats) ? saved.cats.filter((n) => typeof n === "string" && n) : [],
      spans: saved.spans && typeof saved.spans === "object"
        ? Object.fromEntries(Object.entries(saved.spans).filter(([, n]) => Number.isInteger(n) && n >= 2).map(([name, n]) => [name, Math.min(n, 12)]))
        : {},
    };
  }
  async function saveSettings(patch) {
    const cur = await loadSettings();
    await storage.set({ [STORE_KEY]: { ...cur, ...patch } });
  }

  // Tous les dossiers de favoris, avec leur chemin, pour les listes de choix.
  async function listFolders() {
    const tree = await chrome.bookmarks.getTree();
    const out = [];
    const walk = (node, path) => {
      for (const child of node.children || []) {
        if (child.url) continue;
        const next = [...path, child.title || "(sans nom)"];
        out.push({ id: child.id, path: next, empty: !(child.children || []).length });
        walk(child, next);
      }
    };
    walk(tree[0], []);
    return out;
  }

  async function findDefaultFolder() {
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0].children || [];
    const byId = new Map(roots.map((r) => [r.id, r]));
    for (const id of ["1", "2", "3"]) {
      const bar = byId.get(id);
      if (!bar) continue;
      const hit = (bar.children || []).find((c) => !c.url && DEFAULT_TITLES.includes(String(c.title || "").trim().toLowerCase()));
      if (hit) return hit;
    }
    return null;
  }

  // Dossier « Autres favoris » (même choix que la poubelle de l'app).
  async function otherBookmarksId() {
    const rootNode = (await chrome.bookmarks.getTree())[0];
    const other = (rootNode.children || []).find((c) => !c.url && c.id !== "1");
    return other ? other.id : "1";
  }

  async function resolveFolder() {
    const settings = await loadSettings();
    if (settings.folderId) {
      try {
        const [node] = await chrome.bookmarks.get(settings.folderId);
        if (node && !node.url) {
          folderId = node.id;
          folderTitle = node.title || "(sans nom)";
          return true;
        }
      } catch { /* dossier supprimé depuis : on retombe sur la détection */ }
    }
    const found = await findDefaultFolder();
    if (found) {
      folderId = found.id;
      folderTitle = found.title || "Dashboard";
      await saveSettings({ folderId: folderId });
      return true;
    }
    folderId = null;
    folderTitle = "";
    return false;
  }

  async function setFolder(id) {
    await saveSettings({ folderId: id });
    newCategoryPending = false;
    await render();
  }

  /* ---------- préfixes de catégorie ---------- */

  // « Travail — GitHub » → { cat: "Travail", title: "GitHub" } ; le premier
  // séparateur coupe, le reste du titre reste libre (d'autres « — » peuvent suivre).
  function parseTitle(raw) {
    const s = String(raw == null ? "" : raw);
    const i = s.indexOf(SEP);
    if (i <= 0) return { cat: null, title: s };
    const cat = s.slice(0, i).trim();
    const title = s.slice(i + SEP.length).trim();
    if (!cat || !title) return { cat: null, title: s };
    return { cat, title };
  }
  function composeTitle(cat, title) {
    return cat ? `${cat}${SEP}${title}` : title;
  }

  /* ---------- modèle ---------- */

  // Un dossier doit rester à plat : les sous-dossiers qui traînent (ancien
  // usage ou créés à la main dans Chrome) sont aplanis — chaque lien remonte
  // avec le nom de son dossier en préfixe, puis les dossiers sont retirés.
  async function flattenFolder(node) {
    const subs = (node.children || []).filter((c) => !c.url);
    if (!subs.length) return 0;
    let moved = 0;
    const collect = (folder, leaf) => {
      const out = [];
      for (const child of folder.children || []) {
        if (child.url) out.push({ id: child.id, raw: child.title || "", leaf });
        else out.push(...collect(child, child.title || "(sans nom)"));
      }
      return out;
    };
    await withoutRescan(async () => {
      for (const sub of subs) {
        for (const item of collect(sub, sub.title || "(sans nom)")) {
          const { title } = parseTitle(item.raw);
          try {
            await chrome.bookmarks.update(item.id, { title: composeTitle(item.leaf, title) });
            await chrome.bookmarks.move(item.id, { parentId: node.id });
            moved += 1;
          } catch { /* déjà parti */ }
        }
      }
      for (const sub of subs) {
        try { await chrome.bookmarks.removeTree(sub.id); } catch { /* déjà retiré */ }
      }
    });
    return moved;
  }

  async function loadModel() {
    if (!folderId) return null;
    const [node] = await chrome.bookmarks.getSubTree(folderId);
    const links = [];
    for (const child of node.children || []) {
      if (!child.url) continue; // défensif : le dossier doit rester à plat
      const parsed = parseTitle(child.title || "");
      links.push({ id: child.id, url: child.url, rawTitle: child.title || "", title: parsed.title || child.url, cat: parsed.cat, index: links.length });
    }
    const settings = await loadSettings();
    spans = settings.spans;
    view = settings.view;
    const cats = [...settings.cats];
    for (const link of links) {
      if (link.cat && !cats.includes(link.cat)) cats.push(link.cat);
    }
    const catCards = cats.map((name) => {
      const own = links.filter((l) => l.cat === name);
      return { name, links: own, end: own.length ? own[own.length - 1].index + 1 : links.length };
    });
    const rootLinks = links.filter((l) => !l.cat);
    if (cats.join("\n") !== settings.cats.join("\n")) await saveSettings({ cats });
    return { cats: catCards, rootLinks, rootEnd: rootLinks.length ? rootLinks[rootLinks.length - 1].index + 1 : 0, total: links.length };
  }

  function findLink(id) {
    if (!model) return null;
    for (const cat of model.cats) {
      const hit = cat.links.find((l) => l.id === id);
      if (hit) return hit;
    }
    return model.rootLinks.find((l) => l.id === id) || null;
  }

  /* ---------- aperçu de la page au survol ---------- */

  // Au survol d'un lien, un panneau flottant montre la page : même miniature
  // que la galerie (pont app.js → cache mshots de 30 jours), repli favicon si
  // le pont manque ou en mode « favicons uniquement ». Le panneau n'intercepte
  // pas le pointeur : c'est un coup d'œil, pas un dock.
  let previewBox = null;
  let previewTimer = 0;

  function hidePreview() {
    clearTimeout(previewTimer);
    previewBox?.remove();
    previewBox = null;
  }

  function placePreview(box, row) {
    const rect = row.getBoundingClientRect();
    box.style.visibility = "hidden";
    const w = box.offsetWidth || 264;
    const h = box.offsetHeight || 190;
    let left = rect.right + 12;
    if (left + w > window.innerWidth - 8) left = rect.left - w - 12;
    if (left < 8) { hidePreview(); return; } // pas de place : pas d'aperçu
    let top = rect.top + rect.height / 2 - h / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
    box.style.visibility = "visible";
  }

  async function showPreview(row, bm) {
    const box = el("div", "db-preview");
    const shot = el("img");
    shot.alt = "";
    box.appendChild(shot);
    box.append(el("p", "db-preview-title", esc(bm.title)), el("p", "db-preview-url", esc(bm.url)));
    document.body.appendChild(box);
    previewBox = box;
    placePreview(box, row);
    if (previewBox !== box) return;
    const bridge = window.BSThumbPreview;
    const info = bridge ? await bridge(bm.url).catch(() => null) : null;
    if (previewBox !== box) return; // le pointeur est reparti pendant le chargement
    const { src, kind } = info || { src: faviconUrl(bm.url, 64), kind: "favicon" };
    box.classList.toggle("db-preview-favicon", kind === "favicon");
    shot.src = src;
    shot.onerror = () => {
      if (previewBox !== box) return;
      box.classList.add("db-preview-favicon");
      shot.src = faviconUrl(bm.url, 64);
    };
    placePreview(box, row); // la taille change avec le mode favicon
  }

  function bindPreview(row, bm) {
    if (matchMedia("(hover: none)").matches) return; // tactile : pas de survol
    row.addEventListener("pointerenter", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        hidePreview();
        showPreview(row, bm);
      }, 240);
    });
    row.addEventListener("pointerleave", hidePreview);
    row.addEventListener("dragstart", hidePreview);
    row.addEventListener("click", hidePreview);
  }

  /* ---------- ouverture des liens ---------- */

  async function openLink(url) {
    const settings = await loadSettings();
    if (settings.openIn === "current") {
      const tab = await chrome.tabs.getCurrent().catch(() => null);
      if (tab && tab.id != null) {
        await chrome.tabs.update(tab.id, { url: url });
        return;
      }
    }
    await chrome.tabs.create({ url: url });
  }

  // Onglet à ranger : l'onglet actif de la fenêtre, sauf si c'est l'extension
  // elle-même (le tableau de bord est une page « nouvel onglet ») — auquel cas
  // le dernier onglet web utilisé prend sa place.
  async function targetTab() {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const usable = (t) => t && /^https?:/i.test(t.url || "");
    if (usable(active)) return active;
    const others = (await chrome.tabs.query({}).catch(() => []))
      .filter((t) => t.id !== active?.id && usable(t))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return others[0] || null;
  }

  async function addCurrentTab(catName) {
    const tab = await targetTab();
    if (!tab) {
      toast("Aucun onglet web à ajouter.");
      return;
    }
    const title = composeTitle(catName, tab.title || tab.url);
    await withoutRescan(() => chrome.bookmarks.create({ parentId: folderId, title, url: tab.url }));
    toast(catName ? `« ${tab.title || tab.url} » ajouté dans « ${catName} ».` : `« ${tab.title || tab.url} » ajouté.`);
    await afterChange();
  }

  /* ---------- menu contextuel ---------- */

  function closePopup() {
    if (!popup) return;
    popup.remove();
    popup = null;
    document.removeEventListener("pointerdown", onPopupPointer, true);
    document.removeEventListener("keydown", onPopupKey, true);
    window.removeEventListener("resize", closePopup);
    window.removeEventListener("scroll", closePopup, true);
  }
  function onPopupPointer(event) {
    if (popup && !popup.contains(event.target)) closePopup();
  }
  function onPopupKey(event) {
    if (event.key === "Escape") closePopup();
  }
  function openPopup(anchor, items) {
    closePopup();
    popup = el("div", "db-popup");
    popup.setAttribute("role", "menu");
    for (const item of items) {
      if (item.sep) {
        popup.appendChild(el("hr"));
        continue;
      }
      const button = el("button", item.danger ? "db-danger" : "", `${item.icon || ""}<span>${esc(item.label)}</span>`);
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.addEventListener("click", () => {
        closePopup();
        item.onSelect();
      });
      popup.appendChild(button);
    }
    document.body.appendChild(popup);
    const rect = anchor.getBoundingClientRect();
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    let left = rect.right - width;
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    popup.style.top = `${top}px`;
    anchor.setAttribute("aria-expanded", "true");
    popup.querySelector("button")?.focus();
    document.addEventListener("pointerdown", onPopupPointer, true);
    document.addEventListener("keydown", onPopupKey, true);
    window.addEventListener("resize", closePopup);
    window.addEventListener("scroll", closePopup, true);
  }

  /* ---------- formulaires en place ---------- */

  function inlineForm(fields, { submitLabel = "Ajouter", onSubmit, onClose }) {
    const form = el("form", "db-inline-form");
    const inputs = fields.map((field) => {
      const input = el("input");
      input.type = "text";
      input.placeholder = field.placeholder;
      input.value = field.value || "";
      input.setAttribute("aria-label", field.placeholder);
      if (field.mono) input.style.fontFamily = "var(--mono)";
      form.appendChild(input);
      return input;
    });
    const actions = el("div", "db-form-actions");
    const ok = el("button", "btn btn-primary btn-sm", esc(submitLabel));
    ok.type = "submit";
    const cancel = el("button", "btn btn-ghost btn-sm", "Annuler");
    cancel.type = "button";
    actions.append(ok, cancel);
    form.appendChild(actions);
    const close = () => { form.remove(); onClose?.(); };
    cancel.addEventListener("click", close);
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = inputs.map((i) => i.value.trim());
      ok.disabled = true;
      const done = await onSubmit(values);
      if (done) close();
      else ok.disabled = false;
    });
    setTimeout(() => inputs[0]?.focus(), 0);
    return form;
  }

  function addLinkForm(cat, onDone) {
    return inlineForm(
      [{ placeholder: "Titre du lien" }, { placeholder: "https://exemple.com", mono: true }],
      {
        submitLabel: "Ajouter le lien",
        onClose: onDone,
        onSubmit: async ([title, url]) => {
          if (!url) {
            toast("Adresse manquante.");
            return false;
          }
          const clean = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
          try {
            new URL(clean);
          } catch {
            toast("Adresse invalide.");
            return false;
          }
          const raw = composeTitle(cat.root ? null : cat.name, title || clean);
          await withoutRescan(() => chrome.bookmarks.create({ parentId: folderId, title: raw, url: clean }));
          toast(cat.root ? "Lien ajouté." : `Lien ajouté dans « ${cat.name} ».`);
          await afterChange();
          return true;
        },
      }
    );
  }

  // Renommage en place : le titre devient un champ, Entrée valide, Échap annule.
  function startRename(node, current, apply) {
    const input = el("input");
    input.type = "text";
    input.value = current;
    input.setAttribute("aria-label", "Nouveau titre");
    input.style.cssText = "flex:1 1 auto;min-width:0;font:600 13px var(--sans);padding:3px 6px;border:1px solid #52525b;border-radius:6px;background:var(--bg);color:var(--fg);outline:none";
    node.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const cancel = () => {
      if (done) return;
      done = true;
      input.replaceWith(node);
    };
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") { event.stopPropagation(); cancel(); return; }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const value = input.value.trim();
      if (!value || value === current) { cancel(); return; }
      done = true;
      input.disabled = true;
      await apply(value);
      await afterChange();
    });
    input.addEventListener("blur", cancel);
  }

  /* ---------- déplacements ---------- */

  function clearDropHints() {
    root?.querySelectorAll(".db-drop-before, .db-drop-after, .db-drop-tail").forEach((n) => {
      n.classList.remove("db-drop-before", "db-drop-after", "db-drop-tail");
    });
  }

  // chrome.bookmarks.move demande l'index d'arrivée, la liste étant déjà privée
  // de l'élément déplacé : un index calculé sur la liste d'origine est donc
  // décalé d'un cran quand la source était plus haut.
  function dropIndex(state, index) {
    return state.fromIndex < index ? index - 1 : index;
  }

  function bindDrag(row, bm, cat) {
    row.draggable = true;
    row.addEventListener("dragstart", (event) => {
      dragState = { id: bm.id, fromIndex: bm.index, fromCat: cat.root ? null : cat.name };
      row.classList.add("db-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", bm.url);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("db-dragging");
      dragState = null;
      clearDropHints();
    });
    row.addEventListener("dragover", (event) => {
      if (!dragState || dragState.id === bm.id) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      clearDropHints();
      row.classList.add(after ? "db-drop-after" : "db-drop-before");
    });
    row.addEventListener("drop", async (event) => {
      if (!dragState || dragState.id === bm.id) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      const state = dragState;
      clearDropHints();
      dragState = null;
      const index = dropIndex(state, bm.index + (after ? 1 : 0));
      if (state.fromCat === (cat.root ? null : cat.name)) await moveTo(state.id, index);
      else await moveBetween(state.id, cat, index);
    });
  }

  function bindCategoryDrop(zone, cat) {
    zone.addEventListener("dragover", (event) => {
      if (!dragState) return;
      if (event.target.closest(".db-link")) return; // une ligne précise l'emporte
      event.preventDefault();
      clearDropHints();
      zone.classList.add("db-drop-tail");
    });
    zone.addEventListener("dragleave", (event) => {
      if (event.target.closest?.(".db-link")) return;
      zone.classList.remove("db-drop-tail");
    });
    zone.addEventListener("drop", async (event) => {
      if (!dragState || event.target.closest(".db-link")) return;
      event.preventDefault();
      const state = dragState;
      clearDropHints();
      dragState = null;
      const index = dropIndex(state, cat.end);
      if (state.fromCat === (cat.root ? null : cat.name)) await moveTo(state.id, index);
      else await moveBetween(state.id, cat, index);
    });
  }

  // chrome.bookmarks.move demande l'index d'arrivée ; selon Chrome, la position
  // obtenue peut être décalée d'un cran. On relit les enfants et on corrige
  // avec l'écart mesuré — le résultat visé est toujours la position demandée.
  async function moveTo(id, index) {
    await withoutRescan(async () => {
      try {
        await chrome.bookmarks.move(id, { parentId: folderId, index });
        const kids = await chrome.bookmarks.getChildren(folderId);
        const actual = kids.findIndex((k) => k.id === id);
        const wanted = Math.min(index, kids.length - 1);
        if (actual !== -1 && actual !== wanted) {
          await chrome.bookmarks.move(id, { parentId: folderId, index: index - (actual - index) });
        }
      } catch {
        toast("Déplacement impossible.");
      }
    });
    await afterChange();
  }

  // Changement de catégorie = réécriture du préfixe, puis positionnement dans
  // la liste plate à l'endroit visé.
  async function moveBetween(id, cat, index) {
    const bm = findLink(id);
    if (!bm) {
      toast("Lien introuvable.");
      return;
    }
    const { title } = parseTitle(bm.rawTitle);
    const newTitle = composeTitle(cat.root ? null : cat.name, title);
    if (newTitle !== bm.rawTitle) {
      try {
        await withoutRescan(() => chrome.bookmarks.update(id, { title: newTitle }));
      } catch {
        toast("Renommage impossible.");
        return;
      }
    }
    await moveTo(id, index);
  }

  /* ---------- catégories et suppression ---------- */

  // Renommer une catégorie réécrit le préfixe de chacun de ses liens.
  async function renameCategory(cat, name) {
    const clean = name.trim();
    if (!clean || clean === cat.name) return;
    const cats = (await loadSettings()).cats;
    if (cats.includes(clean)) {
      toast("Une catégorie porte déjà ce nom.");
      return;
    }
    await withoutRescan(async () => {
      for (const link of cat.links) {
        try { await chrome.bookmarks.update(link.id, { title: composeTitle(clean, link.title) }); } catch { /* déjà parti */ }
      }
    });
    await saveSettings({ cats: cats.map((n) => (n === cat.name ? clean : n)) });
    toast(`Catégorie « ${cat.name} » renommée en « ${clean} » — ${plural(cat.links.length, "titre mis à jour", "titres mis à jour")}.`);
  }

  // Supprimer une catégorie retire le préfixe : les liens restent dans le
  // dossier, en « Sans catégorie ». Rien n'est supprimé des favoris.
  async function deleteCategory(cat) {
    const message = cat.links.length
      ? `Supprimer la catégorie « ${cat.name} » ? Ses ${plural(cat.links.length, "lien", "liens")} restent dans le dossier, sans préfixe (carte « ${ROOT_NAME} »).`
      : `Supprimer la catégorie vide « ${cat.name} » ?`;
    if (!confirm(message)) return;
    await withoutRescan(async () => {
      for (const link of cat.links) {
        try { await chrome.bookmarks.update(link.id, { title: link.title }); } catch { /* déjà parti */ }
      }
    });
    await saveSettings({ cats: (await loadSettings()).cats.filter((n) => n !== cat.name) });
    toast(`Catégorie « ${cat.name} » supprimée.`);
    await afterChange();
  }

  // L'ordre des catégories est présentationnel : on réordonne la liste locale.
  async function moveCategory(cat, delta) {
    const cats = (await loadSettings()).cats;
    const i = cats.indexOf(cat.name);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    await saveSettings({ cats });
    await render();
  }

  /* ---------- cartes : largeur et ordre ---------- */

  function gridInfo() {
    const grid = root?.querySelector(".db-grid");
    if (!grid) return { columns: 1, unit: 1 };
    // auto-fit replie les pistes vides : seules les pistes visibles comptent.
    const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").map(parseFloat).filter((width) => width > 0);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const width = tracks.length ? Math.min(...tracks) : grid.clientWidth;
    return { columns: Math.max(1, tracks.length), unit: width + gap || 1 };
  }

  // Largeur d'une carte en colonnes de grille, mémorisée par catégorie.
  async function changeSpan(cat, next) {
    const { columns } = gridInfo();
    const current = Math.min(spans[cat.name] || 1, columns);
    const span = Math.max(1, Math.min(next, columns));
    if (span === current) {
      toast(next > current ? "La carte est déjà à la largeur maximale." : "La carte est déjà sur une seule colonne.");
      return;
    }
    const nextSpans = { ...spans };
    if (span <= 1) delete nextSpans[cat.name];
    else nextSpans[cat.name] = span;
    spans = nextSpans;
    await saveSettings({ spans: nextSpans });
    toast(span === columns ? "Carte sur toute la largeur." : span === 1 ? "Carte sur une seule colonne." : `Carte sur ${span} colonnes.`);
    await render();
  }

  function clearCardDropHints() {
    root?.querySelectorAll(".db-card-drop-before, .db-card-drop-after").forEach((node) => {
      node.classList.remove("db-card-drop-before", "db-card-drop-after");
    });
  }

  // Réordonne settings.cats : la carte visée accueille la carte tirée avant ou
  // après elle ; viser la carte « Sans catégorie » (toujours en tête) renvoie
  // la carte tirée en première position.
  async function reorderCategory(name, target, after) {
    const cats = (await loadSettings()).cats.filter((n) => n !== name);
    let index = cats.indexOf(target.name);
    if (index === -1) index = 0;
    else if (after) index += 1;
    cats.splice(index, 0, name);
    await saveSettings({ cats });
    await render();
  }

  // Poignée du bord droit : la largeur suit le pointeur par pas de colonnes,
  // un badge nomme la largeur visée, le relâchement mémorise.
  function bindResize(handle, card, cat) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const { columns, unit } = gridInfo();
      const startWidth = card.getBoundingClientRect().width;
      const startX = event.clientX;
      let span = Math.min(spans[cat.name] || 1, columns);
      let moved = false;
      card.classList.add("db-resizing");
      const badge = el("span", "db-span-badge");
      const label = () => { badge.textContent = span >= columns ? "toute la largeur" : span === 1 ? "1 colonne" : `${span} colonnes`; };
      label();
      card.appendChild(badge);
      const apply = () => {
        card.style.gridColumn = span > 1 ? `span ${span}` : "auto";
        label();
      };
      const onMove = (e) => {
        moved = true;
        const next = Math.max(1, Math.min(columns, Math.round((startWidth + e.clientX - startX) / unit)));
        if (next !== span) { span = next; apply(); }
      };
      const finish = async (discard) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        badge.remove();
        card.classList.remove("db-resizing");
        if (discard) { await render(); return; }
        if (!moved) return;
        const nextSpans = { ...spans };
        if (span <= 1) delete nextSpans[cat.name];
        else nextSpans[cat.name] = span;
        spans = nextSpans;
        await saveSettings({ spans: nextSpans });
        await render();
      };
      const onUp = () => finish(false);
      const onCancel = () => finish(true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    });
  }

  async function removeLink(bm) {
    if (!confirm(`Supprimer « ${bm.title} » ? Le favori part à la poubelle de PK Web Memory, d'où il peut être restauré.`)) return;
    await bury([{ id: bm.id, url: bm.url, title: bm.title, path: [] }], "supprimé");
    toast("Favori supprimé.");
    await afterChange();
  }

  /* ---------- rendu ---------- */

  function chipMarkup() {
    const cats = model ? model.cats.length + (model.rootLinks.length ? 1 : 0) : 0;
    const links = model ? model.total : 0;
    if (!folderId) {
      return `<button class="db-chip db-chip-empty" type="button">${ICON.dash}<span class="db-chip-name">Choisir un dossier de liens utiles</span>${ICON.caret}</button>`;
    }
    const meta = model ? `<span class="db-chip-meta">· ${plural(cats, "catégorie", "catégories")} · ${plural(links, "lien", "liens")}</span>` : "";
    return `<button class="db-chip" type="button" title="Dossier de favoris affiché — ouvrir ses réglages">${ICON.dash}<span class="db-chip-name">${esc(folderTitle)}</span>${meta}${ICON.caret}</button>`;
  }

  function renderChip() {
    if (!chipHost) return;
    chipHost.innerHTML = chipMarkup();
    chipHost.querySelector(".db-chip")?.addEventListener("click", () => {
      if (!folderId) {
        renderSetup();
        root?.querySelector("#db-pick")?.focus();
        return;
      }
      openPopup(chipHost.querySelector(".db-chip"), [
        { label: "Changer de dossier…", icon: ICON.folder, onSelect: () => { renderSetup(true); } },
        { label: "Réglages du tableau de bord", icon: ICON.pencil, onSelect: () => window.BSOpenSettingsBlock?.("dashboard") },
        { sep: true },
        { label: "Ouvrir le gestionnaire de favoris Chrome", icon: ICON.external, onSelect: () => chrome.tabs.create({ url: "chrome://bookmarks/" }) },
      ]);
    });
  }

  function renderToolbar() {
    if (!actionHost) return;
    actionHost.innerHTML = "";
    if (!folderId) return;
    const searchBox = el("label", "db-search");
    searchBox.innerHTML = '<span aria-hidden="true">⌕</span>';
    const input = el("input");
    input.type = "search";
    input.id = "db-search";
    input.placeholder = "Filtrer les liens…";
    input.setAttribute("aria-label", "Filtrer les liens du tableau de bord");
    input.value = search;
    input.addEventListener("input", () => {
      search = input.value;
      renderGrid();
    });
    searchBox.appendChild(input);
    const viewBox = el("div", "db-view");
    viewBox.title = "Affichage du tableau de bord";
    for (const [mode, label] of [["list", "Liste"], ["cards", "Cartes"]]) {
      const btn = el("button", "db-view-btn" + (view === mode ? " active" : ""), label);
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(view === mode));
      btn.addEventListener("click", () => setView(mode));
      viewBox.appendChild(btn);
    }
    const addTab = el("button", "btn btn-ghost btn-sm", `${ICON.plus} Onglet courant`);
    addTab.type = "button";
    addTab.title = `Ajouter l'onglet web courant, sans catégorie (carte « ${ROOT_NAME} »)`;
    addTab.addEventListener("click", () => addCurrentTab(null));
    const addCat = el("button", "btn btn-ghost btn-sm", `${ICON.plus} Nouvelle catégorie`);
    addCat.type = "button";
    addCat.title = "Créer une catégorie : un préfixe de nom (« Travail — Lien »), pas un sous-dossier";
    addCat.addEventListener("click", () => {
      newCategoryPending = true;
      renderGrid();
    });
    actionHost.append(viewBox, searchBox, addTab, addCat);
  }

  async function setView(next) {
    if (view === next) return;
    view = next;
    await saveSettings({ view });
    renderToolbar();
    renderGrid();
  }

  function matches(bm) {
    if (!search) return true;
    const q = search.toLowerCase();
    return bm.title.toLowerCase().includes(q) || bm.url.toLowerCase().includes(q);
  }

  function linkRow(bm, cat) {
    const row = el("div", "db-link");
    row.dataset.id = bm.id;
    const link = el("a", "db-link-a");
    link.href = bm.url;
    link.title = bm.rawTitle && bm.rawTitle !== bm.title ? `${bm.url}\nFavori : « ${bm.rawTitle} »` : bm.url;
    link.innerHTML = `<span class="db-fav"><img loading="lazy" alt="" src="${esc(faviconUrl(bm.url))}">${ICON.arrow}</span><span class="db-link-title">${esc(bm.title)}</span>`;
    link.querySelector("img")?.addEventListener("error", (event) => event.target.remove());
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openLink(bm.url);
    });
    // Le clic milieu garde son comportement natif : ouverture en arrière-plan.
    const menu = el("button", "db-icon-btn db-link-menu", ICON.dots);
    menu.type = "button";
    menu.title = "Plus d'actions";
    menu.setAttribute("aria-label", `Plus d'actions pour ${bm.title}`);
    menu.setAttribute("aria-haspopup", "menu");
    menu.setAttribute("aria-expanded", "false");
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      hidePreview();
      openPopup(menu, [
        { label: "Ouvrir dans un nouvel onglet", icon: ICON.external, onSelect: () => chrome.tabs.create({ url: bm.url }) },
        { label: "Renommer…", icon: ICON.pencil, onSelect: () => startRename(title, bm.title, (value) => chrome.bookmarks.update(bm.id, { title: composeTitle(bm.cat, value) })) },
        { label: "Copier l'adresse", icon: ICON.copy, onSelect: async () => { await navigator.clipboard.writeText(bm.url); toast("Adresse copiée."); } },
        { label: "Déplacer vers le haut", icon: ICON.up, onSelect: () => moveTo(bm.id, 0) },
        { sep: true },
        { label: "Supprimer", icon: ICON.trash, danger: true, onSelect: () => removeLink(bm) },
      ]);
    });
    const title = link.querySelector(".db-link-title");
    title.addEventListener("dblclick", (event) => {
      event.preventDefault();
      startRename(title, bm.title, (value) => chrome.bookmarks.update(bm.id, { title: composeTitle(bm.cat, value) }));
    });
    if (checks[bm.url]?.s === "dead") {
      row.classList.add("db-link-dead");
      link.title = `${bm.url}\nLien mort confirmé lors du dernier scan.`;
    }
    row.append(link, menu);
    bindDrag(row, bm, cat);
    bindPreview(row, bm);
    return row;
  }

  function categoryCard(cat) {
    const card = el("section", "db-cat");
    const span = view === "cards" ? spans[cat.name] : undefined;
    if (span > 1) card.style.gridColumn = `span ${span}`;
    const head = el("div", "db-cat-head");
    const title = el("h2", "db-cat-title");
    title.textContent = cat.name;
    title.title = cat.root
      ? "Liens sans préfixe de catégorie"
      : `Catégorie « ${cat.name} » — préfixe « ${cat.name}${SEP.trim()} » en tête des titres ; renommez par double-clic ou avec le crayon`;
    if (!cat.root) {
      title.addEventListener("dblclick", () => {
        startRename(title, cat.name, (value) => renameCategory(cat, value));
      });
    }
    const count = el("span", "db-cat-count", String(cat.links.length));
    const actions = el("div", "db-cat-actions");
    const addHere = el("button", "db-icon-btn", ICON.plus);
    addHere.type = "button";
    addHere.title = cat.root ? "Ajouter l'onglet courant, sans catégorie" : `Ajouter l'onglet courant dans « ${cat.name} »`;
    addHere.setAttribute("aria-label", cat.root ? "Ajouter l'onglet courant, sans catégorie" : `Ajouter l'onglet courant dans ${cat.name}`);
    addHere.addEventListener("click", () => addCurrentTab(cat.root ? null : cat.name));
    actions.append(addHere);
    if (!cat.root) {
      const rename = el("button", "db-icon-btn", ICON.pencil);
      rename.type = "button";
      rename.title = `Renommer la catégorie « ${cat.name} »`;
      rename.setAttribute("aria-label", `Renommer la catégorie ${cat.name}`);
      rename.addEventListener("click", () => startRename(title, cat.name, (value) => renameCategory(cat, value)));
      actions.append(rename);
    }
    const menu = el("button", "db-icon-btn", ICON.dots);
    menu.type = "button";
    menu.title = "Plus d'actions";
    menu.setAttribute("aria-label", cat.root ? "Plus d'actions pour les liens sans catégorie" : `Plus d'actions pour la catégorie ${cat.name}`);
    menu.setAttribute("aria-haspopup", "menu");
    menu.setAttribute("aria-expanded", "false");
    menu.addEventListener("click", () => {
      const items = [
        { label: "Ajouter l'onglet courant", icon: ICON.plus, onSelect: () => addCurrentTab(cat.root ? null : cat.name) },
        { label: "Ajouter un lien…", icon: ICON.link, onSelect: () => showForm(cat.name) },
      ];
      if (!cat.root) {
        items.push(
          { label: "Renommer la catégorie…", icon: ICON.pencil, onSelect: () => startRename(title, cat.name, (value) => renameCategory(cat, value)) },
        );
      }
      items.push(
          { sep: true },
          { label: "Carte plus large", icon: ICON.wider, onSelect: () => changeSpan(cat, (spans[cat.name] || 1) + 1) },
          { label: "Carte plus étroite", icon: ICON.shrink, onSelect: () => changeSpan(cat, (spans[cat.name] || 1) - 1) },
        );
      if (!cat.root) {
        items.push(
          { sep: true },
          { label: "Monter la catégorie", icon: ICON.up, onSelect: () => moveCategory(cat, -1) },
          { label: "Descendre la catégorie", icon: ICON.down, onSelect: () => moveCategory(cat, 1) },
          { sep: true },
          { label: "Supprimer la catégorie", icon: ICON.trash, danger: true, onSelect: () => deleteCategory(cat) },
        );
      }
      openPopup(menu, items);
    });
    actions.append(menu);
    head.append(title, count, actions);

    // Déplacer la carte en tirant son titre (la carte « Sans catégorie » reste
    // en tête) ; les boutons de l'en-tête restent cliquables.
    if (!cat.root) {
      head.draggable = true;
      head.classList.add("db-cat-draggable");
      head.addEventListener("dragstart", (event) => {
        if (event.target.closest("button, input")) { event.preventDefault(); return; }
        cardDrag = { name: cat.name };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", cat.name);
        card.classList.add("db-card-dragging");
      });
      head.addEventListener("dragend", () => {
        cardDrag = null;
        card.classList.remove("db-card-dragging");
        clearCardDropHints();
      });
    }
    card.addEventListener("dragover", (event) => {
      if (!cardDrag || cardDrag.name === cat.name || dragState) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      clearCardDropHints();
      card.classList.add(after ? "db-card-drop-after" : "db-card-drop-before");
    });
    card.addEventListener("drop", async (event) => {
      if (!cardDrag || cardDrag.name === cat.name || dragState) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      const name = cardDrag.name;
      cardDrag = null;
      clearCardDropHints();
      await reorderCategory(name, cat, after);
    });
    card.appendChild(head);

    const form = formFor(cat);
    if (form) card.appendChild(form);
    const list = el("div", "db-links");
    const visible = cat.links.filter(matches);
    if (!visible.length && !form) {
      list.appendChild(el("p", "db-cat-empty", search ? "Aucun lien ne correspond." : "Aucun lien — glissez-en un ici ou utilisez +."));
    }
    for (const bm of visible) list.appendChild(linkRow(bm, cat));
    card.appendChild(list);
    bindCategoryDrop(list, cat);
    // Poignée d'élargissement (bord droit) : la carte couvre plusieurs
    // colonnes de la grille, largeur mémorisée par catégorie.
    const resize = el("div", "db-cat-resize");
    resize.title = "Élargir ou rétrécir la carte (maintenir et tirer)";
    resize.setAttribute("aria-hidden", "true");
    card.appendChild(resize);
    bindResize(resize, card, cat);
    return card;
  }

  /* Formulaire « Ajouter un lien… » : ouvert depuis le menu d'une catégorie,
     refermé dès qu'il est validé ou annulé. La clé est le nom de catégorie. */
  function showForm(name) {
    formTarget = name;
    renderGrid();
    root?.querySelector(".db-inline-form input")?.focus();
  }
  function formFor(cat) {
    if (formTarget !== cat.name) return null;
    const close = () => {
      formTarget = null;
      renderGrid();
    };
    return addLinkForm(cat, close);
  }

  function newCategoryCard() {
    const card = el("section", "db-cat db-cat-new");
    const head = el("div", "db-cat-head");
    head.append(el("h2", "db-cat-title", "Nouvelle catégorie"));
    card.appendChild(head);
    const form = inlineForm([{ placeholder: "Nom de la catégorie (préfixe des titres)" }], {
      submitLabel: "Créer",
      onClose: () => {
        newCategoryPending = false;
        renderGrid();
      },
      onSubmit: async ([name]) => {
        const clean = name.trim();
        if (!clean) return false;
        const cats = (await loadSettings()).cats;
        if (cats.includes(clean)) {
          toast("Cette catégorie existe déjà.");
          return false;
        }
        await saveSettings({ cats: [...cats, clean] });
        newCategoryPending = false;
        toast(`Catégorie « ${clean} » créée — les liens prendront le préfixe « ${clean}${SEP.trim()} ».`);
        await afterChange();
        return true;
      },
    });
    card.appendChild(form);
    return card;
  }

  function renderGrid() {
    if (!root || !folderId || !model) return;
    hidePreview();
    root.innerHTML = "";
    if (!search) {
      const hint = el("p", "db-hint");
      hint.innerHTML = view === "list"
        ? `Les catégories sont des préfixes de nom : <strong>« Travail${SEP.trim()}Lien »</strong> range le lien dans « Travail », sans préfixe il reste en « ${esc(ROOT_NAME)} ». Le dossier « ${esc(folderTitle)} » reste à plat, sans sous-dossier ; basculez en <strong>Cartes</strong> pour élargir une catégorie à la poignée, les actions apparaissent au survol d'une ligne.`
        : `Les catégories sont des préfixes de nom : <strong>« Travail${SEP.trim()}Lien »</strong> range le lien dans « Travail », sans préfixe il reste en « ${esc(ROOT_NAME)} ». Le dossier « ${esc(folderTitle)} » reste à plat, sans sous-dossier ; élargissez une carte par sa poignée (bord droit), déplacez-la en tirant son titre, les autres actions apparaissent au survol.`;
      root.appendChild(hint);
    }
    const grid = el("div", view === "list" ? "db-grid db-grid-list" : "db-grid");
    const cats = [];
    if (model.rootLinks.length) cats.push({ root: true, name: ROOT_NAME, links: model.rootLinks, end: model.rootEnd });
    cats.push(...model.cats);
    let shown = 0;
    for (const cat of cats) {
      if (search && !cat.name.toLowerCase().includes(search.toLowerCase()) && !cat.links.some(matches)) continue;
      grid.appendChild(categoryCard(cat));
      shown += 1;
    }
    if (newCategoryPending) grid.appendChild(newCategoryCard());
    if (!shown && !newCategoryPending) {
      if (search) root.appendChild(el("p", "db-empty-search", `Aucun lien ne correspond à « ${esc(search)} ».`));
      else root.appendChild(el("p", "db-empty-search", `Le dossier « ${esc(folderTitle)} » est vide : créez une catégorie avec le bouton « Nouvelle catégorie », ou posez un lien avec « Onglet courant ».`));
      return;
    }
    root.appendChild(grid);
    // Une carte seule occupe toute la largeur : pas de carte minuscule perdue
    // dans un coin de la grille.
    if (view !== "list" && grid.children.length === 1) grid.firstElementChild.style.gridColumn = "1 / -1";
  }

  /* ---------- configuration du dossier ---------- */

  function setupState(compact = false) {
    const box = el("div", "db-state");
    const folders = setupFolders;
    const options = folders.map((f) => `<option value="${esc(f.id)}">${esc(f.path.join(" / "))}${f.empty ? " — vide" : ""}</option>`).join("");
    box.innerHTML = `
      <h2>${compact ? "Changer de dossier" : "Choisissez le dossier de vos liens utiles"}</h2>
      <p>Le tableau de bord est une vue sur un dossier de favoris Chrome, à plat : chaque catégorie est un préfixe de nom — « Travail${SEP.trim()}GitHub » — jamais un sous-dossier. Vous rangez ici ou dans le gestionnaire de favoris Chrome : c'est la même liste, synchronisée avec votre compte.</p>
      <ul>
        <li>« Nom${SEP.trim()}Titre » classe le lien dans « Nom » ; sans préfixe, il reste en « ${ROOT_NAME} ».</li>
        <li>Ajoutez l'onglet courant ou un lien à la main, renommez, réorganisez par glisser-déposer : le préfixe suit. Élargissez une carte par sa poignée, déplacez-la en tirant son titre.</li>
        <li>Des sous-dossiers qui traînent sont aplatis automatiquement, leur nom devenant le préfixe.</li>
      </ul>
      <div class="db-state-actions">
        <select id="db-pick" aria-label="Dossier de favoris à afficher">${options}</select>
        <button id="db-pick-ok" class="btn btn-ghost btn-sm" type="button">Utiliser ce dossier</button>
        <button id="db-create" class="btn btn-primary btn-sm" type="button">${ICON.dash} Créer le dossier « Dashboard »</button>
      </div>
      <p class="db-state-note">Le dossier est créé dans « Autres favoris », à la racine du tableau de bord : « Dashboard ».</p>`;
    box.querySelector("#db-pick-ok")?.addEventListener("click", async () => {
      const id = box.querySelector("#db-pick")?.value;
      if (!id) return;
      await setFolder(id);
    });
    box.querySelector("#db-create")?.addEventListener("click", async () => {
      const parentId = await otherBookmarksId();
      const node = await chrome.bookmarks.create({ parentId: parentId, title: "Dashboard" });
      await setFolder(node.id);
      toast("Dossier « Dashboard » créé dans Autres favoris.");
    });
    return box;
  }

  let setupFolders = [];
  async function renderSetup(compact = false) {
    if (!root) return;
    setupFolders = await listFolders();
    root.innerHTML = "";
    root.appendChild(setupState(compact));
  }

  /* ---------- cycle de vie ---------- */

  async function render() {
    if (!mounted) return;
    const token = ++renderToken;
    await resolveFolder();
    if (!folderId) {
      renderChip();
      renderToolbar();
      await renderSetup();
      return;
    }
    const [node] = await chrome.bookmarks.getSubTree(folderId);
    const flattened = await flattenFolder(node);
    const [next, nextChecks] = await Promise.all([loadModel(), storage.get("checks").then((c) => c || {})]);
    if (token !== renderToken) return;
    model = next;
    checks = nextChecks;
    renderChip();
    renderToolbar();
    renderGrid();
    if (flattened) toast(`Dossier aplati : ${plural(flattened, "lien sorti", "liens sortis")} des sous-dossiers, chaque catégorie est devenue un préfixe de nom.`);
  }

  function isVisible() {
    return !document.getElementById("section-dashboard")?.classList.contains("hidden");
  }

  // Les modifications de favoris viennent souvent du reste de l'app (nettoyages,
  // scans) : on ne redessine que si la page est à l'écran, elle se redessine de
  // toute façon à chaque ouverture de la section.
  function scheduleRender(delay = 250) {
    clearTimeout(scheduleRender._t);
    scheduleRender._t = setTimeout(() => { if (isVisible()) render(); }, delay);
  }

  function init(rootEl, chipElement, actionElement) {
    root = rootEl;
    chipHost = chipElement;
    actionHost = actionElement;
    if (!mounted) {
      mounted = true;
      for (const event of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
        chrome.bookmarks[event]?.addListener(() => scheduleRender());
      }
      window.addEventListener("scroll", hidePreview, true);
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") hidePreview(); });
    }
    return render();
  }

  // Réglages : liste des dossiers + mode d'ouverture des liens.
  async function mountSettings() {
    const select = document.getElementById("setting-dashboard-folder");
    const open = document.getElementById("setting-dashboard-open");
    const settings = await loadSettings();
    const folders = await listFolders();
    let known = false;
    select.replaceChildren();
    for (const folder of folders) {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.path.join(" / ");
      if (folder.id === settings.folderId) { option.selected = true; known = true; }
      select.appendChild(option);
    }
    if (!settings.folderId || !known) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Aucun dossier sélectionné — détection automatique";
      option.selected = true;
      select.prepend(option);
    }
    if (!select.dataset.bound) {
      select.dataset.bound = "1";
      select.addEventListener("change", async () => {
        await saveSettings({ folderId: select.value || null });
        if (mounted) await render();
        toast(select.value ? "Dossier du tableau de bord mis à jour." : "Détection automatique du dossier.");
      });
    }
    open.value = settings.openIn;
    if (!open.dataset.bound) {
      open.dataset.bound = "1";
      open.addEventListener("change", async () => {
        await saveSettings({ openIn: open.value });
      });
    }
    const goto = document.getElementById("setting-dashboard-goto");
    if (goto && !goto.dataset.bound) {
      goto.dataset.bound = "1";
      goto.addEventListener("click", () => {
        document.querySelector('.rail-tab[data-section="dashboard"]')?.click();
        window.scrollTo({ top: 0 });
      });
    }
  }

  window.BSDashboard = { init, render, scheduleRender, mountSettings };
})();
