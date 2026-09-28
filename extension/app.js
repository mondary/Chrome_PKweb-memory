/* Bookmarks Sorter — vanilla JS, no build step. */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
let SCAN_TIMEOUT = 15000;
let SCAN_CONCURRENCY = 12;
let SET = {
  scanRecheckDays: 7,
  scanConfirm: true,
  scanAutostart: false,
  thumbsMode: "mshots",
};

async function loadSettings() {
  SET = { ...SET, ...((await storage.get("settings")) || {}) };
  SCAN_TIMEOUT = 1000 * Number(await storageNum("scanTimeoutSec", 15));
  SCAN_CONCURRENCY = Number(await storageNum("scanConcurrency", 12));
  if (typeof loadQuarantineDays === "function") await loadQuarantineDays();
}

async function storageNum(key, fallback) {
  const v = await storage.get(key);
  const n = Number(v);
  return v !== undefined && v !== null && Number.isFinite(n) ? n : fallback;
}

function maybeConfirm(message) {
  return !SET.scanConfirm || confirm(message);
}
const DEAD_DAYS = 30;
const PAGE_SIZE = 60;

const manifest = chrome.runtime.getManifest();
const versionLabel = $("#app-version");
if (versionLabel) versionLabel.textContent = `v${manifest.version_name || manifest.version}`;
const aboutVersion = $("#about-version");
if (aboutVersion) aboutVersion.textContent = `Version ${chrome.runtime.getManifest().version_name} - manifest ${chrome.runtime.getManifest().version}.`;

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
  if (SET.thumbsMode === "favicon") return faviconUrl(url, 64);
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
const HISTORY_FOLDER_TITLE = "Historique — Bookmarks Sorter";
const isHistorized = (bookmark) => bookmark.path.some((name) => name === HISTORY_FOLDER_TITLE);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

/* ---------- tabs ---------- */

let currentSection = "bookmarks";
let tabgroupsInited = false;
let sessionsInited = false;

$$(".rail-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$(".rail-tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      if (active) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    const section = tab.dataset.section;
    currentSection = section;
    document.querySelector("header").dataset.section = section;
    $("#app-title")?.replaceChildren(t9n().sections[section] || t9n().sections.bookmarks);
    $("#header-bookmarks")?.classList.toggle("hidden", section !== "bookmarks");
    $("#header-historynav")?.classList.toggle("hidden", section !== "historynav");
    $("#header-tabgroups")?.classList.toggle("hidden", section !== "tabgroups");
    $("#header-sessions")?.classList.toggle("hidden", section !== "sessions");
    $("#header-settings")?.classList.toggle("hidden", section !== "settings");
    $("#section-bookmarks")?.classList.toggle("hidden", section !== "bookmarks");
    $("#section-historynav")?.classList.toggle("hidden", section !== "historynav");
    $("#section-tabgroups")?.classList.toggle("hidden", section !== "tabgroups");
    $("#section-sessions")?.classList.toggle("hidden", section !== "sessions");
    $("#section-settings")?.classList.toggle("hidden", section !== "settings");
    if (section === "historynav") renderBrowserHistory($("#historynav-search")?.value || "");
    if (section === "tabgroups" && !tabgroupsInited) {
      tabgroupsInited = true;
      window.BSTabGroups?.init();
    }
    if (section === "sessions" && !sessionsInited) {
      sessionsInited = true;
      window.BSSessions?.init();
    }
  })
);

$$("#header-bookmarks .header-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$("#header-bookmarks .header-tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      if (active) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    $$("#section-bookmarks .panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab.dataset.tab));
    if (tab.dataset.tab === "dedupe") renderDedupe();
    if (tab.dataset.tab === "history") renderCemetery();
    updateDedupeScrollCount();
  })
);

function openAppTab(name) {
  const tab = document.querySelector(`.header-tab[data-tab="${name}"]`);
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
let galleryFolder = "";

function setGalleryFolderPanel(open) {
  const panel = $("#gallery-folder-panel");
  const trigger = $("#gallery-folder-trigger");
  panel?.classList.toggle("hidden", !open);
  trigger?.setAttribute("aria-expanded", String(open));
}

function updateGalleryFolderLabel() {
  const label = $("#gallery-folder-label");
  if (label) label.textContent = galleryFolder === "" ? "Tous les dossiers" : galleryFolder;
}

// Compte les favoris directs de ce dossier (chemin exact) — même chiffre que
// le filtre galerie et les sections affichées. "" = tous les favoris actifs,
// "(racine)" = favoris posés à la racine, sans leurs sous-dossiers.
function countSubtree(path) {
  if (path === "") return ACTIVE.length;
  const key = String(path);
  let n = 0;
  for (const b of ACTIVE) {
    if ((b.path.join("/") || "(racine)") === key) n++;
  }
  return n;
}

function renderGalleryFolderOptions() {
  const panel = $("#gallery-folder-panel");
  if (!panel) return;
  const folders = new Set();
  for (const b of ACTIVE) folders.add(b.path.join("/") || "(racine)");
  const item = (value, name) => {
    const selected = value === galleryFolder;
    return `<button type="button" class="gallery-folder-item${selected ? " active" : ""}" role="option" data-gallery-folder="${escapeHtml(value)}" aria-selected="${selected}"><span>${escapeHtml(name)}</span><span class="gallery-folder-count">${countSubtree(value)}</span></button>`;
  };
  panel.innerHTML = item("", "Tous les dossiers")
    + [...folders].sort((a, b) => a.localeCompare(b, "fr")).map((folder) => item(folder, folder)).join("");
  updateGalleryFolderLabel();
  setGalleryFolderPanel(false);
}

function galleryApply() {
  const q = $("#gallery-search").value.toLowerCase().trim();
  galleryFiltered = ACTIVE.filter((b) => {
    if (galleryFolder !== "" && (b.path.join("/") || "(racine)") !== galleryFolder) return false;
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
      section.innerHTML = `<h3 style="margin:0 0 10px;font-size:14px;font-weight:600">${escapeHtml(path)}<span class="sec-count"> · ${countSubtree(path)}</span></h3><div class="gallery-folder-cards" style="display:grid;grid-template-columns:${galleryColumns === "auto" ? "repeat(auto-fill,minmax(180px,1fr))" : `repeat(${galleryColumns},minmax(0,1fr))`};gap:12px"></div>`;
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
      </div>
      <button class="gcard-archive" type="button" data-bury="${b.id}" title="Supprimer - part au cimetière" aria-label="Supprimer ${escapeHtml(b.title || b.url)} : part au cimetière"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6.5 2.5h3M4.2 4l.7 9.2c0 .4.4.8.8.8h4.6c.4 0 .8-.4.8-.8L11.8 4M6.5 7v4.5M9.5 7v4.5"/></svg></button>`;
    const thumb = card.querySelector(".thumb");
    const fav = card.querySelector(".sub img");
    cachedThumb(b.url, refreshThumbnails).then((src) => { if (thumb.isConnected) thumb.src = src; });
    thumb.onerror = () => { thumb.src = faviconUrl(b.url, 64); };
    fav.src = faviconUrl(b.url);
    fav.onerror = () => fav.remove();
    card.addEventListener("click", () => chrome.tabs.create({ url: b.url }));
    card.querySelector(".gcard-archive").addEventListener("click", async (e) => {
      e.stopPropagation();
      await withSuppressedRescan(() => buryBookmarks([b], "supprimé"));
      toast("Favori supprimé — il part au cimetière.");
      await refresh();
    });
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
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)} (${countSubtree(label)})</option>`).join("");
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
  if (!maybeConfirm(`Envoyer ${ids.length} doublons en quarantaine ? Le bookmark marqué « à conserver » dans chaque groupe restera en place.`)) return;
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
      withSuppressedRescan(() => moveToTrash(ids, { reason: `Mise en quarantaine de ${ids.length} doublon(s)`, source: "dedupe" })),
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
  const week = Date.now() - (SET.scanRecheckDays || 0) * 86400000;
  const queue = urls.filter((u) => {
    const c = CHECKS[u];
    return !incremental || !c || c.s === "down" || c.s === "dead" || c.t < week;
  });
  if (!queue.length) {
    const message = `Aucune URL à rescanner : ${urls.length.toLocaleString("fr-FR")} URL uniques parmi ${recordCount.toLocaleString("fr-FR")} favoris web ont été vérifiées dans les ${SET.scanRecheckDays || 0} derniers jours.`;
    $("#scan-summary").textContent = message;
    return toast(message);
  }
  if (queue.length > 300 && !maybeConfirm(`Scanner ${queue.length} URL uniques parmi ${recordCount} favoris web (${urls.length} URL uniques au total) ? Ça peut prendre plusieurs minutes. Laisse cet onglet ouvert.`)) return;

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
    if (!c || c.s !== "dead" || isLocalUrl(b.url) || isQuarantined(b) || isHistorized(b)) continue;
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
  if (!maybeConfirm(`Mettre ${ids.length} bookmarks non vivants en quarantaine ? Ils seront supprimés définitivement après ${QUARANTINE_DAYS} j sans restauration.`)) return;
  await withSuppressedRescan(() => moveToTrash(ids, { reason: "lien mort", source: "scan", status: "dead" }));
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
  // L'ancienne catégorie « Autres / anciens » n'existe plus : sa section éventuelle
  // reste vide et cachée, ses entrées partent dans le groupe Liens morts.
  groups.querySelector('[data-quarantine-group="other"]')?.setAttribute("hidden", "");
  if (!$("#btn-quarantine-recheck-all")) {
    const recheckAll = document.createElement("button");
    recheckAll.type = "button";
    recheckAll.id = "btn-quarantine-recheck-all";
    recheckAll.className = "btn btn-ghost btn-sm";
    recheckAll.textContent = t9n().recheckAll;
    // « Tout revérifier » ne concerne que le groupe liens morts : un doublon
    // n’a pas de statut de vie à contrôler.
    groups.querySelector('[data-quarantine-group="dead"]')?.prepend(recheckAll);
  }
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
  const groupCounts = { duplicates: 0, dead: 0 };
  const t = t9n();
  for (const it of items) {
    const entry = q[it.id];
    // Les entrées legacy (source/raison inconnue) sont des liens morts à part
    // entière : elles rejoignent le groupe Liens morts sous le libellé « À revérifier ».
    const rawCategory = quarantineCategory(entry);
    const category = rawCategory === "duplicates" ? "duplicates" : "dead";
    groupCounts[category]++;
    const left = entry?.status === "dead" && !entry.recoveryAt && entry.lastRecheckStatus !== "down"
      ? Math.ceil((entry.ts + QUARANTINE_DAYS * 86400000 - Date.now()) / 86400000)
      : null;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <span class="grow"><a class="q-link" href="${escapeHtml(it.url)}" target="_blank" rel="noopener"><b style="font-weight:500">${escapeHtml(it.title || "(sans titre)")}</b> <span class="u">${escapeHtml(it.url)}</span></a></span>
      <span class="muted">${escapeHtml((entry?.path || []).join(" › ") || "(racine / dossier d’origine inconnu)")} · ${escapeHtml(rawCategory === "other" ? t.toRecheck : (entry?.reason || t.toRecheck))}${category === "dead" ? ` · ${escapeHtml(quarantineStatusLabel(entry))}` : ""}</span>
      ${left === null ? "" : `<span class="num muted" title="Purge si un contrôle quotidien confirme encore le statut mort">${left <= 0 ? "purge après contrôle" : `encore ${left} j`}</span>`}
      ${category === "dead" ? `<button class="btn btn-ghost btn-sm" data-recheck="${escapeHtml(it.url)}">${t.recheck}</button>` : ""}
      <button class="btn btn-ghost btn-sm" data-restore="${it.id}">Restaurer</button>
      <button class="btn btn-danger btn-sm" data-purge="${it.id}">${t.purge}</button>`;
    const target = groups.querySelector(`[data-quarantine-group="${category}"]`) || list;
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
    if (!section) continue;
    const label = { duplicates: "Doublons", dead: "Liens morts" }[category];
    section.insertAdjacentHTML("afterbegin", `<h3 style="font-size:14px;margin:12px 0">${label} <span class="muted">(${count})</span></h3>`);
    section.hidden = count === 0;
  }
}

