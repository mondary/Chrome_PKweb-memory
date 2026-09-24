/* Bookmarks Sorter — vanilla JS, no build step. */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const SCAN_TIMEOUT = 15000;
const SCAN_CONCURRENCY = 12;
const DEAD_DAYS = 30;
const PAGE_SIZE = 60;

const manifest = chrome.runtime.getManifest();
const versionLabel = $("#app-version");
if (versionLabel) versionLabel.textContent = `v${manifest.version_name || manifest.version}`;

/* ---------- pure helpers ---------- */

function normalizeLevel(url, level) {
  let u;
  try { u = new URL(url.trim()); } catch { return url.trim(); }
  if (level <= 1) return url.trim();
  u.hash = "";
  if (level >= 3) {
    return "http://" + u.host.replace(/^www\./, "") + (u.pathname.replace(/\/+$/, "") || "/");
  }
  const tracking = /^(utm_|fbclid$|gclid$|msclkid$|dclid$|igshid$|ttclid$|ref$|ref_src$|ref_url$|si$|spm$|scm$|mc_cid$|mc_eid$|_ga$|yclid$|twclid$)/;
  const keep = [...u.searchParams].filter(([k]) => !tracking.test(k));
  const qs = new URLSearchParams(keep).toString();
  return u.origin + u.pathname + (qs ? "?" + qs : "");
}

function flatten(nodes, path = [], out = []) {
  for (const n of nodes) {
    if (n.url) {
      out.push({ id: n.id, title: n.title, url: n.url, parentId: n.parentId, path: [...path] });
    } else if (n.children) {
      flatten(n.children, n.parentId === "0" ? path : [...path, n.title], out);
    }
  }
  return out;
}

function groupDuplicates(items, level) {
  const map = new Map();
  for (const b of items) {
    const key = normalizeLevel(b.url, level);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  }
  const groups = [];
  for (const members of map.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => Number(a.id) - Number(b.id));
    groups.push({ key: normalizeLevel(members[0].url, level), keep: members[0], duplicates: members.slice(1) });
  }
  groups.sort((a, b) => b.duplicates.length - a.duplicates.length);
  return groups;
}

function daysSince(ts) {
  return Math.floor((Date.now() - ts) / 86400000);
}

function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function faviconUrl(url, size = 32) {
  return `${chrome.runtime.getURL("_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}

function isLocalUrl(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0 || a === 192 && b === 168 || a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

const STATUS_META = {
  alive: {
    label: "Vivant",
    icon: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M5.2 8.2l2 2 3.6-4"/></svg>',
  },
  dead: {
    label: "Mort",
    icon: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>',
  },
  down: {
    label: "Hors ligne",
    icon: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
  },
};

function statusBadge(s) {
  const m = STATUS_META[s] || STATUS_META.down;
  return `<span class="status ${s}">${m.icon}${m.label}</span>`;
}

function thumbUrl(url) {
  return `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=400&h=300`;
}

const THUMB_TTL = 30 * 86400000;
let thumbWriteQueue = Promise.resolve();
async function cachedThumb(url, force = false) {
  const cache = (await storage.get("thumbnails")) || {};
  const hit = cache[url];
  if (!force && hit && hit.expires > Date.now()) return hit.src;
  const remote = thumbUrl(url);
  try {
    const response = await fetch(remote);
    if (!response.ok) return remote;
    const blob = await response.blob();
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    thumbWriteQueue = thumbWriteQueue.then(async () => {
      const latest = (await storage.get("thumbnails")) || {};
      latest[url] = { src, expires: Date.now() + THUMB_TTL, touched: Date.now() };
      const entries = Object.entries(latest).sort((a, b) => (b[1].touched || 0) - (a[1].touched || 0)).slice(0, 60);
      await storage.set({ thumbnails: Object.fromEntries(entries) });
    });
    await thumbWriteQueue;
    return src;
  } catch {
    return remote;
  }
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function netscapeExport(items) {
  const tree = {};
  for (const b of items) {
    let node = tree;
    for (const folder of b.path) {
      node._c = node._c || {};
      node = node._c[folder] = node._c[folder] || {};
    }
    (node._b = node._b || []).push(b);
  }
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>", "<H1>Bookmarks</H1>", "<DL><p>",
  ];
  const walk = (node, depth) => {
    const pad = "    ".repeat(depth);
    for (const [name, sub] of Object.entries(node._c || {})) {
      lines.push(`${pad}<DT><H3>${escapeHtml(name)}</H3>`, `${pad}<DL><p>`);
      walk(sub, depth + 1);
      lines.push(`${pad}</DL><p>`);
    }
    for (const b of node._b || []) {
      lines.push(`${pad}<DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="0">${escapeHtml(b.title)}</A>`);
    }
  };
  walk(tree, 1);
  lines.push("</DL><p>");
  return lines.join("\n");
}

function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- state ---------- */

let ALL = [];
let ACTIVE = [];
let CHECKS = {};
let dedupeKeepOverrides = new Map();
const QUARANTINE_FOLDERS = new Set(["Quarantaine — Bookmarks Sorter", "Corbeille — Bookmarks Sorter"]);
const isQuarantined = (bookmark) => bookmark.path.some((name) => QUARANTINE_FOLDERS.has(name));

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

/* ---------- tabs ---------- */

$$(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab.dataset.tab));
    if (tab.dataset.tab === "dedupe") renderDedupe();
    updateDedupeScrollCount();
  })
);

function openAppTab(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  tab?.click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#card-bookmarks").addEventListener("click", () => chrome.tabs.create({ url: "chrome://bookmarks/" }));
$("#card-folders").addEventListener("click", () => chrome.tabs.create({ url: "chrome://bookmarks/" }));
$("#card-duplicates").addEventListener("click", () => openAppTab("dedupe"));
$("#card-dead").addEventListener("click", () => openAppTab("dead"));

/* ---------- inventory ---------- */

function renderInventory() {
  const folders = new Map();
  const domains = new Map();
  const folderPaths = new Set();
  for (const b of ACTIVE) {
    const key = b.path.join("/") || "(racine)";
    folders.set(key, (folders.get(key) || 0) + 1);
    b.path.forEach((_, i) => folderPaths.add(b.path.slice(0, i + 1).join("/")));
    const d = domainOf(b.url);
    if (d) domains.set(d, (domains.get(d) || 0) + 1);
  }
  $("#stat-total").textContent = ACTIVE.length.toLocaleString("fr-FR");
  $("#stat-folders").textContent = folderPaths.size.toLocaleString("fr-FR");
  $("#stat-domains").textContent = domains.size.toLocaleString("fr-FR");
  $("#stat-dupes").textContent = groupDuplicates(ACTIVE, 1).reduce((n, g) => n + g.duplicates.length, 0);
  $("#stat-dead").textContent = ACTIVE.filter((b) => CHECKS[b.url]?.s === "dead" && !isLocalUrl(b.url)).length.toLocaleString("fr-FR");

  const ft = $("#folder-tree");
  ft.innerHTML = "";
  const rankLimit = Math.max(8, Math.min(80, Math.floor((window.innerHeight - 360) / 32)));
  const topFolders = [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, rankLimit);
  const maxFolder = topFolders[0]?.[1] || 1;
  topFolders.forEach(([path, n]) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    row.innerHTML = `<span class="rank-label" title="${escapeHtml(path)}">${escapeHtml(path)}</span><span class="rank-track"><span style="width:${Math.round(n / maxFolder * 100)}%"></span></span><span class="num">${n}</span>`;
    ft.appendChild(row);
  });

  const dl = $("#domain-list");
  dl.innerHTML = "";
  const topDomains = [...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, rankLimit);
  const maxDomain = topDomains[0]?.[1] || 1;
  topDomains.forEach(([d, n]) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    const site = /^https?:/.test(d) ? d : `https://${d}`;
    row.innerHTML = `<span class="favicon-slot" style="width:16px;height:16px;display:grid;place-items:center;flex:none"><img class="domain-favicon" src="${faviconUrl(site, 32)}" alt="" loading="lazy"><span class="favicon-fallback hidden" aria-hidden="true">${escapeHtml(d.slice(0, 1).toUpperCase())}</span></span><span class="rank-label" title="${escapeHtml(d)}">${escapeHtml(d)}</span><span class="rank-track"><span style="width:${Math.round(n / maxDomain * 100)}%"></span></span><span class="num">${n}</span>`;
    const icon = row.querySelector("img");
    icon.onerror = () => {
      if (icon.dataset.fallback) { icon.classList.add("hidden"); row.querySelector(".favicon-fallback").classList.remove("hidden"); }
      else { icon.dataset.fallback = "1"; icon.src = `chrome://favicon/size/32@1x/${site}`; }
    };
    dl.appendChild(row);
  });
}

