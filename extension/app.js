/* Bookmarks Sorter — vanilla JS, no build step. */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const SCAN_TIMEOUT = 15000;
const SCAN_CONCURRENCY = 12;
const DEAD_DAYS = 30;
const PAGE_SIZE = 60;

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
    groups.push({ keep: members[0], duplicates: members.slice(1) });
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
  return `chrome://favicon2/?size=${size}&scale_factor=1x&page_url=${encodeURIComponent(url)}`;
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
let CHECKS = {};

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
  })
);

/* ---------- inventory ---------- */

function renderInventory() {
  const folders = new Map();
  const domains = new Map();
  for (const b of ALL) {
    const key = b.path.join("/") || "(racine)";
    folders.set(key, (folders.get(key) || 0) + 1);
    const d = domainOf(b.url);
    if (d) domains.set(d, (domains.get(d) || 0) + 1);
  }
  $("#stat-total").textContent = ALL.length.toLocaleString("fr-FR");
  $("#stat-folders").textContent = folders.size.toLocaleString("fr-FR");
  $("#stat-domains").textContent = domains.size.toLocaleString("fr-FR");
  $("#stat-dupes").textContent = groupDuplicates(ALL, 1).reduce((n, g) => n + g.duplicates.length, 0);

  const ft = $("#folder-tree");
  ft.innerHTML = "";
  [...folders.entries()].sort((a, b) => b[1] - a[1]).forEach(([path, n]) => {
    const depth = path === "(racine)" ? 0 : path.split("/").length - 1;
    const row = document.createElement("div");
    row.className = "row";
    row.style.paddingLeft = 8 + depth * 16 + "px";
    row.innerHTML = `<span class="grow" style="${depth === 0 ? "font-weight:600" : ""}">${escapeHtml(path.split("/").pop())}</span><span class="num">${n}</span>`;
    ft.appendChild(row);
  });

  const dl = $("#domain-list");
  dl.innerHTML = "";
  [...domains.entries()].sort((a, b) => b[1] - a[1]).forEach(([d, n]) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span class="grow">${escapeHtml(d)}</span><span class="num">${n}</span>`;
    dl.appendChild(row);
  });
}

/* ---------- gallery ---------- */

let galleryShown = 0;
let galleryFiltered = [];

function renderGalleryFolderOptions() {
  const sel = $("#gallery-folder");
  const folders = [...new Set(ALL.map((b) => b.path.join("/")))].sort();
  for (const f of folders) {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f || "(racine)";
    sel.appendChild(opt);
  }
}

function galleryApply() {
  const q = $("#gallery-search").value.toLowerCase().trim();
  const folder = $("#gallery-folder").value;
  galleryFiltered = ALL.filter((b) => {
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
  for (const b of batch) {
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
    thumb.src = thumbUrl(b.url);
    thumb.onerror = () => { thumb.src = faviconUrl(b.url, 64); };
    fav.src = faviconUrl(b.url);
    fav.onerror = () => fav.remove();
    card.addEventListener("click", () => chrome.tabs.create({ url: b.url }));
    grid.appendChild(card);
  }
  $("#gallery-sentinel").classList.toggle("hidden", galleryShown >= galleryFiltered.length);
}

/* ---------- dedupe ---------- */

const FOLDER_SVG = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M1.5 4a1 1 0 011-1h3.2l1.6 1.8h6.2a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1V4z"/></svg>';
let dedupeGroups = [];

const folderChip = (b) => `<span class="folder-chip">${FOLDER_SVG}<span title="${escapeHtml(b.path.join("/") || "(racine)")}">${escapeHtml(b.path.join("/") || "(racine)")}</span></span>`;

function renderDedupe() {
  const level = Number($("#dedupe-level").value);
  dedupeGroups = groupDuplicates(ALL, level);
  const total = dedupeGroups.reduce((n, g) => n + g.duplicates.length, 0);
  $("#dedupe-summary").textContent =
    dedupeGroups.length ? `${dedupeGroups.length} groupes · ${total} doublons à retirer (le plus ancien est conservé)` : "Aucun doublon à ce niveau.";
  const wrap = $("#dedupe-groups");
  wrap.innerHTML = "";
  const folderOf = (b) => b.path.join("/") || "(racine)";
  dedupeGroups.forEach((g, gi) => {
    const div = document.createElement("div");
    div.className = "group";
    const rows = g.duplicates
      .map(
        (d) => `
      <label class="dup-grid dup-row" title="${escapeHtml(d.url)}">
        <input type="checkbox" checked data-id="${d.id}">
        <span class="cell t">${escapeHtml(d.title || "(sans titre)")}</span>
        ${folderChip(d)}
        <span class="cell u">${escapeHtml(d.url)}</span>
      </label>`
      )
      .join("");
    div.innerHTML = `
      <div class="group-head">
        <span class="muted">${g.duplicates.length} doublon${g.duplicates.length > 1 ? "s" : ""}</span>
        <button class="btn btn-ghost btn-sm" data-group="${gi}">Dédoublonner ce groupe</button>
      </div>
      <div class="dup-grid keep-row">
        <span class="status">gardé</span>
        <span class="cell t">${escapeHtml(g.keep.title || "(sans titre)")}</span>
        ${folderChip(g.keep)}
        <span class="cell u">${escapeHtml(g.keep.url)}</span>
      </div>
      ${rows}`;
    wrap.appendChild(div);
  });
  const allBtn = $("#dedupe-clean-all");
  allBtn.textContent = `Tout dédoublonner (${total})`;
  $("#dedupe-actions").classList.toggle("hidden", !dedupeGroups.length);
}

async function cleanSelectedDuplicates() {
  const ids = $$("#dedupe-groups input:checked").map((i) => i.dataset.id);
  if (!ids.length) return toast("Rien de sélectionné.");
  $("#dedupe-progress").textContent = `0/${ids.length}…`;
  await moveToTrash(ids);
  $("#dedupe-progress").textContent = "";
  toast(`${ids.length} doublons envoyés en quarantaine.`);
  await refresh();
}

async function cleanAllDuplicates() {
  const ids = dedupeGroups.flatMap((g) => g.duplicates.map((d) => d.id));
  if (!ids.length) return;
  if (!confirm(`Envoyer ${ids.length} doublons en quarantaine ? Dans chaque groupe le plus ancien est gardé.`)) return;
  $("#dedupe-progress").textContent = `0/${ids.length}…`;
  await moveToTrash(ids);
  $("#dedupe-progress").textContent = "";
  toast(`${ids.length} doublons envoyés en quarantaine.`);
  await refresh();
}

async function cleanOneGroup(gi) {
  const g = dedupeGroups[gi];
  if (!g) return;
  await moveToTrash(g.duplicates.map((d) => d.id));
  toast(`${g.duplicates.length} doublon(s) envoyé(s) en quarantaine.`);
  await refresh();
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

async function runScan() {
  const urls = [...new Set(ALL.filter((b) => /^https?:/.test(b.url) && !isLocalUrl(b.url)).map((b) => b.url))];
  const incremental = $("#scan-incremental").checked;
  const week = Date.now() - 7 * 86400000;
  const queue = urls.filter((u) => {
    const c = CHECKS[u];
    return !incremental || !c || c.s === "down" || c.s === "dead" || c.t < week;
  });
  if (!queue.length) return toast("Rien à scanner (tout est à jour).");
  if (queue.length > 300 && !confirm(`Scanner ${queue.length} URLs ? Ça peut prendre plusieurs minutes. Laisse cet onglet ouvert.`)) return;

  $("#scan-bar-wrap").classList.remove("hidden");
  $("#scan-run").disabled = true;
  let done = 0;
  const bar = $("#scan-bar");
  const tick = () => {
    done++;
    bar.style.width = (done / queue.length) * 100 + "%";
    $("#scan-summary").textContent = `${done}/${queue.length}`;
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
        ds: alive ? 0 : prev.ds || Date.now(),
      };
      tick();
    }
  });
  await Promise.all(workers);
  await storage.set({ checks: CHECKS, lastScan: Date.now() });
  $("#scan-run").disabled = false;
  $("#scan-summary").textContent = "Scan terminé.";
  renderDead();
  toast("Scan terminé.");
}

function renderDead() {
  const rows = [];
  for (const b of ALL) {
    const c = CHECKS[b.url];
    if (!c || c.s === "alive" || isLocalUrl(b.url)) continue;
    rows.push({ b, c });
  }
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
  $("#dead-trash").disabled = !rows.length;
  $("#dead-trash").textContent = `Mettre en quarantaine les ${rows.length} liens non vivants`;
}

async function trashDeadLinks() {
  const ids = ALL.filter((b) => {
    const c = CHECKS[b.url];
    return c && c.s !== "alive" && !isLocalUrl(b.url);
  }).map((b) => b.id);
  if (!ids.length) return;
  if (!confirm(`Mettre ${ids.length} bookmarks non vivants en quarantaine ? Ils seront supprimés définitivement après ${QUARANTINE_DAYS} j sans restauration.`)) return;
  await moveToTrash(ids);
  toast(`${ids.length} liens morts envoyés en quarantaine.`);
  await refresh();
}

/* ---------- backup ---------- */

function exportJson() {
  download(`bookmarks_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exported: Date.now(), bookmarks: ALL }, null, 1), "application/json");
  toast("Export JSON téléchargé.");
}