// Remplace le bouton Revérifier par une pastille de résultat et met en avant
// Restaurer quand le lien répond de nouveau.
function applyQuarantineRecheckResult(button, result) {
  const t = t9n();
  const span = document.createElement("span");
  span.className = `status ${result.alive ? "alive" : "dead"}`;
  span.textContent = result.alive ? t.online : t.deadConfirmed;
  button.replaceWith(span);
  if (result.alive) {
    const restore = span.closest(".row")?.querySelector("button[data-restore]");
    if (restore) {
      restore.classList.remove("btn-ghost");
      restore.classList.add("btn-primary");
    }
  }
}

async function recheckQuarantineAll() {
  const t = t9n();
  if (!window.BSQuarantine?.recheckUrls) return toast(t.recheckMissing);
  const trash = await getTrash();
  const sub = await chrome.bookmarks.getSubTree(trash.id);
  const q = (await storage.get("quarantine")) || {};
  // Seuls les liens morts sont revérifiés : un doublon n’a pas de statut de vie.
  const urls = [...new Set(flatten(sub[0].children)
    .filter((it) => quarantineCategory(q[it.id]) !== "duplicates")
    .map((it) => it.url)
    .filter(Boolean))];
  if (!urls.length) return toast("Aucun lien mort à revérifier.");
  let done = 0;
  let alive = 0;
  for (const url of urls) {
    toast(t.recheckProgress(++done, urls.length));
    const results = await window.BSQuarantine.recheckUrls([url]).catch(() => null);
    const result = results?.get(url);
    if (result?.alive) alive++;
    const btn = document.querySelector(`[data-recheck="${CSS.escape(url)}"]`);
    if (btn && result) applyQuarantineRecheckResult(btn, result);
  }
  toast(t.recheckDone(urls.length, alive));
  await renderQuarantine();
}

// Suppression définitive d'une entrée de quarantaine : le favori quitte le
// dossier Chrome, l'entrée disparaît du registre et le favori part au cimetière.
async function purgeQuarantineEntry(id) {
  const t = t9n();
  const q = (await storage.get("quarantine")) || {};
  const entry = q[id];
  const url = entry?.url || "";
  const title = entry?.title || "";
  if (!confirm(t.purgeConfirm(title || url || "cette entrée"))) return;
  const reason = quarantineCategory(entry) === "duplicates" ? "doublon" : "lien mort";
  await withSuppressedRescan(async () => {
    try { await chrome.bookmarks.remove(id); } catch {}
    delete q[id];
    await storage.set({ quarantine: q });
    if (url) await pushCemeteryEntries([{ url, title, domain: domainOf(url), reason, removedAt: Date.now() }]);
  });
  toast(t.purgeDone);
  await refresh();
}

async function emptyTrash() {
  const trash = await getTrash();
  const sub = await chrome.bookmarks.getSubTree(trash.id);
  const items = flatten(sub[0].children);
  if (!items.length) return toast("La quarantaine est déjà vide.");
  if (!confirm(`Supprimer DÉFINITIVEMENT les ${items.length} éléments de la quarantaine ?`)) return;
  await createHistorySnapshot("purge-quarantine", `Suppression définitive de ${items.length} élément(s) de quarantaine`);
  const q = (await storage.get("quarantine")) || {};
  await withSuppressedRescan(async () => {
    const buried = [];
    for (const it of items) {
      const rawCategory = quarantineCategory(q[it.id]);
      const reason = rawCategory === "duplicates" ? "doublon" : rawCategory === "dead" ? "lien mort" : "quarantaine expirée";
      buried.push({
        url: it.url,
        title: it.title || "",
        domain: domainOf(it.url),
        reason,
        removedAt: Date.now(),
        path: q[it.id]?.path || [],
      });
      try { await chrome.bookmarks.remove(it.id); } catch {}
      delete q[it.id];
    }
    await pushCemeteryEntries(buried);
    await storage.set({ quarantine: q });
  });
  toast("Quarantaine purgée.");
  await refresh();
}

/* ---------- cimetière ---------- */

// Favoris définitivement sortis de la barre : {url, title, domain, reason, removedAt}.
// reason ∈ doublon | lien mort | quarantaine expirée | supprimé.
const CEMETERY_KEY = "bs.cemetery";
const CEMETERY_SEEDED_KEY = "bs.cemetery.seeded";

async function listCemetery() {
  return (await storage.get(CEMETERY_KEY)) || [];
}

async function pushCemeteryEntries(entries) {
  if (!entries.length) return;
  const list = await listCemetery();
  list.push(...entries);
  await storage.set({ [CEMETERY_KEY]: list });
}

function cemeteryEntryFromBookmark(b, reason, removedAt = Date.now()) {
  return { url: b.url, title: b.title || "", domain: domainOf(b.url), reason, removedAt, path: [...(b.path || [])] };
}

// Suppression définitive d'un favori : instantané de récupération, entrée au
// cimetière, puis retrait réel du dossier Chrome.
async function buryBookmarks(bookmarks, reason) {
  await createHistorySnapshot("bury", `Suppression de ${bookmarks.length} favori(s) — part au cimetière`);
  await pushCemeteryEntries(bookmarks.map((b) => cemeteryEntryFromBookmark(b, reason)));
  await withSuppressedRescan(async () => {
    for (const b of bookmarks) {
      try { await chrome.bookmarks.remove(b.id); } catch {}
    }
  });
}

// Chemin d'origine s'il existe encore (segments retrouvés par titre), sinon la barre.
async function cemeteryTargetFolder(path = []) {
  let parentId = "1";
  for (const segment of path) {
    try {
      const children = await chrome.bookmarks.getChildren(parentId);
      const next = children.find((c) => !c.url && c.title === segment);
      if (!next) break;
      parentId = next.id;
    } catch { break; }
  }
  return parentId;
}

async function renderCemetery() {
  const panel = $("#tab-history");
  if (!panel) return;
  const t = t9n();
  const entries = await listCemetery();
  const head = document.createElement("div");
  head.className = "toolbar";
  const count = document.createElement("span");
  count.className = "muted";
  count.textContent = entries.length ? t.cemeteryCount(entries.length) : t.cemeteryEmpty;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.id = "btn-cemetery-clear";
  clear.className = "btn btn-danger btn-sm";
  clear.textContent = t.cemeteryClear;
  clear.hidden = !entries.length;
  head.append(count, clear);

  const list = document.createElement("div");
  list.id = "cemetery-list";
  const byDomain = new Map();
  for (const entry of entries) {
    const d = entry.domain || domainOf(entry.url) || "(inconnu)";
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(entry);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "fr"));
  const frag = document.createDocumentFragment();
  for (const [domain, groupEntries] of domains) {
    const group = document.createElement("div");
    group.className = "cemet-group";
    const title = document.createElement("h3");
    title.innerHTML = `${escapeHtml(domain)} <span class="muted">(${groupEntries.length})</span>`;
    group.appendChild(title);
    for (const entry of [...groupEntries].sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0))) {
      const row = document.createElement("div");
      row.className = "cemet-entry";
      row.innerHTML = `
        <span class="cemet-ico"><img src="${faviconUrl(entry.url, 32)}" alt="" loading="lazy" style="width:16px;height:16px;flex:none"></span>
        <span class="grow"><b style="font-weight:500">${escapeHtml(entry.title || "(sans titre)")}</b> <span class="u">${escapeHtml(entry.url)}</span></span>
        <span class="cemet-badge" data-reason="${escapeHtml(entry.reason)}">${escapeHtml(t.cemeteryBadges[entry.reason] || entry.reason || "—")}</span>
        <span class="muted">${fmtDate(entry.removedAt)}</span>
        <span class="cemet-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-cemetery-readd="${entries.indexOf(entry)}">${t.cemeteryReadd}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cemetery-remove="${entries.indexOf(entry)}">${t.cemeteryRemove}</button>
        </span>`;
      group.appendChild(row);
    }
    frag.appendChild(group);
  }
  list.appendChild(frag);
  panel.replaceChildren(head, list);
}

// Amorçage unique : l'ancien dossier d'archive « Historique — Bookmarks Sorter »
// s'il existe encore alimente le cimetière (raison « supprimé ») puis est ignoré,
// jamais supprimé physiquement — aucune donnée utilisateur n'est détruite.
async function seedCemetery() {
  if (await storage.get(CEMETERY_SEEDED_KEY)) return;
  const found = (await chrome.bookmarks.search({ title: HISTORY_FOLDER_TITLE })).find((f) => !f.url);
  if (found) {
    const [subtree] = await chrome.bookmarks.getSubTree(found.id).catch(() => [null]);
    const items = flatten(subtree?.children || []);
    const archive = (await storage.get("historyArchive")) || {};
    await pushCemeteryEntries(items.map((it) => {
      const entry = archive[it.id] || {};
      return { url: it.url, title: it.title || "", domain: domainOf(it.url), reason: "supprimé", removedAt: entry.ts || Date.now(), path: entry.path || [] };
    }));
  }
  await storage.set({ [CEMETERY_SEEDED_KEY]: true });
}

/* ---------- historique de navigation ---------- */