/* ---------- gallery ---------- */

let galleryShown = 0;
let galleryFiltered = [];
let refreshThumbnails = false;
let galleryColumns = localStorage.getItem("galleryColumns") || "auto";

function renderGalleryFolderOptions() {
  const wrap = $("#gallery-folder-options");
  const folders = [...new Set(ACTIVE.map((b) => b.path.join("/") || "(racine)"))].sort();
  const current = wrap.querySelector("select")?.value ?? wrap.querySelector('[aria-pressed="true"]')?.dataset.galleryFolder ?? "";
  const choices = ["", ...folders];
  const selected = choices.includes(current) ? current : "";
  if (folders.length > 12) {
    wrap.innerHTML = `<label class="inline-control">Dossier <select id="gallery-folder-select" aria-label="Filtrer par dossier">${choices.map((folder) => `<option value="${escapeHtml(folder)}" ${folder === selected ? "selected" : ""}>${escapeHtml(folder || "Tous les dossiers")}</option>`).join("")}</select></label>`;
  } else {
    wrap.innerHTML = choices.map((folder) => `<button type="button" class="btn btn-ghost btn-sm gallery-folder-option${folder === selected ? " active" : ""}" data-gallery-folder="${escapeHtml(folder)}" aria-pressed="${folder === selected}">${escapeHtml(folder || "Tous les dossiers")}</button>`).join("");
  }
}

function galleryApply() {
  const q = $("#gallery-search").value.toLowerCase().trim();
  const folder = $("#gallery-folder-select")?.value ?? $("#gallery-folder-options [aria-pressed='true']")?.dataset.galleryFolder ?? "";
  galleryFiltered = ACTIVE.filter((b) => {
    if (folder !== "" && (b.path.join("/") || "(racine)") !== folder) return false;
    if (q && !b.title.toLowerCase().includes(q) && !b.url.toLowerCase().includes(q)) return false;
    return true;
  });
  galleryShown = 0;
  $("#gallery-grid").innerHTML = "";
  $("#gallery-count").textContent = `${galleryFiltered.length} résultats`;
  galleryMore();
}