function exportHtml() {
  download(`bookmarks_${new Date().toISOString().slice(0, 10)}.html`, netscapeExport(ALL), "text/html");
  toast("Export HTML téléchargé (réimportable dans Chrome).");
}

async function renderQuarantine() {
  const trash = await getTrash();
  const sub = await chrome.bookmarks.getSubTree(trash.id);
  const items = flatten(sub[0].children);
  const q = (await storage.get("quarantine")) || {};
  $("#trash-count").textContent = items.length ? `${items.length} élément(s) en quarantaine` : "Quarantaine vide.";
  const list = $("#trash-list");
  list.innerHTML = "";
  const aliveAgain = items.filter((it) => {
    const entry = q[it.id];
    const c = CHECKS[it.url];
    return entry && c && c.s === "alive" && c.t > entry.ts;
  });
  if (aliveAgain.length) {
    const banner = document.createElement("div");
    banner.className = "row revive-banner";
    banner.innerHTML = `
      <span class="status alive">${STATUS_META.alive.icon}${aliveAgain.length} lien(s) de la quarantaine répondent de nouveau</span>
      <button class="btn btn-ghost btn-sm" data-restore-alive="${aliveAgain.map((i) => i.id).join(",")}">Restaurer</button>`;
    list.appendChild(banner);
  }
  for (const it of items) {
    const entry = q[it.id];
    const left = entry ? Math.ceil((entry.ts + QUARANTINE_DAYS * 86400000 - Date.now()) / 86400000) : null;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <span class="grow"><b style="font-weight:500">${escapeHtml(it.title || "(sans titre)")}</b> <span class="u">${escapeHtml(it.url)}</span></span>
      ${left === null ? "" : `<span class="num muted" title="Supprimé définitivement à l'expiration">${left <= 0 ? "purge imminente" : `encore ${left} j`}</span>`}
      <button class="btn btn-ghost btn-sm" data-restore="${it.id}">Restaurer</button>`;
    list.appendChild(row);
  }
}

async function emptyTrash() {
  const trash = await getTrash();
  const sub = await chrome.bookmarks.getSubTree(trash.id);
  const items = flatten(sub[0].children);
  if (!items.length) return toast("La quarantaine est déjà vide.");
  if (!confirm(`Supprimer DÉFINITIVEMENT les ${items.length} éléments de la quarantaine ?`)) return;
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
  renderInventory();
  renderQuarantine();
  const sel = $("#gallery-folder");
  sel.innerHTML = '<option value="">Tous les dossiers</option>';
  renderGalleryFolderOptions();
  galleryApply();
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
}

/* ---------- wire ---------- */

$("#dedupe-run").addEventListener("click", renderDedupe);
$("#dedupe-clean").addEventListener("click", cleanSelectedDuplicates);
$("#dedupe-clean-all").addEventListener("click", cleanAllDuplicates);
$("#dedupe-groups").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-group]");
  if (btn) cleanOneGroup(Number(btn.dataset.group));
});
$("#scan-run").addEventListener("click", runScan);
$("#dead-trash").addEventListener("click", trashDeadLinks);
$("#gallery-search").addEventListener("input", galleryApply);
$("#gallery-folder").addEventListener("change", galleryApply);
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && galleryShown < galleryFiltered.length) galleryMore();
}, { rootMargin: "600px" }).observe($("#gallery-sentinel"));
$("#btn-export-json").addEventListener("click", exportJson);
$("#btn-export-html").addEventListener("click", exportHtml);
$("#btn-export-json2").addEventListener("click", exportJson);
$("#btn-export-html2").addEventListener("click", exportHtml);
$("#btn-open-trash").addEventListener("click", async () => {
  const trash = await getTrash();
  chrome.tabs.create({ url: `chrome://bookmarks/?id=${trash.id}` });
});
$("#btn-empty-trash").addEventListener("click", emptyTrash);
$("#btn-restore-all").addEventListener("click", async () => {
  const ids = $$("#trash-list button[data-restore]").map((b) => b.dataset.restore);
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

boot();