const HNAV_WINDOW_DAYS = 14;
// Iframes préchargées et ouvertures automatiques : visites parasites (annonces,
// cadres, onglets machine) qui gonflent les stats sans navigation humaine.
const HNAV_NOISE_TRANSITIONS = new Set(["auto_subframe", "auto_toplevel", "other"]);
const HNAV_ROW_H = 34;
const HNAV_LANE_W = 14;
const HNAV_EDGE_COLORS = ["#52525b", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#dc2626", "#65a30d"];
const HNAV_TRANSITION_LABELS = {
  typed: "saisie",
  auto_bookmark: "favori",
  auto_toplevel: "nouvel onglet",
  form_submit: "formulaire",
  generated: "auto",
  keyword: "recherche",
  keyword_generated: "recherche",
  start_page: "démarrage",
};
const HNAV_STAR_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3.1-3 4.3-.6z"/></svg>';

let historynavPages = [];
let historynavRenderToken = 0;
/* Cache des visites collectées : la collecte (search + getVisits par page) est
   lente — navigation par jour, recherche et focus rejouent le rendu depuis le
   cache tant qu'aucun événement d'historique n'a invalidé les données. */
let hnavCache = { key: null, allVisits: null, visitedPages: null };
let hnavDataDirty = 0;
// Filtre « par jour » de la timeline : minuit local du jour choisi, ou null = tout.
// Par défaut la timeline s'ouvre sur la journée en cours, pas sur la fenêtre entière.
let hnavDayFilter = hnavDayStart(Date.now());

// Fenêtre de rétention du scan : jours écoulés, ou 0 = Illimité (tout l'historique).
async function getHnavWindowDays() {
  const stored = await storage.get("hnavWindowDays");
  if (stored !== undefined && stored !== null) return Number(stored);
  const selected = Number($("#setting-history-window")?.value);
  return Number.isFinite(selected) && selected >= 0 ? selected : 0;
}

/* ---------- langue de l'interface (chaînes dynamiques du JS uniquement) ---------- */

const I18N = {
  fr: {
    appTitle: "Favoris",
    sections: { bookmarks: "Favoris", historynav: "Historique de navigation", tabgroups: "Groupes d'onglets", sessions: "Sessions", settings: "Réglages" },
    loading: "Chargement…",
    historyPermission: "L'historique de navigation nécessite la permission 'history'.",
    emptyTimelineSearch: "Aucun élément dans l'historique pour cette recherche.",
    emptyTimeline: "Historique vide sur la période.",
    emptyPages: "Aucune page pour cette recherche.",
    emptyDay: "Aucune visite pour ce jour.",
    dayAll: "Tout",
    dayToday: "Aujourd'hui",
    dayYesterday: "Hier",
    dayPicker: "Filtrer par jour",
    dayPrev: "Jour précédent avec des visites",
    dayNext: "Jour suivant avec des visites",
    calVisits: (n) => `${n.toLocaleString("fr-FR")} visite(s)`,
    calNoVisits: "aucune visite",
    calLegendLess: "Moins de visites",
    calLegendMore: "Plus de visites",
    unknownDay: "Date inconnue",
    openPill: "ouvert",
    deadRescan: "Relancer le scan",
    recheck: "Revérifier",
    recheckAll: "Tout revérifier",
    recheckMissing: "La revérification de liens n'est pas disponible dans cette version.",
    recheckProgress: (d, n) => `Revérification ${d}/${n}…`,
    recheckDone: (n, a) => `Revérification terminée · ${n.toLocaleString("fr-FR")} lien(s) vérifié(s) · ${a} en ligne.`,
    online: "En ligne",
    deadConfirmed: "Lien mort confirmé",
    toRecheck: "À revérifier",
    purge: "Supprimer définitivement",
    purgeConfirm: (label) => `Supprimer définitivement « ${label} » ? Le favori part au cimetière — c’est le seul chemin de retour.`,
    purgeDone: "Supprimé définitivement — le favori est au cimetière.",
    cemeteryCount: (n) => `${n.toLocaleString("fr-FR")} favori(s) au cimetière`,
    cemeteryEmpty: "Aucun favori au cimetière. Les favoris supprimés et purgés y atterrissent.",
    cemeteryClear: "Vider",
    cemeteryReadd: "Réajouter",
    cemeteryRemove: "Retirer",
    cemeteryBadges: { doublon: "Doublon", "lien mort": "Lien mort", "quarantaine expirée": "Quarantaine", supprimé: "Supprimé" },
    permTabsText: "Permission « onglets » désactivée dans Chrome : les Sessions ne capturent quasiment rien et les Groupes d'onglets paraissent vides (titres et adresses masqués).",
    permTabsBtn: "Réactiver la permission",
    countLine: (v, p, d) => `${v.toLocaleString("fr-FR")} visites · ${p.toLocaleString("fr-FR")} pages · ${d === 0 ? "illimité" : `${d} j`}`,
  },
  en: {
    appTitle: "Favoris",
    sections: { bookmarks: "Favoris", historynav: "Browsing history", tabgroups: "Tab groups", sessions: "Sessions", settings: "Settings" },
    loading: "Loading…",
    historyPermission: "Browsing history requires the 'history' permission.",
    emptyTimelineSearch: "No history items match this search.",
    emptyTimeline: "No history in this period.",
    emptyPages: "No pages for this search.",
    emptyDay: "No visits on that day.",
    dayAll: "All",
    dayToday: "Today",
    dayYesterday: "Yesterday",
    dayPicker: "Filter by day",
    dayPrev: "Previous day with visits",
    dayNext: "Next day with visits",
    calVisits: (n) => `${n.toLocaleString("en-US")} visit(s)`,
    calNoVisits: "no visits",
    calLegendLess: "Fewer visits",
    calLegendMore: "More visits",
    unknownDay: "Unknown date",
    openPill: "open",
    deadRescan: "Rescan",
    recheck: "Recheck",
    recheckAll: "Recheck all",
    recheckMissing: "Link recheck is unavailable in this version.",
    recheckProgress: (d, n) => `Rechecking ${d}/${n}…`,
    recheckDone: (n, a) => `Recheck done · ${n.toLocaleString("en-US")} link(s) checked · ${a} online.`,
    online: "Online",
    deadConfirmed: "Dead link confirmed",
    toRecheck: "To recheck",
    purge: "Delete permanently",
    purgeConfirm: (label) => `Permanently delete “${label}”? The bookmark goes to the cemetery — that is the only way back.`,
    purgeDone: "Deleted permanently — the bookmark is in the cemetery.",
    cemeteryCount: (n) => `${n.toLocaleString("en-US")} bookmark(s) in the cemetery`,
    cemeteryEmpty: "No bookmarks in the cemetery yet. Deleted and purged bookmarks land here.",
    cemeteryClear: "Empty",
    cemeteryReadd: "Re-add",
    cemeteryRemove: "Remove",
    cemeteryBadges: { doublon: "Duplicate", "lien mort": "Dead link", "quarantaine expirée": "Quarantine", supprimé: "Deleted" },
    permTabsText: "“Tabs” permission disabled in Chrome: Sessions capture almost nothing and Tab groups look empty (titles and addresses hidden).",
    permTabsBtn: "Re-enable permission",
    countLine: (v, p, d) => `${v.toLocaleString("en-US")} visits · ${p.toLocaleString("en-US")} pages · ${d === 0 ? "unlimited" : `${d} d`}`,
  },
};
let uiLang = "fr";
const t9n = () => I18N[uiLang] || I18N.fr;

function applyUiLang() {
  const t = t9n();
  document.documentElement.lang = uiLang;
  document.title = t.appTitle;
  $("#app-title")?.replaceChildren(t.sections[currentSection] || t.sections.bookmarks);
  $("#btn-dead-rescan")?.replaceChildren(t.deadRescan);
  $("#btn-quarantine-recheck-all")?.replaceChildren(t.recheckAll);
}

function hnavDayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hnavDayLabel(dayStart) {
  const offset = Math.round((dayStart - hnavDayStart(Date.now())) / 86400000);
  if (offset === 0) return "Aujourd'hui";
  if (offset === -1) return "Hier";
  return new Date(dayStart).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function hnavLaneColor(lane) {
  return HNAV_EDGE_COLORS[lane % HNAV_EDGE_COLORS.length];
}

async function hnavCollectVisits(pages, cutoff) {
  const visits = [];
  for (let i = 0; i < pages.length; i += 20) {
    const chunk = pages.slice(i, i + 20);
    const results = await Promise.all(chunk.map((p) => chrome.history.getVisits({ url: p.url }).catch(() => [])));
    chunk.forEach((p, j) => {
      let lastKept = 0;
      const ordered = (results[j] || []).filter((v) => (v.visitTime || 0) >= cutoff).sort((a, b) => a.visitTime - b.visitTime);
      for (const v of ordered) {
        if (v.transition === "reload") continue;
        if (v.visitTime - lastKept < 2000) continue; // même page revue immédiatement (clignotement de redirection)
        lastKept = v.visitTime;
        visits.push({
          id: String(v.visitId),
          url: p.url,
          title: p.title || p.url,
          ts: v.visitTime,
          ref: v.referringVisitId && v.referringVisitId !== "0" ? String(v.referringVisitId) : null,
          transition: v.transition || "link",
        });
      }
    });
  }
  visits.sort((a, b) => b.ts - a.ts);
  // On retire les visites parasites, puis les jumeaux consécutifs (même URL au
  // même instant, ex. redirection comptée deux fois) pour un historique fidèle.
  const clean = [];
  for (const v of visits) {
    if (HNAV_NOISE_TRANSITIONS.has(v.transition)) continue;
    const prev = clean[clean.length - 1];
    if (prev && prev.url === v.url && prev.ts === v.ts) continue;
    clean.push(v);
  }
  return clean;
}

function hnavAssignLanes(dayVisits) {
  // Affectation des couloirs façon git graph : le premier enfant poursuit le couloir
  // de son parent, les ramifications ouvrent un nouveau couloir et retombent en courbe.
  // Les couloirs libres sont réutilisés : on prend le plus bas non retenu par une arête.
  const n = dayVisits.length;
  const rowOf = new Map(dayVisits.map((v, i) => [v.id, i]));
  const waiting = new Map(); // visitId -> couloirs qui attendent cette visite
  let laneCount = 0;
  const edges = []; // { childRow, childLane, parentRow, drawn }
  for (let r = 0; r < n; r++) {
    const v = dayVisits[r];
    const wl = (waiting.get(v.id) || []).sort((a, b) => a - b);
    waiting.delete(v.id); // couloirs consommés ici : les autres y retombent en courbe et se libèrent
    let lane;
    if (wl.length) {
      lane = wl[0];
    } else {
      const held = new Set();
      for (const arr of waiting.values()) for (const l of arr) held.add(l);
      lane = 0;
      while (held.has(lane)) lane++;
      laneCount = Math.max(laneCount, lane + 1);
    }
    v.lane = lane;
    v.root = !(v.ref != null && rowOf.has(v.ref));
    const parentRow = v.ref != null ? rowOf.get(v.ref) : undefined;
    if (parentRow !== undefined && parentRow > r) {
      edges.push({ childRow: r, childLane: lane, parentRow, drawn: false });
      const arr = waiting.get(dayVisits[parentRow].id) || [];
      arr.push(lane);
      waiting.set(dayVisits[parentRow].id, arr);
    }
  }
  // Indentation par ligne : chaque rangée ne recule que du maximum de couloirs
  // qui la traversent VRAIMENT (sa propre voie + les arêtes qui passent par
  // elle). Les lignes tranquilles restent à gauche — fini le décalage global
  // et progressif de toute la journée au seul motif qu'elle compte des branches.
  const rowMaxLane = dayVisits.map((v) => v.lane);
  for (const e of edges) {
    const hi = Math.max(e.childLane, dayVisits[e.parentRow].lane);
    for (let r = e.childRow; r <= e.parentRow; r++) {
      if (rowMaxLane[r] < hi) rowMaxLane[r] = hi;
    }
  }
  return { laneCount, edges, rowMaxLane };
}

// Section d'une journée : titre + corps. La géométrie (couloirs, largeur et
// hauteur du SVG, décalage des lignes) est figée pour TOUTE la journée dès la
// création ; seules les lignes sont ajoutées ensuite, par lots (rendu paresseux).
function hnavCreateDay(label, dayVisits) {
  const geo = hnavAssignLanes(dayVisits);
  const section = document.createElement("section");
  section.className = "hg-day";
  const title = document.createElement("h3");
  title.className = "hg-day-title";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  const countSpan = document.createElement("span");
  countSpan.textContent = `${dayVisits.length} visite${dayVisits.length > 1 ? "s" : ""}`;
  title.append(labelSpan, countSpan);
  section.appendChild(title);

  const body = document.createElement("div");
  body.className = "hg-body";

  // Le SVG est inséré AVANT les lignes : le contenu des lignes (favicon, puce,
  // heure, étoile) peint ainsi au-dessus de la dendrite. Dans le SVG même, deux
  // groupes remplis par lots : les traits de branche d'abord, les cercles-points
  // ensuite avec un halo blanc opaque pour qu'aucun trait ne recouvre un point.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "hg-svg");
  svg.setAttribute("width", String(geo.laneCount * HNAV_LANE_W));
  svg.setAttribute("height", String(dayVisits.length * HNAV_ROW_H));
  svg.setAttribute("aria-hidden", "true");
  const paths = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const dots = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(paths, dots);
  body.appendChild(svg);
  section.appendChild(body);
  return { dayVisits, geo, section, body, paths, dots, nextRow: 0 };
}

// Ajoute les lignes [from, to) d'une journée : les rangées, puis leurs points,
// puis les traits de branche dont les DEUX extrémités sont désormais rendues —
// rien ne dépasse ainsi sous la dernière ligne affichée.
function hnavAppendDayRows(day, from, to) {
  const { dayVisits, geo, body, paths, dots } = day;
  for (let r = from; r < to; r++) {
    const v = dayVisits[r];
    const row = document.createElement("div");
    row.className = "hg-row";
    // Indentation individuelle : --lane porte le couloir maximal qui traverse
    // CETTE ligne (voir hnavAssignLanes) — les lignes sans branche restent à gauche.
    row.style.setProperty("--lane", String(geo.rowMaxLane?.[r] ?? v.lane));
    row.dataset.url = v.url;
    row.title = "Rouvrir dans un nouvel onglet";
    const chip = HNAV_TRANSITION_LABELS[v.transition] ? `<span class="hg-chip">${HNAV_TRANSITION_LABELS[v.transition]}</span>` : "";
    row.innerHTML = `
      <img class="hg-favicon" src="${faviconUrl(v.url, 32)}" alt="" loading="lazy">
      <span class="hg-copy"><b>${escapeHtml(v.title || v.url)}</b><small class="hg-url">${escapeHtml(v.url)}</small></span>
      ${chip}
      <span class="hg-open-pill">${t9n().openPill}</span>
      <span class="hg-time muted">${new Date(v.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
      <button type="button" class="btn btn-ghost btn-sm hg-star" data-bookmark="${escapeHtml(v.url)}" title="Ajouter aux favoris" aria-label="Ajouter ${escapeHtml(v.title || v.url)} aux favoris">${HNAV_STAR_SVG}</button>`;
    body.appendChild(row);
  }
  for (let r = from; r < to; r++) {
    const v = dayVisits[r];
    const cx = v.lane * HNAV_LANE_W + HNAV_LANE_W / 2;
    const cy = r * HNAV_ROW_H + HNAV_ROW_H / 2;
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("cx", String(cx));
    halo.setAttribute("cy", String(cy));
    halo.setAttribute("r", "5.5");
    halo.setAttribute("fill", "#fff");
    dots.appendChild(halo);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", "3.5");
    dot.setAttribute("fill", v.root ? "#fff" : hnavLaneColor(v.lane));
    dot.setAttribute("stroke", hnavLaneColor(v.lane));
    dot.setAttribute("stroke-width", "1.6");
    dots.appendChild(dot);
  }
  for (const e of geo.edges) {
    if (e.drawn || e.parentRow >= to) continue;
    e.drawn = true;
    const parent = dayVisits[e.parentRow];
    const x1 = e.childLane * HNAV_LANE_W + HNAV_LANE_W / 2;
    const y1 = e.childRow * HNAV_ROW_H + HNAV_ROW_H / 2;
    const x2 = parent.lane * HNAV_LANE_W + HNAV_LANE_W / 2;
    const y2 = e.parentRow * HNAV_ROW_H + HNAV_ROW_H / 2;
    const elbow = Math.max(2, Math.min(12, (y2 - y1) / 2));
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} L ${x1} ${y2 - elbow} Q ${x1} ${y2} ${x1 + Math.sign(x2 - x1) * Math.min(elbow, Math.abs(x2 - x1))} ${y2} L ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", hnavLaneColor(e.childLane));
    path.setAttribute("stroke-width", "1.5");
    paths.appendChild(path);
  }
}

/* ---------- permission « tabs » ---------- */

/* Chrome permet de désactiver la permission « tabs » depuis les détails de
   l'extension. Sans elle, chrome.tabs.query renvoie des onglets SANS url ni
   titre : les sessions capturent 1 onglet sur 60 et les groupes d'onglets
   paraissent vides. Bannière globale tant qu'elle est désactivée. */
async function refreshTabsPermissionBanner() {
  let ok = true;
  try {
    if (chrome.permissions?.contains) ok = await chrome.permissions.contains({ permissions: ["tabs"] });
  } catch { /* permissions API absente : rien à signaler */ }
  let el = document.getElementById("tabs-perm-banner");
  if (ok) { el?.remove(); return; }
  if (!el) {
    const t = t9n();
    el = document.createElement("div");
    el.id = "tabs-perm-banner";
    el.className = "perm-banner";
    el.setAttribute("role", "alert");
    el.innerHTML = `
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5V9M8 11.6v.1"/><path d="M8 1.8 15 14H1z"/></svg>
      <span>${escapeHtml(t.permTabsText)}</span>
      <button type="button" class="btn btn-ghost btn-sm">${escapeHtml(t.permTabsBtn)}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
    (document.querySelector("main") || document.body).prepend(el);
  }
}
chrome.permissions?.onAdded?.addListener(() => refreshTabsPermissionBanner());
chrome.permissions?.onRemoved?.addListener(() => refreshTabsPermissionBanner());

/* ---------- filtre par jour de la timeline ---------- */

let hnavDayCounts = new Map(); // jour (minuit local) -> visites, sur la fenêtre complète
let hnavHeatmapScrolled = false; // amène le jour sélectionné/aujourd'hui en vue une fois par sélection

function setHnavDayFilter(day) {
  hnavDayFilter = day;
  hnavHeatmapScrolled = false; // la plage s'étend jusqu'au mois du jour choisi, puis y scrolle
  renderBrowserHistory($("#historynav-search")?.value || "");
}

function hnavMonthStart(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function hnavChipLabel(dayStart) {
  const t = t9n();
  const offset = Math.round((dayStart - hnavDayStart(Date.now())) / 86400000);
  if (offset === 0) return t.dayToday;
  if (offset === -1) return t.dayYesterday;
  return new Date(dayStart).toLocaleDateString(uiLang === "en" ? "en-US" : "fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

// Bandeau de navigation par jour : groupe segmenté ‹ libellé › et « Tout » à
// droite qui retire le filtre. La heatmap sous le bandeau sert de calendrier
// permanent. Il ne filtre que la liste Timeline ; compteurs, recherche et
// panneau Pages restent sur la fenêtre complète.
const HNAV_CHEV_LEFT = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';
const HNAV_CHEV_RIGHT = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';

function renderHnavDayNav(visits) {
  const panel = $("#hnav-panel-timeline");
  const list = $("#hnav-timeline-list");
  if (!panel || !list) return;
  $("#hnav-day-strip")?.remove(); // ancien bandeau à chips, remplacé
  let nav = $("#hnav-daynav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "hnav-daynav";
    panel.insertBefore(nav, list);
  }
  const t = t9n();
  const todayStart = hnavDayStart(Date.now());
  const counts = new Map();
  for (const v of visits) {
    const k = hnavDayStart(v.ts);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  hnavDayCounts = counts;
  const days = [...counts.keys()].sort((a, b) => a - b);
  const prevDay = hnavDayFilter === null
    ? (days[days.length - 1] ?? null)
    : (days.filter((d) => d < hnavDayFilter).pop() ?? null);
  const nextDay = hnavDayFilter === null
    ? null
    : (days.find((d) => d > hnavDayFilter) ?? null);
  const frag = document.createDocumentFragment();
  const group = document.createElement("div");
  group.className = "hg-daynav-group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", t.dayPicker);
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "hg-daynav-btn";
  prev.innerHTML = HNAV_CHEV_LEFT;
  prev.setAttribute("aria-label", t.dayPrev);
  if (prevDay !== null) prev.title = hnavDayLabel(prevDay);
  prev.disabled = prevDay === null;
  prev.addEventListener("click", () => setHnavDayFilter(prevDay));
  const label = document.createElement("span");
  label.className = "hg-daynav-label";
  label.innerHTML = `<span>${escapeHtml(hnavDayFilter === null ? t.dayAll : hnavChipLabel(hnavDayFilter))}</span><span class="hg-daynav-count">${(counts.get(hnavDayFilter) || visits.length).toLocaleString("fr-FR")}</span>`;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "hg-daynav-btn";
  next.innerHTML = HNAV_CHEV_RIGHT;
  next.setAttribute("aria-label", t.dayNext);
  if (nextDay !== null) next.title = hnavDayLabel(nextDay);
  next.disabled = hnavDayFilter === null || hnavDayFilter >= todayStart || nextDay === null;
  next.addEventListener("click", () => setHnavDayFilter(nextDay));
  group.append(prev, label, next);
  const all = document.createElement("button");
  all.type = "button";
  all.className = "hg-daynav-all";
  all.textContent = t.dayAll;
  all.title = t.dayAll;
  all.disabled = hnavDayFilter === null;
  all.addEventListener("click", () => setHnavDayFilter(null));
  frag.append(group, all);
  nav.replaceChildren(frag);
  let heat = $("#hnav-heatmap");
  if (!heat) {
    heat = document.createElement("div");
    heat.id = "hnav-heatmap";
    panel.insertBefore(heat, list);
  }
  heat.replaceChildren(buildHnavHeatmap());
  if (!hnavHeatmapScrolled) {
    hnavHeatmapScrolled = true;
    const cell = heat.querySelector(".hm-cell.selected") || heat.querySelector(".hm-cell.today");
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

// Heatmap continue façon calendrier de contributions : plusieurs mois posés
// côte à côte, UNIQUEMENT ceux qui tiennent dans la largeur disponible (aucun
// scroll horizontal ; ~146 px par mois au pire cas de 6 semaines). Quand 12
// mois tiennent, l'année civile complète janvier → décembre (jours futurs
// désactivés). Le jour sélectionné plus ancien étend la plage jusqu'à son mois
// (seul cas où la bande peut déborder). Une colonne par semaine, sept lignes
// L-D, pastille par jour colorée par intensité de visites, niveaux calibrés sur
// le maximum de la plage pour rester comparables d'un mois à l'autre. Clic
// direct sur un jour pour filtrer la timeline.
function buildHnavHeatmap() {
  const t = t9n();
  const locale = uiLang === "en" ? "en-US" : "fr-FR";
  const todayStart = hnavDayStart(Date.now());
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  // Le bloc .hm conserve 14 px de padding et 1 px de bord de chaque côté :
  // mesurer la largeur utile du scroll, puis dimensionner la grille dedans.
  const heatmapWidth = $("#hnav-heatmap")?.clientWidth || 0;
  const available = heatmapWidth > 0 ? Math.max(0, heatmapWidth - 30) : 0;
  const monthInfo = (year, month) => {
    const days = new Date(year, month + 1, 0).getDate();
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    return { year, month, days, weeks: Math.ceil((lead + days) / 7) };
  };
  const measure = (months) => {
    const cols = months.reduce((sum, m) => sum + m.weeks, 0);
    // 12 px de sécurité pour les libellés qui dépassent parfois leur grille
    // (ex. « septembre »). Les jours de semaine n'occupent plus une colonne.
    const overhead = 12 + (months.length - 1) * 18 + (cols - months.length) * 4;
    const rawCellPx = available > 0 ? Math.floor((available - overhead) / cols) : 14;
    return { cols, fits: available <= 0 || rawCellPx >= 9, cellPx: Math.max(9, Math.min(18, rawCellPx || 9)) };
  };

  const civilYear = Array.from({ length: 12 }, (_, month) => monthInfo(currentYear, month));
  let months = civilYear;
  let layout = measure(months);
  const january = new Date(currentYear, 0, 1).getTime();
  const selectedIsOlder = hnavDayFilter !== null && hnavDayFilter < january;
  if (selectedIsOlder) {
    // Garder le jour choisi accessible : cette seule plage peut dépasser la largeur.
    const selected = new Date(hnavDayFilter);
    months = [];
    for (let y = selected.getFullYear(), m = selected.getMonth();; ) {
      months.push(monthInfo(y, m));
      if (y === currentYear && m === 11) break;
      m++;
      if (m > 11) { m = 0; y++; }
    }
    layout = measure(months);
  } else if (!layout.fits) {
    // Si l'année civile complète ne tient pas, montrer les mois récents qui
    // tiennent, jusqu'au mois courant. L'année entière revient dès qu'elle passe.
    for (let count = currentMonth + 1; count >= 1; count--) {
      const startMonth = currentMonth - count + 1;
      const candidate = Array.from({ length: count }, (_, i) => monthInfo(currentYear, startMonth + i));
      const candidateLayout = measure(candidate);
      if (candidateLayout.fits) {
        months = candidate;
        layout = candidateLayout;
        break;
      }
    }
  }
  const first = new Date(months[0].year, months[0].month, 1);
  const firstTs = first.getTime();
  let rangeMax = 0;
  for (const [k, n] of hnavDayCounts) {
    if (k >= firstTs) rangeMax = Math.max(rangeMax, n);
  }
  const cellPx = layout.cellPx;

  const wrap = document.createElement("div");
  wrap.className = "hm";
  wrap.style.setProperty("--hm-cell", `${cellPx}px`);

  const head = document.createElement("div");
  head.className = "hm-head";
  const yearLabel = document.createElement("span");
  yearLabel.className = "hm-year";
  yearLabel.textContent = months[0].year === currentYear ? String(currentYear) : `${months[0].year}–${currentYear}`;
  const legend = document.createElement("span");
  legend.className = "hm-legend";
  const less = document.createElement("span");
  less.textContent = "–";
  less.title = t.calLegendLess;
  const more = document.createElement("span");
  more.textContent = "+";
  more.title = t.calLegendMore;
  legend.append(less);
  for (let l = 0; l <= 4; l++) {
    const sw = document.createElement("i");
    sw.className = `hm-swatch${l ? ` l${l}` : ""}`;
    legend.append(sw);
  }
  legend.append(more);
  head.append(yearLabel, legend);

  const scroll = document.createElement("div");
  scroll.className = "hm-scroll";
  const grid = document.createElement("div");
  grid.className = "hm-grid";

  for (const { year: y, month: m, days: monthDays } of months) {
    const block = document.createElement("div");
    block.className = "hm-month-block";
    const monthLabel = document.createElement("span");
    monthLabel.className = "hm-month";
    monthLabel.textContent = new Date(y, m, 1).toLocaleDateString(locale, { month: "long" });
    const weeks = document.createElement("div");
    weeks.className = "hm-month-weeks";
    const cursor = new Date(y, m, 1);
    cursor.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7); // semaine commençant lundi
    const last = new Date(y, m, monthDays);
    while (cursor <= last) {
      const col = document.createElement("div");
      col.className = "hm-week";
      for (let r = 0; r < 7; r++) {
        const inMonth = cursor.getMonth() === m;
        const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime();
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "hm-cell";
        cell.textContent = String(cursor.getDate());
        if (!inMonth) {
          cell.classList.add("fill");
          cell.tabIndex = -1;
        } else {
          const n = hnavDayCounts.get(dayStart) || 0;
          if (n && rangeMax) cell.classList.add(`l${Math.min(4, Math.max(1, Math.ceil(n / rangeMax * 4)))}`);
          if (dayStart === todayStart) cell.classList.add("today");
          if (hnavDayFilter === dayStart) cell.classList.add("selected");
          const label = cursor.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
          const detail = n ? t.calVisits(n) : t.calNoVisits;
          cell.title = `${label} · ${detail}`;
          cell.setAttribute("aria-label", `${label} — ${detail}`);
          if (dayStart > todayStart) cell.disabled = true;
          cell.addEventListener("click", () => setHnavDayFilter(dayStart));
        }
        col.appendChild(cell);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.appendChild(col);
    }
    block.append(monthLabel, weeks);
    grid.appendChild(block);
  }

  scroll.appendChild(grid);
  wrap.append(head, scroll);
  return wrap;
}

/* La heatmap s'adapte à la largeur : au redimensionnement, l'année civile
   complète reste affichée si elle tient ; sinon seuls les mois récents qui
   rentrent sont gardés. Une sélection antérieure à janvier étend la plage. */
let hnavHeatmapResizeTimer = 0;
window.addEventListener("resize", () => {
  if (currentSection !== "historynav") return;
  clearTimeout(hnavHeatmapResizeTimer);
  hnavHeatmapResizeTimer = setTimeout(() => {
    const heat = $("#hnav-heatmap");
    if (heat) heat.replaceChildren(buildHnavHeatmap());
  }, 200);
});

/* Rendu paresseux de la timeline : premier lot de 150 lignes, puis un
   IntersectionObserver sur une sentinelle en bas de liste ajoute le lot suivant
   via requestAnimationFrame tant qu'il reste des lignes. Un changement de
   filtre, de recherche ou de jour annule l'observer et repart du début ; aucun
   plafond n'interrompt la liste, le scroll reste dans le conteneur existant. */
const HNAV_BATCH = 150;
let hnavLazy = null;

function hnavStopLazyRender() {
  if (!hnavLazy) return;
  hnavLazy.observer.disconnect();
  hnavLazy = null;
}

function hnavLazyAppend() {
  const state = hnavLazy;
  if (!state) return;
  let budget = HNAV_BATCH;
  while (budget > 0 && state.cursor < state.days.length) {
    const day = state.days[state.cursor];
    // L'en-tête du jour arrive dans le lot où sa première ligne apparaît.
    if (day.nextRow === 0) state.list.insertBefore(day.section, state.sentinel);
    const end = Math.min(day.dayVisits.length, day.nextRow + budget);
    hnavAppendDayRows(day, day.nextRow, end);
    budget -= end - day.nextRow;
    day.nextRow = end;
    if (day.nextRow >= day.dayVisits.length) state.cursor++;
  }
  if (state.cursor >= state.days.length) {
    hnavStopLazyRender();
    state.sentinel.remove();
  }
}

function renderHnavTimeline(list, visits, query, dayFilter) {
  hnavStopLazyRender();
  const t = t9n();
  if (!visits.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = query ? t.emptyTimelineSearch : dayFilter ? t.emptyDay : t.emptyTimeline;
    list.replaceChildren(empty);
    return;
  }
  const days = new Map();
  for (const v of visits) {
    const k = hnavDayStart(v.ts);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(v);
  }
  const dayStates = [...days.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([k, dayVisits]) => hnavCreateDay(hnavDayLabel(k), dayVisits));
  const sentinel = document.createElement("div");
  sentinel.className = "hg-sentinel";
  sentinel.setAttribute("aria-hidden", "true");
  const observer = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    const state = hnavLazy;
    if (!state) return;
    requestAnimationFrame(() => { if (hnavLazy === state) hnavLazyAppend(); });
  }, { rootMargin: "600px" });
  hnavLazy = { days: dayStates, list, sentinel, observer, cursor: 0 };
  list.replaceChildren(sentinel);
  observer.observe(sentinel);
  hnavLazyAppend();
}

/* Rendu paresseux du panneau Pages : sections par jour créées au fil de
   l'ajout de leurs lignes (même mécanique que la timeline), par lots via un
   IntersectionObserver — plus de rendu en bloc de milliers de lignes. */
const HNAV_PAGES_BATCH = 150;
let hnavPagesLazy = null;

function hnavStopPagesLazy() {
  if (!hnavPagesLazy) return;
  hnavPagesLazy.observer.disconnect();
  hnavPagesLazy = null;
}

function renderHnavPages(list, pages) {
  hnavStopPagesLazy();
  const t = t9n();
  if (!pages.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = t.emptyPages;
    list.replaceChildren(empty);
    return;
  }
  const days = new Map();
  for (const p of pages) {
    const k = p.lastVisitTime ? hnavDayStart(p.lastVisitTime) : 0;
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(p);
  }
  const groups = [...days.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([k, dayPages]) => ({ key: k, dayPages, section: null, body: null, next: 0 }));
  const sentinel = document.createElement("div");
  sentinel.className = "hg-sentinel";
  sentinel.setAttribute("aria-hidden", "true");
  const observer = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    const state = hnavPagesLazy;
    if (!state) return;
    requestAnimationFrame(() => { if (hnavPagesLazy === state) hnavPagesLazyAppend(); });
  }, { rootMargin: "600px" });
  hnavPagesLazy = { groups, list, sentinel, observer, cursor: 0 };
  list.replaceChildren(sentinel);
  observer.observe(sentinel);
  hnavPagesLazyAppend();
}

// Panneau Pages : segmenté par jour de dernière visite (mêmes sections titrées
// que la timeline, du plus récent au plus ancien), regroupement par page —
// l'heure de dernière visite remplace la date, portée par le titre du jour.
function hnavPagesLazyAppend() {
  const state = hnavPagesLazy;
  if (!state) return;
  const t = t9n();
  let budget = HNAV_PAGES_BATCH;
  while (budget > 0 && state.cursor < state.groups.length) {
    const g = state.groups[state.cursor];
    // L'en-tête du jour arrive dans le lot où sa première ligne apparaît.
    if (g.next === 0) {
      g.section = document.createElement("section");
      g.section.className = "hg-day";
      const title = document.createElement("h3");
      title.className = "hg-day-title";
      const labelSpan = document.createElement("span");
      labelSpan.textContent = g.key ? hnavDayLabel(g.key) : t.unknownDay;
      const countSpan = document.createElement("span");
      countSpan.textContent = `${g.dayPages.length} page${g.dayPages.length > 1 ? "s" : ""}`;
      title.append(labelSpan, countSpan);
      g.body = document.createElement("div");
      g.body.className = "hnav-pages-body";
      g.section.append(title, g.body);
      state.list.insertBefore(g.section, state.sentinel);
    }
    const end = Math.min(g.dayPages.length, g.next + budget);
    for (let i = g.next; i < end; i++) {
      const p = g.dayPages[i];
      const row = document.createElement("div");
      row.className = "row hnav-page-row";
      row.dataset.url = p.url;
      row.title = "Rouvrir dans un nouvel onglet";
      const when = p.lastVisitTime
        ? new Date(p.lastVisitTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "";
      // Le multiplicateur vit dans sa propre colonne, avant l'heure : la colonne
      // heure reste alignée d'une ligne à l'autre.
      row.innerHTML = `
        <img src="${faviconUrl(p.url, 32)}" alt="" loading="lazy">
        <span class="grow"><b style="font-weight:500">${escapeHtml(p.title || p.url)}</b><small>${escapeHtml(p.url)}</small></span>
        ${p.visitCount > 1 ? `<span class="pages-x muted">×${p.visitCount}</span>` : ""}
        <span class="hg-open-pill">${t.openPill}</span>
        <span class="num muted">${when}</span>
        <button type="button" class="btn btn-ghost btn-sm hg-star" data-bookmark="${escapeHtml(p.url)}" title="Ajouter aux favoris" aria-label="Ajouter ${escapeHtml(p.title || p.url)} aux favoris">${HNAV_STAR_SVG}</button>`;
      g.body.appendChild(row);
    }
    budget -= end - g.next;
    g.next = end;
    if (g.next >= g.dayPages.length) state.cursor++;
  }
  if (state.cursor >= state.groups.length) {
    hnavStopPagesLazy();
    state.sentinel.remove();
  }
}

// Hostname de visite sans préfixe www. ; null si l'URL ne se parse pas.
function hnavVisitHost(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

/* ---------- onglets encore ouverts ---------- */
/* Marquage temps réel des visites/pages dont l'URL est encore ouverte dans un
   onglet : pastille « ouvert » + fond vert très clair sur la ligne (les lignes
   standard restent telles quelles). Les onglets suspendus sont déballés vers
   leur URL réelle ; tout changement d'onglet re-marque les lignes affichées. */
let hnavOpenUrls = new Set();

async function refreshHnavOpenUrls() {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const urls = new Set();
  for (const t of tabs) {
    let url = t.url;
    if (!url) continue;
    const real = window.BSSessionLib?.unwrapSuspended?.(url);
    if (real) url = real.url;
    if (/^https?:/i.test(url)) urls.add(url);
  }
  hnavOpenUrls = urls;
}

function applyHnavOpenMarks() {
  $$("#section-historynav [data-url]").forEach((row) => {
    row.classList.toggle("is-open", hnavOpenUrls.has(row.dataset.url));
  });
}

let hnavOpenTimer = 0;
function scheduleHnavOpenRefresh() {
  clearTimeout(hnavOpenTimer);
  hnavOpenTimer = setTimeout(async () => {
    await refreshHnavOpenUrls();
    if (currentSection === "historynav") applyHnavOpenMarks();
  }, 500);
}
for (const ev of ["onCreated", "onRemoved", "onUpdated"]) {
  chrome.tabs[ev]?.addListener(scheduleHnavOpenRefresh);
}

// Décompte par hostname des visites postérieures à start : total + première URL vue (pour la favicône).
function hnavCountDomains(visits, start) {
  const counts = new Map();
  for (const v of visits) {
    if (v.ts < start) continue;
    const host = hnavVisitHost(v.url);
    if (!host) continue;
    const entry = counts.get(host);
    if (entry) entry.n++;
    else counts.set(host, { host, n: 1, firstUrl: v.url });
  }
  return counts;
}

// Top 3 domaines sous le chiffre d'une tuile : une seule div.tile-domains par carte.
function hnavRenderTileDomains(statId, counts) {
  const card = document.getElementById(statId)?.closest(".card");
  if (!card) return;
  card.querySelector(".tile-domains")?.remove();
  if (!counts.size) return;
  const top = [...counts.values()].sort((a, b) => b.n - a.n || a.host.localeCompare(b.host)).slice(0, 3);
  const box = document.createElement("div");
  box.className = "tile-domains";
  for (const d of top) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile-domain";
    btn.title = d.host;
    btn.innerHTML = `<img src="${faviconUrl(d.firstUrl, 32)}" alt="" loading="lazy"><span class="d">${escapeHtml(d.host)}</span><span class="n">×${d.n.toLocaleString("fr-FR")}</span>`;
    btn.addEventListener("click", () => {
      const search = document.getElementById("historynav-search");
      if (!search) return;
      search.value = d.host;
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    box.appendChild(btn);
  }
  card.appendChild(box);
}

/* ---------- persistance de l'historique collecté ---------- */
/* La collecte (search + getVisits par page) est lente. Les visites collectées
   sont donc persistées dans chrome.storage.local : à l'ouverture de la section,
   l'affichage est INSTANTANÉ depuis ce cache (stale-while-revalidate), puis une
   re-collecte discrète rafraîchit et re-persiste. La recherche filtre côté
   client (titre + URL) : plus aucun re-balayage par requête. */
const HNAV_PERSIST_KEY = "bs.hnav.persisted";

async function readPersistedHnav() {
  const data = await storage.get(HNAV_PERSIST_KEY);
  if (!data || !Array.isArray(data.visits) || !Array.isArray(data.pages)) return null;
  return data;
}

function hnavDataSig(visits) {
  return visits.length ? `${visits.length}:${visits[0].ts}:${visits[visits.length - 1].ts}` : "0";
}

async function persistHnav(windowDays, allVisits, visitedPages) {
  const sig = hnavDataSig(allVisits);
  const prev = await readPersistedHnav();
  if (prev && prev.sig === sig && prev.windowDays === windowDays) return; // rien n'a bougé
  await storage.set({ [HNAV_PERSIST_KEY]: { version: 1, windowDays, savedAt: Date.now(), sig, visits: allVisits, pages: visitedPages } });
}

// Collecte complète de la fenêtre (sans filtre texte) : visites nettoyées +
// pages déduites des visites. Utilisée par le premier chargement et la
// revalidation en arrière-plan.
async function hnavCollectAll(windowDays) {
  // 0 = Illimité : startTime 0 demande tout l'historique à chrome.history.search.
  const cutoff = windowDays > 0 ? Date.now() - windowDays * 86400000 : 0;
  const items = await chrome.history.search({ text: "", startTime: cutoff, maxResults: 0 });
  const byUrl = new Map();
  for (const it of items) {
    if (!/^https?:\/\//i.test(it.url || "")) continue;
    const prev = byUrl.get(it.url);
    if (prev) {
      prev.visitCount += it.visitCount || 1;
      if ((it.lastVisitTime || 0) > prev.lastVisitTime) {
        prev.lastVisitTime = it.lastVisitTime || 0;
        prev.title = it.title;
      }
    } else {
      byUrl.set(it.url, { url: it.url, title: it.title, lastVisitTime: it.lastVisitTime || 0, visitCount: it.visitCount || 1 });
    }
  }
  const pages = [...byUrl.values()].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  const allVisits = await hnavCollectVisits(pages, cutoff);
  // Panneaux : fenêtre de scan complète ; pages = URL distinctes des visites,
  // pour des chiffres cohérents avec la ligne de compte.
  const byVisitUrl = new Map();
  for (const v of allVisits) {
    const p = byVisitUrl.get(v.url);
    if (p) p.visitCount++;
    else byVisitUrl.set(v.url, { url: v.url, title: v.title, lastVisitTime: v.ts, visitCount: 1 });
  }
  const visitedPages = [...byVisitUrl.values()].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  return { allVisits, visitedPages };
}

// Re-collecte discrète après un affichage instantané depuis le cache persisté :
// l'écran montre immédiatement les données d'hier, la fraîcheur du jour revient
// dès que la collecte termine.
async function hnavRevalidateInBackground(query, windowDays, token) {
  try {
    const { allVisits, visitedPages } = await hnavCollectAll(windowDays);
    if (token !== historynavRenderToken) return;
    hnavCache = { key: `${windowDays}|${hnavDataDirty}`, allVisits, visitedPages };
    persistHnav(windowDays, allVisits, visitedPages).catch(() => {});
    hnavRenderCollected(query, windowDays, allVisits, visitedPages);
  } catch { /* la vue persistée reste affichée */ }
}

async function renderBrowserHistory(query = "") {
  const timeline = $("#hnav-timeline-list");
  const pagesList = $("#hnav-pages-list");
  if (!timeline || !pagesList) return;
  const api = chrome.history;
  if (!api?.getVisits) {
    historynavPages = [];
    { const el = $("#historynav-count"); if (el) el.textContent = ""; }
    $("#hnav-daynav")?.replaceChildren();
    $("#hnav-heatmap")?.replaceChildren();
    timeline.innerHTML = pagesList.innerHTML = `<p class="muted">${t9n().historyPermission}</p>`;
    return;
  }
  const token = ++historynavRenderToken;
  await refreshHnavOpenUrls(); // pastilles « ouvert » à jour (une requête rapide)
  const windowDays = await getHnavWindowDays();
  // Cache mémoire : fenêtre + invalidations — la recherche filtre côté client,
  // la clé ne dépend plus de la requête.
  const cacheKey = `${windowDays}|${hnavDataDirty}`;
  let { allVisits, visitedPages } = hnavCache.key === cacheKey ? hnavCache : { allVisits: null, visitedPages: null };
  if (allVisits) {
    hnavRenderCollected(query, windowDays, allVisits, visitedPages);
    return;
  }
  // Affichage instantané depuis l'historique persisté, puis revalidation.
  const persisted = await readPersistedHnav();
  if (persisted && persisted.windowDays === windowDays && persisted.visits.length) {
    allVisits = persisted.visits;
    visitedPages = persisted.pages;
    if (token !== historynavRenderToken) return;
    hnavCache = { key: cacheKey, allVisits, visitedPages };
    hnavRenderCollected(query, windowDays, allVisits, visitedPages);
    hnavRevalidateInBackground(query, windowDays, token);
    return;
  }
  // Premier lancement (aucun cache persisté) : collecte avec loader.
  timeline.innerHTML = `<p class="muted">${t9n().loading}</p>`;
  const collected = await hnavCollectAll(windowDays);
  allVisits = collected.allVisits;
  visitedPages = collected.visitedPages;
  if (token !== historynavRenderToken) return;
  hnavCache = { key: cacheKey, allVisits, visitedPages };
  persistHnav(windowDays, allVisits, visitedPages).catch(() => {});
  hnavRenderCollected(query, windowDays, allVisits, visitedPages);
}

// Rendu complet depuis les données collectées : la recherche filtre côté client
// (titre + URL, insensible à la casse) — même comportement que la recherche
// chrome.history, sans son coût.
function hnavRenderCollected(query, windowDays, allVisits, visitedPages) {
  const timeline = $("#hnav-timeline-list");
  const pagesList = $("#hnav-pages-list");
  const q = query.trim().toLowerCase();
  const visits = q
    ? allVisits.filter((v) => (v.title || "").toLowerCase().includes(q) || v.url.toLowerCase().includes(q))
    : allVisits;
  const pages = q
    ? visitedPages.filter((p) => (p.title || "").toLowerCase().includes(q) || p.url.toLowerCase().includes(q))
    : visitedPages;
  // Cartes : comptages sur la fenêtre de scan complète (today/7 j/mois/année en cours).
  const now = new Date();
  const todayStart = hnavDayStart(Date.now());
  const weekStart = Date.now() - 7 * 86400000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;
  for (const v of allVisits) {
    if (v.ts >= todayStart) todayCount++;
    if (v.ts >= weekStart) weekCount++;
    if (v.ts >= monthStart) monthCount++;
    if (v.ts >= yearStart) yearCount++;
  }
  $("#hnav-stat-today")?.replaceChildren(todayCount.toLocaleString("fr-FR"));
  $("#hnav-stat-week")?.replaceChildren(weekCount.toLocaleString("fr-FR"));
  $("#hnav-stat-month")?.replaceChildren(monthCount.toLocaleString("fr-FR"));
  $("#hnav-stat-year")?.replaceChildren(yearCount.toLocaleString("fr-FR"));
  // Top domaines : mêmes bornes que les compteurs, comptés puis injectés après le rendu des chiffres.
  for (const [statId, start] of [
    ["hnav-stat-today", todayStart],
    ["hnav-stat-week", weekStart],
    ["hnav-stat-month", monthStart],
    ["hnav-stat-year", yearStart],
  ]) {
    hnavRenderTileDomains(statId, hnavCountDomains(allVisits, start));
  }
  historynavPages = pages;
  { const el = $("#historynav-count"); if (el) el.textContent = t9n().countLine(visits.length, pages.length, windowDays); }
  renderHnavDayNav(visits);
  // Le filtre par jour ne s'applique qu'à la liste Timeline : compteurs, recherche
  // et panneau Pages restent sur la fenêtre complète.
  const dayVisits = hnavDayFilter === null ? visits : visits.filter((v) => hnavDayStart(v.ts) === hnavDayFilter);
  renderHnavTimeline(timeline, dayVisits, query, hnavDayFilter !== null);
  renderHnavPages(pagesList, pages);
}

/* ---------- refresh + boot ---------- */

async function updateSyncStatus() {
  const last = await storage.get("lastRefresh");
  const time = new Date(last || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  $("#sync-status")?.replaceChildren(`Synchronisé à ${time}`);
}

async function rescanBookmarks(options = { silent: false }) {
  // Relecture locale de l'arbre : aucun appel réseau ici (le scan de liens morts reste dans runScan).
  const tree = (await chrome.bookmarks.getTree())[0];
  ALL = flatten(tree.children);
  ACTIVE = ALL.filter((b) => !isQuarantined(b) && !isHistorized(b));
  const q = (await storage.get("quarantine")) || {};
  // Les URL en quarantaine gardent leur CHECKS pour le contrôle quotidien des liens morts.
  const validUrls = new Set([...ACTIVE.map((b) => b.url), ...Object.values(q).map((e) => e?.url).filter(Boolean)]);
  for (const url of Object.keys(CHECKS)) {
    if (!validUrls.has(url)) delete CHECKS[url];
  }
  await storage.set({ checks: CHECKS, lastRefresh: Date.now() });
  await refresh();
  await updateSyncStatus();
  if (!options.silent) {
    const folderPaths = new Set();
    for (const b of ACTIVE) b.path.forEach((_, i) => folderPaths.add(b.path.slice(0, i + 1).join("/")));
    const dupes = groupDuplicates(ACTIVE, 1).reduce((n, g) => n + g.duplicates.length, 0);
    toast(`Favoris réanalysés : ${ACTIVE.length.toLocaleString("fr-FR")} favoris, ${folderPaths.size.toLocaleString("fr-FR")} dossiers, ${dupes.toLocaleString("fr-FR")} doublon(s) en surplus (niveau 1).`);
  }
}

async function refresh() {
  const tree = (await chrome.bookmarks.getTree())[0];
  ALL = flatten(tree.children);
  ACTIVE = ALL.filter((b) => !isQuarantined(b) && !isHistorized(b));
  renderInventory();
  renderQuarantine();
  renderHistory();
  renderGalleryFolderOptions();
  galleryApply();
  if (document.querySelector('[data-tab="dedupe"].active')) renderDedupe();
  renderDead();
  renderCemetery();
  await updateSyncStatus();
}

/* Page d'accueil : ouvre la section choisie dans les réglages (réglage
   « newtab » de la bibliothèque de sessions). S'applique à toute ouverture
   de l'app, y compris en page « nouvel onglet » (Ctrl+T, déclarée dans le
   manifest). gallery est un sous-onglet des favoris ; off = comportement
   d'origine (favoris). */
const HOME_SECTIONS = new Set(["bookmarks", "gallery", "historynav", "tabgroups", "sessions"]);
async function applyHome() {
  const lib = (await chrome.storage.local.get("bs.sessions.library"))["bs.sessions.library"];
  const target = lib?.settings?.newtab;
  if (!target || !HOME_SECTIONS.has(target)) return;
  if (target !== "bookmarks" && target !== "gallery") {
    document.querySelector(`.rail-tab[data-section="${target}"]`)?.click();
    return;
  }
  document.querySelector('.rail-tab[data-section="bookmarks"]')?.click();
  if (target === "gallery") openAppTab("gallery");
}

async function boot() {
  await loadSettings();
  const storedLang = await storage.get("uiLang");
  uiLang = storedLang === "en" ? "en" : "fr";
  const langSelect = $("#setting-language");
  if (langSelect) langSelect.value = uiLang;
  applyUiLang();
  refreshTabsPermissionBanner();
  CHECKS = (await storage.get("checks")) || {};
  const purged = await purgeExpired();
  if (purged) toast(`${purged} élément(s) de quarantaine de plus de ${QUARANTINE_DAYS} j ont été supprimés définitivement.`);
  const last = await storage.get("lastScan");
  $("#backup-info").textContent = last
    ? `Dernier scan complet : ${fmtDate(last)}`
    : "Aucun scan effectué pour le moment.";
  await seedCemetery();
  await refresh();
  renderDead();
  renderCemetery();
  recheckQuarantinedDeadLinks();
  initSettingsForm();
  applyHome().catch(console.warn);
  autostartScan();
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
/* Relance du scan des liens morts depuis son propre onglet : même fonction,
   même barre de progression et mêmes toasts que le bouton principal. */
{
  const deadRescan = document.createElement("button");
  deadRescan.type = "button";
  deadRescan.id = "btn-dead-rescan";
  deadRescan.className = "btn btn-ghost btn-sm";
  deadRescan.textContent = t9n().deadRescan;
  deadRescan.addEventListener("click", runScan);
  $("#tab-dead .toolbar")?.prepend(deadRescan);
}
$("#dead-trash").addEventListener("click", trashDeadLinks);
$("#gallery-search").addEventListener("input", galleryApply);
$("#gallery-folder-trigger")?.addEventListener("click", () => {
  const panel = $("#gallery-folder-panel");
  if (!panel) return;
  setGalleryFolderPanel(panel.classList.contains("hidden"));
});
$("#gallery-folder-panel")?.addEventListener("click", (e) => {
  const item = e.target.closest(".gallery-folder-item");
  if (!item) return;
  galleryFolder = item.dataset.galleryFolder || "";
  $$("#gallery-folder-panel .gallery-folder-item").forEach((b) => {
    const selected = b === item;
    b.classList.toggle("active", selected);
    b.setAttribute("aria-selected", String(selected));
  });
  updateGalleryFolderLabel();
  setGalleryFolderPanel(false);
  galleryApply();
});
document.addEventListener("click", (e) => {
  const panel = $("#gallery-folder-panel");
  if (!panel || panel.classList.contains("hidden")) return;
  if (e.target.closest("#gallery-folder-panel") || e.target.closest("#gallery-folder-trigger")) return;
  setGalleryFolderPanel(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setGalleryFolderPanel(false);
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
/* Cimetière : actions déléguées sur le panneau reconstruit à chaque rendu. */
$("#tab-history")?.addEventListener("click", async (e) => {
  const t = t9n();
  const readd = e.target.closest("button[data-cemetery-readd]");
  if (readd) {
    const entries = await listCemetery();
    const entry = entries[Number(readd.dataset.cemeteryReadd)];
    if (!entry?.url) return;
    const parentId = await cemeteryTargetFolder(entry.path);
    try {
      await chrome.bookmarks.create({ parentId, title: entry.title || entry.url, url: entry.url });
      toast("Favori réajouté.");
    } catch {
      toast("Impossible de recréer ce favori.");
    }
    return;
  }
  const remove = e.target.closest("button[data-cemetery-remove]");
  if (remove) {
    const entries = await listCemetery();
    entries.splice(Number(remove.dataset.cemeteryRemove), 1);
    await storage.set({ [CEMETERY_KEY]: entries });
    await renderCemetery();
    return;
  }
  if (e.target.closest("#btn-cemetery-clear")) {
    const entries = await listCemetery();
    if (!entries.length) return toast(t.cemeteryEmpty);
    if (!confirm(`Vider le cimetière (${entries.length} favoris) ? Cette action est définitive.`)) return;
    await storage.set({ [CEMETERY_KEY]: [] });
    await renderCemetery();
    toast("Cimetière vidé.");
  }
});
$("#btn-empty-trash").addEventListener("click", emptyTrash);
$("#btn-restore-all").addEventListener("click", async () => {
  const ids = $$("#trash-groups button[data-restore]").map((b) => b.dataset.restore);
  if (!ids.length) return toast("La quarantaine est vide.");
  await withSuppressedRescan(() => restoreFromTrash(ids));
  toast(`${ids.length} bookmark(s) restauré(s) à leur emplacement d'origine.`);
  await refresh();
});
$("#trash-list").addEventListener("click", async (e) => {
  const revive = e.target.closest("button[data-restore-alive]");
  if (revive) {
    const ids = revive.dataset.restoreAlive.split(",");
    await withSuppressedRescan(() => restoreFromTrash(ids));
    toast(`${ids.length} lien(s) restauré(s) — ils répondent de nouveau.`);
    await refresh();
    return;
  }
  const btn = e.target.closest("button[data-restore]");
  if (!btn) return;
  await withSuppressedRescan(() => restoreFromTrash([btn.dataset.restore]));
  toast("Bookmark restauré à son emplacement d'origine.");
  await refresh();
});
$("#trash-groups").addEventListener("click", async (e) => {
  if (e.target.closest("#btn-quarantine-recheck-all")) {
    await recheckQuarantineAll();
    return;
  }
  const purge = e.target.closest("button[data-purge]");
  if (purge) {
    await purgeQuarantineEntry(purge.dataset.purge);
    return;
  }
  const recheck = e.target.closest("button[data-recheck]");
  if (recheck) {
    const url = recheck.dataset.recheck;
    recheck.disabled = true;
    recheck.textContent = "…";
    const results = await window.BSQuarantine?.recheckUrls([url]).catch(() => null);
    const result = results?.get(url);
    if (!result) {
      recheck.disabled = false;
      recheck.textContent = t9n().recheck;
      return toast(t9n().recheckMissing);
    }
    applyQuarantineRecheckResult(recheck, result);
    return;
  }
  const restore = e.target.closest("button[data-restore]");
  if (!restore) return;
  await withSuppressedRescan(() => restoreFromTrash([restore.dataset.restore]));
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
  await withSuppressedRescan(() => restoreHistorySnapshot(item.id));
  await refresh();
  toast("Instantané restauré. Les favoris actuels ont été conservés.");
});

/* Resynchronisation automatique : les changements de favoris faits dans Chrome
   déclenchent une relecture silencieuse, sauf pendant une opération interne qui
   rafraîchit déjà l'interface elle-même. */
let suppressRescan = false;
let rescanTimer = 0;
async function withSuppressedRescan(fn) {
  suppressRescan = true;
  try { return await fn(); } finally { suppressRescan = false; }
}
function scheduleRescan() {
  if (suppressRescan) return;
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => rescanBookmarks({ silent: true }), 800);
}
for (const event of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
  chrome.bookmarks[event]?.addListener(scheduleRescan);
}