function galleryMore() {
  const grid = $("#gallery-grid");
  const batch = galleryFiltered.slice(galleryShown, galleryShown + PAGE_SIZE);
  galleryShown += batch.length;
  const sections = new Map();
  for (const b of batch) {
    const path = b.path.join("/") || "(racine)";
    if (!sections.has(path)) sections.set(path, []);
    sections.get(path).push(b);
  }
  for (const [path, bookmarks] of sections) {
    let section = grid.querySelector(`[data-gallery-section="${CSS.escape(path)}"]`);
    if (!section) {
      section = document.createElement("section");
      section.dataset.gallerySection = path;
      section.className = "gallery-folder-section";
      section.style.cssText = "grid-column:1 / -1; margin:10px 0 18px";
      section.innerHTML = `<h3 style="margin:0 0 10px;font-size:14px;font-weight:600">${escapeHtml(path)}</h3><div class="gallery-folder-cards" style="display:grid;grid-template-columns:${galleryColumns === "auto" ? "repeat(auto-fill,minmax(180px,1fr))" : `repeat(${galleryColumns},minmax(0,1fr))`};gap:12px"></div>`;
      grid.appendChild(section);
    }
    const cards = section.querySelector(".gallery-folder-cards");
    for (const b of bookmarks) {
    const card = document.createElement("div");
    card.className = "gcard";
    card.innerHTML = `
      <img class="thumb" loading="lazy" alt="">
      <div class="meta">
        <div class="title">${escapeHtml(b.title || "(sans titre)")}</div>
        <div class="sub"><img loading="lazy" alt=""><span>${escapeHtml(domainOf(b.url))}</span></div>
      </div>`;
    const thumb = card.querySelector(".thumb");
    const fav = card.querySelector(".sub img");
    cachedThumb(b.url, refreshThumbnails).then((src) => { if (thumb.isConnected) thumb.src = src; });
    thumb.onerror = () => { thumb.src = faviconUrl(b.url, 64); };
    fav.src = faviconUrl(b.url);
    fav.onerror = () => fav.remove();
    card.addEventListener("click", () => chrome.tabs.create({ url: b.url }));
    cards.appendChild(card);
    }
  }
  refreshThumbnails = false;
  $("#gallery-sentinel").classList.toggle("hidden", galleryShown >= galleryFiltered.length);
}

/* ---------- dedupe ---------- */

const FOLDER_SVG = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M1.5 4a1 1 0 011-1h3.2l1.6 1.8h6.2a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1V4z"/></svg>';
let dedupeGroups = [];
let dedupeLevel = 1;

const folderChip = (b) => `<span class="folder-chip" style="max-width:100%;white-space:normal;align-items:flex-start">${FOLDER_SVG}<span style="white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere" title="${escapeHtml(b.path.join("/") || "(racine)")}">${escapeHtml(b.path.join("/") || "(racine)")}</span></span>`;

function renderDedupe() {
  const level = Number(document.querySelector("[data-dedupe-level].active")?.dataset.dedupeLevel || $("#dedupe-level")?.value || dedupeLevel || 1);
  dedupeLevel = level;
  const allGroups = groupDuplicates(ACTIVE, level);
  for (const g of allGroups) {
    // Keep the grouping algorithm's original member order in the UI. The
    // selected keeper affects the action, not the position of its row.
    const members = [g.keep, ...g.duplicates];
    const selectedId = dedupeKeepOverrides.get(g.key);
    if (selectedId && members.some((b) => String(b.id) === String(selectedId))) {
      const keeper = members.find((b) => String(b.id) === String(selectedId));
      g.keep = keeper;
      g.duplicates = members.filter((b) => b !== keeper);
      g.displayMembers = members;
    } else {
      g.displayMembers = members;
    }
  }
  const folderFilter = $("#dedupe-folder");
  if (folderFilter) {
    const selectedFolder = folderFilter.value;
    const folders = new Map();
    for (const g of allGroups) for (const b of g.displayMembers) {
      const value = JSON.stringify(b.path);
      folders.set(value, b.path.join("/") || "(racine)");
    }
    folderFilter.innerHTML = '<option value="">Tous les dossiers</option>' + [...folders]
      .sort((a, b) => a[1].localeCompare(b[1], "fr"))
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
    if (folders.has(selectedFolder)) folderFilter.value = selectedFolder;
  }
  const selectedFolder = folderFilter?.value || "";
  dedupeGroups = allGroups.filter((g) => !selectedFolder || g.displayMembers.some((b) => JSON.stringify(b.path) === selectedFolder));
  const total = dedupeGroups.reduce((n, g) => n + g.duplicates.length, 0);
  const scrollCount = $("#dedupe-scroll-count");
  scrollCount.textContent = `${dedupeGroups.length} groupes · ${total} doublons à retirer`;
  updateDedupeScrollCount();
  $("#dedupe-summary").textContent =
    dedupeGroups.length ? `${dedupeGroups.length} groupes · ${total} doublons à retirer. Le bookmark à conserver est présélectionné dans chaque groupe.` : "Aucun doublon à ce niveau.";
  const wrap = $("#dedupe-groups");
  wrap.innerHTML = "";
  dedupeGroups.forEach((g, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    const members = g.displayMembers || [g.keep, ...g.duplicates];
    const rows = members.map((b) => {
      const isKeeper = String(b.id) === String(g.keep.id);
      return `<label class="dedupe-keeper-option${isKeeper ? " selected" : ""}" title="${escapeHtml(b.url)}">
        <input class="dedupe-keeper-radio" type="radio" name="dedupe-keep-${gi}" value="${escapeHtml(b.id)}" data-group-index="${gi}" ${isKeeper ? "checked" : ""} aria-label="Conserver ${escapeHtml(b.title || b.url)}">
        <span class="keeper-indicator" aria-hidden="true">✓</span>
        <span class="dedupe-option-content"><span class="dedupe-title">${escapeHtml(b.title || "(sans titre)")}</span><span class="dedupe-url">${escapeHtml(b.url)}</span></span>
        <span class="dedupe-folder">${folderChip(b)}</span><span class="dedupe-keep-state">${isKeeper ? "À conserver" : "Conserver"}</span>
      </label>`;
    }).join("");
    div.innerHTML = `
      <div class="group-head">
        <span class="muted">${g.duplicates.length} doublon${g.duplicates.length > 1 ? "s" : ""} · choisissez un favori à conserver ; les autres iront en quarantaine</span>
        <button class="btn btn-ghost btn-sm" data-group="${gi}">Dédoublonner ce groupe</button>
      </div>
      <div class="dedupe-members">${rows}</div>`;
    wrap.appendChild(div);
  });
  const allBtn = $("#dedupe-clean-all");
  allBtn.textContent = `Mettre les doublons en quarantaine (${total})`;
  $("#dedupe-actions").classList.toggle("hidden", !dedupeGroups.length);
}