$("#btn-rescan")?.addEventListener("click", async () => {
  const btn = $("#btn-rescan");
  btn.disabled = true;
  try { await rescanBookmarks(); } finally { btn.disabled = false; }
});

let historynavSearchTimer = 0;
$("#historynav-search")?.addEventListener("input", (e) => {
  clearTimeout(historynavSearchTimer);
  historynavSearchTimer = setTimeout(() => renderBrowserHistory(e.target.value), 300);
});
$("#btn-open-browser-history")?.addEventListener("click", () => chrome.tabs.create({ url: "chrome://history/" }));
$$("#header-historynav .header-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$("#header-historynav .header-tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      if (active) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    $("#hnav-panel-timeline")?.classList.toggle("active", tab.dataset.htab === "timeline");
    $("#hnav-panel-pages")?.classList.toggle("active", tab.dataset.htab === "pages");
  })
);
// Stats vivantes : toute visite ajoutée/supprimée relance le rendu (débounce 800 ms)
// tant que la section historique est affichée ; idem au retour de focus sur la fenêtre.
let historynavLiveTimer = 0;
function invalidateHnavCache() { hnavDataDirty++; }
function scheduleHistorynavLiveRefresh() {
  clearTimeout(historynavLiveTimer);
  historynavLiveTimer = setTimeout(() => {
    if (currentSection !== "historynav") return;
    invalidateHnavCache();
    renderBrowserHistory($("#historynav-search")?.value || "");
  }, 800);
}
chrome.history?.onVisitAdded?.addListener(scheduleHistorynavLiveRefresh);
chrome.history?.onVisitDeleted?.addListener(scheduleHistorynavLiveRefresh);
window.addEventListener("focus", () => {
  if (currentSection === "historynav") renderBrowserHistory($("#historynav-search")?.value || "");
});

/* Onglets de Réglages : même mécanique que les onglets favoris. */
$$("#header-settings .header-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$("#header-settings .header-tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      if (active) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    $$("#section-settings .panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab.dataset.stab));
  })
);
$("#setting-language")?.addEventListener("change", (e) => {
  uiLang = e.target.value === "en" ? "en" : "fr";
  storage.set({ uiLang });
  applyUiLang();
  if (currentSection === "historynav") renderBrowserHistory($("#historynav-search")?.value || "");
  renderCemetery();
  renderQuarantine();
});
$("#setting-history-window")?.addEventListener("change", (e) => {
  const days = Number(e.target.value);
  if (Number.isFinite(days) && days >= 0) storage.set({ hnavWindowDays: days }); // 0 = Illimité
  invalidateHnavCache();
  if (currentSection === "historynav") renderBrowserHistory($("#historynav-search")?.value || "");
});
/* ---------- réglages : extensions, formulaire, données ---------- */

const PK_EXTENSIONS = [
  { name: "PK New Tab", desc: "Chaque nouvel onglet affiche une sélection des dernières actualités design de mondary.design.", store: "https://chromewebstore.google.com/detail/pk-new-tab/boeenonaijkccialgfaeipkhfhnnpfmd", github: "https://github.com/mondary/Chrome_MondaryNewTab", icon: "assets/ext/newtab-icon.png", banner: "https://lh3.googleusercontent.com/-4HRwSit1k8v0mILEI3DIFdbzivUPYj4SxrxvIL6QzgqVGiuJtk_KKzgeGTLeVzXSfIQeTj-WI4FJI5APEb3kA9MEw=s1280-w1280-h800" },
  { name: "PK Sticky Notes", desc: "Posez des notes repositionnables sur n'importe quelle page web et retrouvez-les à votre retour.", store: "https://chromewebstore.google.com/detail/pk-sticky-notes/hphdicffdchamcdembnkggjcdmmoennm", github: "https://github.com/mondary/Chrome_PKStickyNotesChrome", icon: "assets/ext/sticky-icon.png", banner: "https://lh3.googleusercontent.com/ia1UUEhR60D5V-vKBTwytW-mYeG_XVRTBUJcyVVVKVMGpIt8zJLD8JKSY2DHdw91ErkIDPtqTRgEeH8C3Ve0AEdN=s1280-w1280-h800" },
  { name: "PK Highlighter", desc: "Surlignez des mots-clés avec vos couleurs personnalisées, sur n'importe quel site.", store: "https://chromewebstore.google.com/detail/pk-highlighter/nnmkffkeilpnimdbiifhphpnflilhmno", github: "https://github.com/mondary/Chrome_PKhighlighter", icon: "assets/ext/highlighter-icon.png", banner: "assets/ext/highlighter.png" },
  { name: "PK Traduction", desc: "Traduction instantanée des mots sélectionnés, affichée dans une popup discrète.", store: "https://chromewebstore.google.com/detail/pk-traduction/cfiocchdiillmnnemodbnhkbbhamnbmi", github: "https://github.com/mondary/Chrome_TranslateHighlighter", icon: "assets/ext/traduction-icon.png", banner: "assets/ext/traduction.png" },
  { name: "PK Session", desc: "Versionnez vos sessions Chrome et visualisez votre parcours de navigation.", store: "", github: "https://github.com/mondary/Chrome_PKsession-manager", icon: "assets/pk-session-icon.png", banner: "assets/ext/session.png" },
  { name: "PK SimpleGmail", desc: "Une interface Gmail épurée, plus claire et plus agréable à utiliser au quotidien.", store: "https://chromewebstore.google.com/detail/pk-simplegmail/kijhhekofbbmdgnheepmjcenehmgepgl", github: "", icon: "https://lh3.googleusercontent.com/1XsHY0yXAebqJqlUHewVEDdUSIwwUqpkeRUc04ACMKxq20i_7FrBytJ5WBVZHoPcrZOVfxA9JbgFo9g3kkEoua5j1i0=s128", banner: "https://lh3.googleusercontent.com/V2pwUM0ltITbh5dFdlhU_MzndzgGmB4eyvRKcJVP0qxsIl5JVkk9IlMvaMOXsXQPjlZE82Zk-2Kwa4diONXLgebWlA=s1280-w1280-h800" },
  { name: "PK Screenshot Resizer", desc: "Redimensionnez vos fenêtres aux bonnes dimensions et capturez des captures d'écran nettes.", store: "https://chromewebstore.google.com/detail/pk-screenshot-resizer/cflcjjojlhkapblmgogjfkfbaocfbbpc", github: "", icon: "https://lh3.googleusercontent.com/3BqIot-xY16QQ7X6-4SM_W8efsC-sJ938rOQAjubUuK9vpmgaRO1UxKKHpDd2IDLhTS86qs7QUp67STqdCjevR6Ig=s128", banner: "https://lh3.googleusercontent.com/aK84AwhJti-nQ7vAXyij_COmPgITU64PVMwh6StDqH2IhPMVktc1qtmVpr5Tv-T1hKY9VnPo6kvceWlu3wYo0gcr95A=s1280-w1280-h800" },
  { name: "PK Chrome Shortcuts", desc: "67 raccourcis clavier pour Chrome, pour aller plus vite partout dans le navigateur.", store: "https://chromewebstore.google.com/detail/pk-chrome-shortcuts/cjgecoangnnoihcdplnoanbmajpanned", github: "https://github.com/mondary/Chrome_PKshortcuts", icon: "assets/ext/shortcuts-icon.png", banner: "https://lh3.googleusercontent.com/LhinYQ0_KXktVUIJEVc2RGQspBiEEgV-TKEPZZGmtX0-o5M5oH9BzDxyenj15C_Xu-muUpAUOQIEMpl89dCwZwFTDw=s1280-w1280-h800" },
];