function updateDedupeScrollCount() {
  const badge = $("#dedupe-scroll-count");
  if (!badge) return;
  badge.hidden = !document.querySelector("#tab-dedupe.active") || window.scrollY < 160 || !dedupeGroups.length;
}

window.addEventListener("scroll", updateDedupeScrollCount, { passive: true });

async function cleanAllDuplicates() {
  const ids = dedupeGroups.flatMap((g) => g.duplicates.map((d) => d.id));
  if (!ids.length) return;
  if (!confirm(`Envoyer ${ids.length} doublons en quarantaine ? Le bookmark marqué « à conserver » dans chaque groupe restera en place.`)) return;
  await runDedupeAction(ids);
}

async function cleanOneGroup(gi) {
  const g = dedupeGroups[gi];
  if (!g) return;
  await runDedupeAction(g.duplicates.map((d) => d.id));
}

async function runDedupeAction(ids) {
  const removingIds = new Set(ids.map(String));
  const rows = $$('.dedupe-keeper-radio')
    .filter((radio) => removingIds.has(String(radio.value)))
    .map((radio) => radio.closest('.dedupe-keeper-option'))
    .filter(Boolean);
  const controls = [...$$("#dedupe-groups button[data-group]"), $("#dedupe-clean-all"), ...$$('[data-dedupe-level]')];
  controls.forEach((button) => { button.disabled = true; });
  const progress = $("#dedupe-progress");
  progress.classList.remove("hidden");
  progress.classList.add("dedupe-working");
  progress.setAttribute("role", "status");
  progress.textContent = `Mise en quarantaine de ${ids.length} doublon(s)…`;
  rows.forEach((row) => row.classList.add("dedupe-row-working"));
  try {
    const startedAt = Date.now();
    await Promise.all([
      moveToTrash(ids, { reason: `Mise en quarantaine de ${ids.length} doublon(s)`, source: "dedupe" }),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, 600 - (Date.now() - startedAt)))),
    ]);
    rows.forEach((row) => {
      row.classList.remove("dedupe-row-working");
      row.classList.add("dedupe-row-removing");
    });
    progress.classList.remove("dedupe-working");
    progress.classList.add("dedupe-success");
    progress.textContent = `✓ ${ids.length} doublon(s) déplacé(s) en quarantaine.`;
    await new Promise((resolve) => setTimeout(resolve, 260));
    await refresh();
    setTimeout(() => { progress.classList.add("hidden"); progress.classList.remove("dedupe-success"); }, 5000);
  } catch (error) {
    rows.forEach((row) => row.classList.remove("dedupe-row-working", "dedupe-row-removing"));
    progress.classList.remove("dedupe-working");
    progress.textContent = `Échec du déplacement : ${error?.message || "erreur inconnue"}`;
    controls.forEach((button) => { button.disabled = false; });
  }
}

/* ---------- dead links ---------- */

async function fetchStatus(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, credentials: "omit" });
    const s = res.status;
    if ((s >= 200 && s < 400) || [401, 403, 405, 406, 429].includes(s)) return "alive";
    if (s === 404 || s === 410) return "dead";
    return "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

async function recheckQuarantinedDeadLinks() {
  const info = $("#quarantine-recheck-info");
  try {
    const pending = await getDeadQuarantineRecheckQueue();
    const uniqueUrls = [...new Set(pending.map((item) => item.url))];
    if (!uniqueUrls.length) {
      if (info) info.textContent = "Les liens morts en quarantaine ont déjà été vérifiés dans les dernières 24 heures.";
      return;
    }
    if (info) info.textContent = `Vérification en arrière-plan de ${uniqueUrls.length.toLocaleString("fr-FR")} URL uniques en quarantaine…`;
    const results = new Map();
    let next = 0;
    const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, uniqueUrls.length) }, async () => {
      while (next < uniqueUrls.length) {
        const url = uniqueUrls[next++];
        results.set(url, await fetchStatus(url));
      }
    });
    await Promise.all(workers);
    const checkedAt = Date.now();
    let revived = 0;
    for (const item of pending) {
      const result = results.get(item.url) || "down";
      await updateDeadQuarantineRecheck(item.id, result, checkedAt);
      if (result === "alive") revived++;
    }
    if (info) info.textContent = `Contrôle quotidien terminé · ${uniqueUrls.length.toLocaleString("fr-FR")} URL uniques vérifiées${revived ? ` · ${revived} lien(s) répond(ent) de nouveau` : ""}.`;
    const purged = await purgeExpired();
    if (purged) {
      toast(`${purged} lien(s) toujours morts ont expiré après 30 jours en quarantaine.`);
      await refresh();
    } else {
      await renderQuarantine();
    }
  } catch {
    if (info) info.textContent = "Le contrôle quotidien de la quarantaine n’a pas abouti. Il sera retenté au prochain lancement.";
  }
}

async function runScan() {
  const eligibleBookmarks = ACTIVE.filter((b) => /^https?:/.test(b.url) && !isLocalUrl(b.url));
  const urls = [...new Set(eligibleBookmarks.map((b) => b.url))];
  const recordCount = eligibleBookmarks.length;
  const incremental = $("#scan-incremental").checked;
  const week = Date.now() - 7 * 86400000;
  const queue = urls.filter((u) => {
    const c = CHECKS[u];
    return !incremental || !c || c.s === "down" || c.s === "dead" || c.t < week;
  });
  if (!queue.length) {
    const message = `Aucune URL à rescanner : ${urls.length.toLocaleString("fr-FR")} URL uniques parmi ${recordCount.toLocaleString("fr-FR")} favoris web ont été vérifiées dans les 7 derniers jours.`;
    $("#scan-summary").textContent = message;
    return toast(message);
  }
  if (queue.length > 300 && !confirm(`Scanner ${queue.length} URL uniques parmi ${recordCount} favoris web (${urls.length} URL uniques au total) ? Ça peut prendre plusieurs minutes. Laisse cet onglet ouvert.`)) return;

  $("#scan-bar-wrap").classList.remove("hidden");
  $("#scan-run").disabled = true;
  let done = 0;
  const bar = $("#scan-bar");
  const tick = () => {
    done++;
    bar.style.width = (done / queue.length) * 100 + "%";
    $("#scan-summary").textContent = `${done}/${queue.length} URL uniques · ${recordCount.toLocaleString("fr-FR")} favoris web (${urls.length.toLocaleString("fr-FR")} URL uniques)`;
    if (done % 50 === 0) storage.set({ checks: CHECKS });
  };

  let i = 0;
  const workers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
    while (i < queue.length) {
      const url = queue[i++];
      const s = await fetchStatus(url);
      const prev = CHECKS[url] || { s: "", t: 0, ds: 0 };
      const alive = s === "alive";
      CHECKS[url] = {
        s,
        t: Date.now(),
        ds: s === "dead" ? (prev.s === "dead" ? prev.ds || Date.now() : Date.now()) : 0,
      };
      tick();
    }
  });
  await Promise.all(workers);
  await storage.set({ checks: CHECKS, lastScan: Date.now() });
  $("#scan-run").disabled = false;
  $("#scan-summary").textContent = `Scan terminé · ${queue.length.toLocaleString("fr-FR")} URL uniques scannées parmi ${recordCount.toLocaleString("fr-FR")} favoris web (${urls.length.toLocaleString("fr-FR")} URL uniques).`;
  renderDead();
  toast("Scan terminé.");
}

function renderDead() {
  const rows = [];
  for (const b of ALL) {
    const c = CHECKS[b.url];
    if (!c || c.s !== "dead" || isLocalUrl(b.url) || isQuarantined(b)) continue;
    rows.push({ b, c });
  }
  $("#stat-dead").textContent = rows.length.toLocaleString("fr-FR");
  rows.sort((a, x) => (a.c.ds || a.c.t) - (x.c.ds || x.c.t));
  const wrap = $("#dead-list");
  wrap.innerHTML = "";
  let stale = 0;
  const cutoff = Date.now() - DEAD_DAYS * 86400000;
  for (const { b, c } of rows) {
    if ((c.ds || 0) && c.ds < cutoff) stale++;
    const days = c.ds ? daysSince(c.ds) : 0;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      ${statusBadge(c.s)}
      <span class="grow"><b style="font-weight:500">${escapeHtml(b.title || "(sans titre)")}</b> <span class="u">${escapeHtml(b.url)}</span></span>
      <span class="num muted">${c.ds ? `depuis ${days} j` : fmtDate(c.t)}</span>`;
    wrap.appendChild(row);
  }
  $("#dead-count").textContent = rows.length
    ? `${rows.length} liens non vivants${stale ? ` · dont ${stale} depuis + de ${DEAD_DAYS} j` : ""}`
    : "Aucun lien non vivant.";
  const eligible = rows.filter(({ c }) => c.ds && c.ds < cutoff);
  $("#dead-trash").disabled = !eligible.length;
  $("#dead-trash").textContent = `Mettre en quarantaine les ${eligible.length} liens morts depuis + de ${DEAD_DAYS} j`;
}

async function trashDeadLinks() {
  const ids = ACTIVE.filter((b) => {
    const c = CHECKS[b.url];
    return c && c.s === "dead" && c.ds && c.ds < Date.now() - DEAD_DAYS * 86400000 && !isLocalUrl(b.url);
  }).map((b) => b.id);
  if (!ids.length) return toast(`Aucun lien confirmé mort depuis plus de ${DEAD_DAYS} jours.`);
  if (!confirm(`Mettre ${ids.length} bookmarks non vivants en quarantaine ? Ils seront supprimés définitivement après ${QUARANTINE_DAYS} j sans restauration.`)) return;
  await moveToTrash(ids, { reason: "lien mort", source: "scan", status: "dead" });
  toast(`${ids.length} liens morts envoyés en quarantaine.`);
  await refresh();
}

/* ---------- backup ---------- */

async function exportJson() {
  await createHistorySnapshot("export-json", "Export JSON");
  await renderHistory();
  download(`bookmarks_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exported: Date.now(), bookmarks: ACTIVE }, null, 1), "application/json");
  toast("Export JSON téléchargé.");
}