const STORE_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.8v3.5l2.3 1.4" stroke-linecap="round"/></svg>';
const GITHUB_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

function renderOtherExtensions() {
  const wrap = $("#other-extensions");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const ext of PK_EXTENSIONS) {
    const item = document.createElement("article");
    item.className = "ext-item";
    const storeLink = ext.store
      ? `<a class="btn btn-primary btn-sm" href="${ext.store}" target="_blank" rel="noopener">${STORE_SVG}Chrome Web Store<svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h5v5M14 2 7 9"/><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/></svg></a>`
      : `<span class="muted ext-nolink">Hors store — GitHub uniquement</span>`;
    const githubLink = ext.github
      ? `<a class="btn btn-ghost btn-sm" href="${ext.github}" target="_blank" rel="noopener">${GITHUB_SVG}GitHub<svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h5v5M14 2 7 9"/><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/></svg></a>`
      : "";
    item.innerHTML = `
      <a class="ext-banner" href="${ext.store || ext.github || "#"}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="${ext.banner}" alt="" loading="lazy"></a>
      <div class="ext-body">
        <h3 class="ext-name"><img src="${ext.icon}" alt="" loading="lazy">${escapeHtml(ext.name)}</h3>
        <p class="ext-desc">${escapeHtml(ext.desc)}</p>
        <div class="ext-links">${storeLink}${githubLink}</div>
      </div>`;
    wrap.appendChild(item);
  }
}