async function exportHtml() {
  await createHistorySnapshot("export-html", "Export HTML");
  await renderHistory();
  download(`bookmarks_${new Date().toISOString().slice(0, 10)}.html`, netscapeExport(ACTIVE), "text/html");
  toast("Export HTML téléchargé (réimportable dans Chrome).");
}

async function renderHistory() {
  const history = await listHistory();
  const list = $("#backup-history");
  if (!list) return;
  list.innerHTML = history.length ? "" : '<p class="muted">Aucun instantané pour le moment. Un historique est créé avant chaque nettoyage ou restauration.</p>';
  for (const item of history) {
    const row = document.createElement("div");
    row.className = "history-row";
    const count = item.reason?.match(/\b(\d+)\s+(?:doublon(?:\(s\)|s)?|éléments?|favoris?|liens?)(?=\s|$)/i)?.[1];
    const detail = count ? `${count} éléments concernés · instantané complet` : "Instantané complet · détail des changements non enregistré";
    row.innerHTML = `<span class="history-dot" aria-hidden="true"></span><span class="history-copy"><b>${escapeHtml(item.reason || item.event)}</b><small>${fmtDate(item.timestamp)} · ${escapeHtml(item.event)} · ${detail}</small></span>${item.parentSnapshotId ? '<span class="history-parent">lié au précédent</span>' : '<span class="history-parent">origine</span>'}<button class="btn btn-ghost btn-sm" data-history-restore="${escapeHtml(item.id)}">Restaurer</button>`;
    list.appendChild(row);
  }
}

async function renderQuarantine() {
  const trash = await getTrash();
  const sub = await chrome.bookmarks.getSubTree(trash.id);
  const items = flatten(sub[0].children);
  const q = (await storage.get("quarantine")) || {};
  let metadataChanged = false;
  const legacyIds = new Set(items.filter((it) => !q[it.id] || q[it.id].source === "legacy" || !Array.isArray(q[it.id].path) || !q[it.id].path.length).map((it) => String(it.id)));
  const snapshots = (await storage.get(HISTORY_KEY)) || [];
  const recovered = new Map();
  for (const snapshot of snapshots) {
    if (!legacyIds.size || !snapshot.tree) break;
    const walk = (node, path = []) => {
      if (node.url && legacyIds.has(String(node.id)) && !path.some((part) => part === TRASH_TITLE || part === OLD_TRASH_TITLE)) {
        recovered.set(String(node.id), { parent: node.parentId, path, reason: snapshot.reason || snapshot.event || "Ancienne entrée" });
        legacyIds.delete(String(node.id));
        return;
      }
      if (!node.children) return;
      const nextPath = node.id === "0" ? path : [...path, node.title].filter(Boolean);
      for (const child of node.children) walk(child, nextPath);
    };
    walk(snapshot.tree);
  }
  const duplicateUrlGroups = new Map();
  for (const it of items) {
    let entry = q[it.id];
    if (!entry) {
      entry = q[it.id] = { parent: null, path: [], title: it.title, url: it.url, ts: Date.now(), source: "legacy", reason: "Ancienne entrée" };
      metadataChanged = true;
    }
    const oldLocation = recovered.get(String(it.id));
    if (oldLocation) {
      if (!entry.path?.length) entry.path = oldLocation.path;
      if (!entry.parent) entry.parent = oldLocation.parent;
      const oldReason = String(entry.source === "legacy" || entry.reason === "Ancienne entrée" ? oldLocation.reason : entry.reason || oldLocation.reason).toLowerCase();
      if (quarantineCategory(entry) === "other" && /doublon|duplicate/.test(oldReason)) {
        entry.source = "dedupe";
        entry.reason = oldLocation.reason;
      } else if (quarantineCategory(entry) === "other" && /mort|dead|404|410|scan/.test(oldReason)) {
        entry.source = "scan";
        entry.reason = oldLocation.reason;
        entry.status = "dead";
      }
      metadataChanged = true;
    }
    // Older releases stored dead-link scan results separately from quarantine
    // metadata. Use that retained URL result to recover the original category.
    const check = CHECKS[it.url];
    if (quarantineCategory(entry) === "other" && check?.s === "dead") {
      entry.source = "scan";
      entry.reason = "lien mort (classé depuis le résultat de scan conservé)";
      entry.status = "dead";
      entry.ts ||= Date.now();
      metadataChanged = true;
    }
    if (!Array.isArray(entry.path) && entry.parent) {
      try {
        const ancestors = await chrome.bookmarks.get(entry.parent);
        const chain = await chrome.bookmarks.getAncestors(entry.parent);
        entry.path = chain.slice(1).map((folder) => folder.title).filter(Boolean);
        if (ancestors[0]?.title === TRASH_TITLE) entry.path = [];
        metadataChanged = true;
      } catch { entry.path = []; }
    }
  }
  if (metadataChanged) await storage.set({ quarantine: q });
  $("#trash-count").textContent = items.length ? `${items.length} élément(s) en quarantaine` : "Quarantaine vide.";
  const list = $("#trash-list");
  const groups = $("#trash-groups");
  list.innerHTML = "";
  groups.querySelectorAll("[data-quarantine-group]").forEach((el) => { el.innerHTML = ""; });
  const aliveAgain = items.filter((it) => {
    const entry = q[it.id];
    return entry?.status === "dead" && entry.recoveryAt;
  });
  if (aliveAgain.length) {
    const banner = document.createElement("div");
    banner.className = "row revive-banner";
    banner.innerHTML = `
      <span class="status alive">${STATUS_META.alive.icon}${aliveAgain.length} lien(s) de la quarantaine répondent de nouveau</span>
      <button class="btn btn-ghost btn-sm" data-restore-alive="${aliveAgain.map((i) => i.id).join(",")}">Restaurer</button>`;
    list.appendChild(banner);
  }
  const groupCounts = { duplicates: 0, dead: 0, other: 0 };
  for (const it of items) {
    const entry = q[it.id];
    const category = quarantineCategory(entry);
    groupCounts[category]++;
    const left = entry?.status === "dead" && !entry.recoveryAt && entry.lastRecheckStatus !== "down"
      ? Math.ceil((entry.ts + QUARANTINE_DAYS * 86400000 - Date.now()) / 86400000)
      : null;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <span class="grow"><b style="font-weight:500">${escapeHtml(it.title || "(sans titre)")}</b> <span class="u">${escapeHtml(it.url)}</span></span>
      <span class="muted">${escapeHtml((entry?.path || []).join(" › ") || "(racine / dossier d’origine inconnu)")} · ${escapeHtml(entry?.reason || "Autre / ancien")} · ${escapeHtml(quarantineStatusLabel(entry))}</span>
      ${left === null ? "" : `<span class="num muted" title="Purge si un contrôle quotidien confirme encore le statut mort">${left <= 0 ? "purge après contrôle" : `encore ${left} j`}</span>`}
      <button class="btn btn-ghost btn-sm" data-restore="${it.id}">Restaurer</button>`;
    const target = groups.querySelector(`[data-quarantine-group="${category}"]`);
    if (category === "duplicates") {
      const key = it.url || `id:${it.id}`;
      let pack = duplicateUrlGroups.get(key);
      if (!pack) {
        pack = document.createElement("div");
        pack.className = "quarantine-duplicate-pack";
        pack.innerHTML = `<h4>${escapeHtml(it.title || "Favoris similaires")}</h4><div class="muted quarantine-duplicate-url">${escapeHtml(it.url || "URL inconnue")}</div>`;
        duplicateUrlGroups.set(key, pack);
        target.appendChild(pack);
      }
      pack.appendChild(row);
    } else target.appendChild(row);
  }
  for (const [category, count] of Object.entries(groupCounts)) {
    const section = groups.querySelector(`[data-quarantine-group="${category}"]`);
    const label = { duplicates: "Doublons", dead: "Liens morts", other: "Autres / anciens" }[category];
    section.insertAdjacentHTML("afterbegin", `<h3 style="font-size:14px;margin:12px 0">${label} <span class="muted">(${count})</span></h3>`);
    section.hidden = count === 0;
  }
}

async function emptyTrash() {
  const trash = await getTrash();
  const sub = await chrome.bookmarks.getSubTree(trash.id);
  const items = flatten(sub[0].children);
  if (!items.length) return toast("La quarantaine est déjà vide.");
  if (!confirm(`Supprimer DÉFINITIVEMENT les ${items.length} éléments de la quarantaine ?`)) return;
  await createHistorySnapshot("purge-quarantine", `Suppression définitive de ${items.length} élément(s) de quarantaine`);
  const q = (await storage.get("quarantine")) || {};
  for (const it of items) {
    try { await chrome.bookmarks.remove(it.id); } catch {}
    delete q[it.id];
  }
  await storage.set({ quarantine: q });
  toast("Quarantaine purgée.");
  await refresh();
}

/* ---------- refresh + boot ---------- */

async function refresh() {
  const tree = (await chrome.bookmarks.getTree())[0];
  ALL = flatten(tree.children);
  ACTIVE = ALL.filter((b) => !isQuarantined(b));
  renderInventory();
  renderQuarantine();
  renderHistory();
  renderGalleryFolderOptions();
  galleryApply();
  if (document.querySelector('[data-tab="dedupe"].active')) renderDedupe();
  renderDead();
}

async function boot() {
  CHECKS = (await storage.get("checks")) || {};
  const purged = await purgeExpired();
  if (purged) toast(`${purged} élément(s) de quarantaine de plus de ${QUARANTINE_DAYS} j ont été supprimés définitivement.`);
  const last = await storage.get("lastScan");
  $("#backup-info").textContent = last
    ? `Dernier scan complet : ${fmtDate(last)}`
    : "Aucun scan effectué pour le moment.";
  await refresh();
  renderDead();
  recheckQuarantinedDeadLinks();
}

/* ---------- wire ---------- */

$("#dedupe-run")?.addEventListener("click", renderDedupe);
$("#dedupe-level")?.addEventListener("change", renderDedupe);
$("#dedupe-folder")?.addEventListener("change", renderDedupe);
$("#dedupe-groups").addEventListener("change", (e) => {
  const radio = e.target.closest(".dedupe-keeper-radio");
  if (!radio) return;
  const group = dedupeGroups[Number(radio.dataset.groupIndex)];
  if (!group) return;
  dedupeKeepOverrides.set(group.key, radio.value);
  const memberNodes = [...radio.closest(".dedupe-members").querySelectorAll(".dedupe-keeper-option")];
  for (const node of memberNodes) {
    const selected = node.querySelector(".dedupe-keeper-radio") === radio;
    node.classList.toggle("selected", selected);
    node.querySelector(".dedupe-keep-state").textContent = selected ? "À conserver" : "Conserver";
  }
  const selected = group.displayMembers.find((bookmark) => String(bookmark.id) === String(radio.value));
  group.keep = selected;
  group.duplicates = group.displayMembers.filter((bookmark) => bookmark !== selected);
});
$$('[data-dedupe-level]').forEach((button) => button.addEventListener("click", () => {
  $$('[data-dedupe-level]').forEach((b) => {
    b.classList.toggle("active", b === button);
    b.setAttribute("aria-pressed", String(b === button));
  });
  dedupeKeepOverrides.clear();
  renderDedupe();
}));
$("#dedupe-clean-all").addEventListener("click", cleanAllDuplicates);
$("#dedupe-groups").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-group]");
  if (btn) cleanOneGroup(Number(btn.dataset.group));
});
$("#scan-run").addEventListener("click", runScan);
$("#dead-trash").addEventListener("click", trashDeadLinks);
$("#gallery-search").addEventListener("input", galleryApply);
$("#gallery-folder-options").addEventListener("click", (e) => {
  const button = e.target.closest("[data-gallery-folder]");
  if (!button) return;
  $("#gallery-folder-options").querySelectorAll("[data-gallery-folder]").forEach((b) => {
    const active = b === button;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  galleryApply();
});
$("#gallery-folder-options").addEventListener("change", (e) => {
  if (e.target.matches("#gallery-folder-select")) galleryApply();
});
$("#gallery-column-options")?.addEventListener("click", (e) => {
  const button = e.target.closest("[data-gallery-columns]");
  if (!button) return;
  galleryColumns = button.dataset.galleryColumns === "auto" ? "auto" : Number(button.dataset.galleryColumns) || 4;
  localStorage.setItem("galleryColumns", String(galleryColumns));
  $("#gallery-column-options").querySelectorAll("[data-gallery-columns]").forEach((b) => {
    const active = b === button;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  const template = galleryColumns === "auto" ? "repeat(auto-fill, minmax(180px, 1fr))" : `repeat(${galleryColumns}, minmax(0, 1fr))`;
  $("#gallery-grid").style.gridTemplateColumns = template;
  $$(".gallery-folder-cards").forEach((grid) => { grid.style.gridTemplateColumns = template; });
});
$("#gallery-refresh-thumbnails")?.addEventListener("click", () => {
  refreshThumbnails = true;
  galleryApply();
  toast("Miniatures mshots stockées dans chrome.storage.local, cache de 60 images pendant 30 jours.");
});
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && galleryShown < galleryFiltered.length) galleryMore();
}, { rootMargin: "600px" }).observe($("#gallery-sentinel"));
$("#btn-export-json").addEventListener("click", exportJson);
$("#btn-export-html").addEventListener("click", exportHtml);
$("#btn-open-trash").addEventListener("click", async () => {
  const trash = await getTrash();
  chrome.tabs.create({ url: `chrome://bookmarks/?id=${trash.id}` });
});
$("#btn-empty-trash").addEventListener("click", emptyTrash);
$("#btn-restore-all").addEventListener("click", async () => {
  const ids = $$("#trash-groups button[data-restore]").map((b) => b.dataset.restore);
  if (!ids.length) return toast("La quarantaine est vide.");
  await restoreFromTrash(ids);
  toast(`${ids.length} bookmark(s) restauré(s) à leur emplacement d'origine.`);
  await refresh();
});
$("#trash-list").addEventListener("click", async (e) => {
  const revive = e.target.closest("button[data-restore-alive]");
  if (revive) {
    const ids = revive.dataset.restoreAlive.split(",");
    await restoreFromTrash(ids);
    toast(`${ids.length} lien(s) restauré(s) — ils répondent de nouveau.`);
    await refresh();
    return;
  }
  const btn = e.target.closest("button[data-restore]");
  if (!btn) return;
  await restoreFromTrash([btn.dataset.restore]);
  toast("Bookmark restauré à son emplacement d'origine.");
  await refresh();
});
$("#trash-groups").addEventListener("click", async (e) => {
  const restore = e.target.closest("button[data-restore]");
  if (!restore) return;
  await restoreFromTrash([restore.dataset.restore]);
  toast("Bookmark restauré à son emplacement d'origine.");
  await refresh();
});
$$('[data-quarantine-filter]').forEach((button) => button.addEventListener("click", () => {
  const filter = button.dataset.quarantineFilter;
  $$('[data-quarantine-filter]').forEach((b) => {
    const selected = b === button;
    b.setAttribute("aria-selected", String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  $("#trash-groups").setAttribute("aria-labelledby", button.id);
  $$("[data-quarantine-group]").forEach((section) => { section.hidden = filter !== "all" && section.dataset.quarantineGroup !== filter; });
}));
$(".quarantine-filters")?.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = $$('[data-quarantine-filter]');
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
    : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
});

$("#backup-history")?.addEventListener("click", async (e) => {
  const button = e.target.closest("button[data-history-restore]");
  if (!button) return;
  const item = (await listHistory()).find((snapshot) => snapshot.id === button.dataset.historyRestore);
  if (!item) return toast("Cet instantané n'existe plus.");
  if (!confirm(`Restaurer l'instantané « ${item.reason || item.event} » ? Les favoris actuels seront conservés; les éléments manquants seront rétablis.`)) return;
  await restoreHistorySnapshot(item.id);
  await refresh();
  toast("Instantané restauré. Les favoris actuels ont été conservés.");
});

boot();