async function initSettingsForm() {
  await loadSettings();
  const set = (sel, val) => { const el = $(sel); if (el) el.value = String(val); };
  set("#setting-language", uiLang);
  set("#setting-scan-concurrency", await storageNum("scanConcurrency", 12));
  set("#setting-scan-timeout", await storageNum("scanTimeoutSec", 15));
  set("#setting-quarantine-days", await storageNum("quarantineDays", 30));
  const auto = $("#setting-scan-autostart");
  if (auto) auto.checked = !!SET.scanAutostart;
  const cf = $("#setting-scan-confirm");
  if (cf) cf.checked = SET.scanConfirm !== false;
  const recheck = $("#setting-scan-recheck");
  if (recheck) recheck.value = String(SET.scanRecheckDays ?? 7);
  const thumbs = $("#setting-thumbs-mode");
  if (thumbs) thumbs.value = SET.thumbsMode || "mshots";
  const cols = $("#setting-gallery-columns");
  if (cols) {
    const saved = localStorage.getItem("galleryColumns") || "auto";
    cols.value = String(saved);
    cols.addEventListener("change", (e) => {
      localStorage.setItem("galleryColumns", e.target.value);
      galleryColumns = e.target.value === "auto" ? "auto" : Number(e.target.value) || 4;
      if (typeof galleryApply === "function") galleryApply();
    });
  }
  renderOtherExtensions();
}

$("#setting-scan-concurrency")?.addEventListener("change", async (e) => {
  const n = Number(e.target.value);
  await storage.set({ scanConcurrency: n });
  SCAN_CONCURRENCY = n;
});
$("#setting-scan-timeout")?.addEventListener("change", async (e) => {
  const n = Number(e.target.value);
  await storage.set({ scanTimeoutSec: n });
  SCAN_TIMEOUT = n * 1000;
});
$("#setting-scan-recheck")?.addEventListener("change", async (e) => {
  SET.scanRecheckDays = Number(e.target.value);
  await storage.set({ settings: SET });
});
$("#setting-scan-autostart")?.addEventListener("change", async (e) => {
  SET.scanAutostart = e.target.checked;
  await storage.set({ settings: SET });
});
$("#setting-scan-confirm")?.addEventListener("change", async (e) => {
  SET.scanConfirm = e.target.checked;
  await storage.set({ settings: SET });
});
$("#setting-thumbs-mode")?.addEventListener("change", async (e) => {
  SET.thumbsMode = e.target.value;
  await storage.set({ settings: SET });
  if (typeof galleryApply === "function") galleryApply();
});
$("#setting-quarantine-days")?.addEventListener("change", async (e) => {
  const n = Number(e.target.value);
  await storage.set({ quarantineDays: n });
  await loadQuarantineDays();
  renderQuarantine();
});
$("#setting-clear-thumbs")?.addEventListener("click", async () => {
  await storage.set({ thumbnails: {} });
  if (typeof galleryApply === "function") galleryApply();
  toast("Cache des miniatures vidé.");
});
$("#setting-reset-all")?.addEventListener("click", async () => {
  if (!confirm("Effacer toutes les données de l'extension (statuts de scan, quarantaine, archives, réglages) ? Les favoris Chrome ne sont pas touchés.")) return;
  await chrome.storage.local.clear();
  location.reload();
});

async function autostartScan() {
  if (!SET.scanAutostart) return;
  const urls = [...new Set(ACTIVE.filter((b) => /^https?:/.test(b.url) && !isLocalUrl(b.url)).map((b) => b.url))]
    .filter((u) => !CHECKS[u])
    .sort((a, b) => (CHECKS[a]?.t || 0) - (CHECKS[b]?.t || 0))
    .slice(0, 40);
  if (!urls.length) return;
  for (const url of urls) {
    const s = await fetchStatus(url);
    const prev = CHECKS[url] || { ds: 0 };
    CHECKS[url] = { s, t: Date.now(), ds: s === "dead" ? prev.ds || Date.now() : 0 };
  }
  await storage.set({ checks: CHECKS });
  renderDead();
}

$("#section-historynav")?.addEventListener("click", async (e) => {
  if (!e.target.closest("button, a, input")) {
    const row = e.target.closest("[data-url]");
    if (row) {
      // Réutilise l'onglet déjà ouvert sur cette URL plutôt que d'en ouvrir un nouveau.
      const found = await chrome.tabs.query({ url: row.dataset.url });
      if (found.length) {
        await chrome.tabs.update(found[0].id, { active: true });
        chrome.windows.update(found[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: row.dataset.url });
      }
      return;
    }
  }
  const btn = e.target.closest("button[data-bookmark]");
  if (!btn) return;
  const page = historynavPages.find((p) => p.url === btn.dataset.bookmark);
  if (!page) return;
  await chrome.bookmarks.create({ parentId: "1", title: page.title || page.url, url: page.url });
  toast("Favori ajouté.");
  btn.classList.add("added");
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke="none"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3.1-3 4.3-.6z"/></svg>`;
});

boot();
