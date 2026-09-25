/* Recherche transversale : favoris, historique de navigation et onglets ouverts. */
"use strict";

(() => {
  const MAX_VISIBLE = 10;
  const dialog = document.getElementById("global-search");
  const backdrop = document.getElementById("global-search-backdrop");
  const input = document.getElementById("global-search-input");
  const list = document.getElementById("global-search-results");
  const closeButton = document.getElementById("global-search-close");
  if (!dialog || !backdrop || !input || !list || !closeButton) return;

  let results = [];
  let selectedIndex = -1;
  let searchToken = 0;
  let searchTimer = 0;
  let thumbTimer = 0;
  let previousFocus = null;
  let firstBookmarkRead = null;
  let opening = false;

  const normal = (value) => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const canOpen = (url) => /^https?:\/\//i.test(url || "");

  function score(item, query) {
    const q = normal(query).trim();
    const title = normal(item.title);
    const url = normal(item.url);
    let host = "";
    try { host = normal(new URL(item.url).hostname.replace(/^www\./, "")); } catch { /* URL rare */ }
    const haystack = `${title} ${host} ${url}`;
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return -1;

    let rank = 100;
    if (title === q || host === q) rank = 1000;
    else if (title.startsWith(q)) rank = 820;
    else if (host.startsWith(q) || host.split(".").some((part) => part.startsWith(q))) rank = 760;
    else if (url.startsWith(q)) rank = 650;
    else if (title.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(q))) rank = 570;
    else if (title.includes(q)) rank = 440;
    else if (host.includes(q)) rank = 380;
    else if (url.includes(q)) rank = 280;
    if (item.openTab) rank += 65;
    if (item.sources.has("bookmark")) rank += 35;
    if (item.lastVisitTime) rank += Math.max(0, 20 - (Date.now() - item.lastVisitTime) / 604800000);
    rank += Math.min(15, Math.log2((item.visitCount || 0) + 1) * 2);
    return rank;
  }

  function merge(bookmarks, history, tabs, query) {
    const byUrl = new Map();
    function add(entry, source) {
      const url = String(entry?.url || "");
      if (!canOpen(url)) return;
      let item = byUrl.get(url);
      if (!item) {
        item = { url, title: "", sources: new Set(), lastVisitTime: 0, visitCount: 0, openTab: null };
        byUrl.set(url, item);
      }
      item.sources.add(source);
      if (entry.title && (source === "bookmark" || !item.title)) item.title = entry.title;
      if (source === "history") {
        item.lastVisitTime = Math.max(item.lastVisitTime, entry.lastVisitTime || 0);
        item.visitCount = Math.max(item.visitCount, entry.visitCount || 0);
      }
      if (source === "tab" && (!item.openTab || entry.active)) item.openTab = entry;
    }
    bookmarks.forEach((item) => add(item, "bookmark"));
    history.forEach((item) => add(item, "history"));
    tabs.forEach((tab) => {
      const unwrapped = globalThis.BSSessionLib?.unwrapSuspended?.(tab.url);
      add({ ...tab, url: unwrapped?.url || tab.url, title: unwrapped?.title || tab.title }, "tab");
    });
    return [...byUrl.values()]
      .map((item) => ({ ...item, score: score(item, query) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || b.lastVisitTime - a.lastVisitTime || a.title.localeCompare(b.title, "fr"))
      .slice(0, MAX_VISIBLE);
  }

  async function bookmarksNow() {
    if (typeof ACTIVE !== "undefined" && ACTIVE.length) return ACTIVE;
    firstBookmarkRead ||= chrome.bookmarks.getTree().then((tree) => {
      const all = flatten(tree[0]?.children || []);
      return all.filter((item) => !isQuarantined(item) && !isHistorized(item));
    });
    return firstBookmarkRead;
  }

  function setSelection(index) {
    if (!results.length) {
      selectedIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    selectedIndex = (index + results.length) % results.length;
    for (const [i, row] of [...list.children].entries()) {
      row.setAttribute("aria-selected", String(i === selectedIndex));
    }
    const selected = list.children[selectedIndex];
    input.setAttribute("aria-activedescendant", selected.id);
    selected.scrollIntoView({ block: "nearest" });
  }

  function loadPreviews(items) {
    clearTimeout(thumbTimer);
    if (!items.length || SET.thumbsMode === "favicon") return;
    thumbTimer = setTimeout(() => {
      for (const [index, item] of items.entries()) {
        const preview = list.children[index]?.querySelector(".gs-preview");
        if (!preview) continue;
        cachedThumb(item.url).then((src) => {
          if (preview.isConnected && list.children[index]?.dataset.url === item.url) preview.src = src;
        }).catch(() => {});
      }
    }, 260);
  }

  function render(items, loading = false) {
    const selectedUrl = results[selectedIndex]?.url;
    results = items;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "gs-empty";
      empty.textContent = loading ? "Recherche dans l’historique…" : "Aucun site trouvé.";
      list.appendChild(empty);
      selectedIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    for (const [index, item] of items.entries()) {
      const row = document.createElement("div");
      row.id = `gs-result-${index}`;
      row.className = "gs-row";
      row.role = "option";
      row.dataset.url = item.url;
      const fav = faviconUrl(item.url, 64);
      const badges = [
        item.openTab ? '<span class="gs-badge gs-badge-open">Onglet ouvert</span>' : "",
        item.sources.has("bookmark") ? '<span class="gs-badge">Favori</span>' : "",
        item.sources.has("history") ? '<span class="gs-badge">Historique</span>' : "",
      ].join("");
      row.innerHTML = `<span class="gs-thumb"><img class="gs-preview" src="${fav}" alt=""><img class="gs-favicon" src="${fav}" alt=""></span><span class="gs-main"><span class="gs-title" title="${escapeHtml(String(item.title || item.url))}">${escapeHtml(String(item.title || item.url))}</span><span class="gs-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</span><span class="gs-badges">${badges}</span></span>`;
      row.querySelector(".gs-preview").onerror = (event) => { event.currentTarget.onerror = null; event.currentTarget.src = chrome.runtime.getURL("icons/icon48.png"); };
      row.querySelector(".gs-favicon").onerror = (event) => { event.currentTarget.remove(); };
      row.addEventListener("pointermove", () => { if (selectedIndex !== index) setSelection(index); });
      row.addEventListener("click", () => openResult(index));
      list.appendChild(row);
    }
    const preservedIndex = items.findIndex((item) => item.url === selectedUrl);
    setSelection(preservedIndex >= 0 ? preservedIndex : 0);
    loadPreviews(items);
  }

  async function search(query) {
    const token = ++searchToken;
    const q = query.trim();
    clearTimeout(thumbTimer);
    if (!q) {
      results = [];
      selectedIndex = -1;
      input.removeAttribute("aria-activedescendant");
      list.innerHTML = '<p class="gs-empty">Tapez pour retrouver un favori, une visite ou un onglet ouvert.</p>';
      return;
    }
    const bookmarkPromise = bookmarksNow().catch(() => []);
    const tabPromise = chrome.tabs.query({}).catch(() => []);
    const historyPromise = chrome.history.search({
      text: q,
      startTime: 0,
      maxResults: q.length === 1 ? 300 : q.length === 2 ? 1500 : 0,
    }).catch(() => []);
    const [bookmarks, tabs] = await Promise.all([bookmarkPromise, tabPromise]);
    if (token !== searchToken || dialog.classList.contains("hidden")) return;
    render(merge(bookmarks, [], tabs, q), true);
    const history = await historyPromise;
    if (token !== searchToken || dialog.classList.contains("hidden")) return;
    render(merge(bookmarks, history, tabs, q));
  }

  function scheduleSearch(delay = 85) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search(input.value), delay);
  }

  function openSearch(firstCharacter = "") {
    if (!dialog.classList.contains("hidden")) return;
    previousFocus = document.activeElement;
    dialog.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    input.value = firstCharacter;
    input.focus();
    search(firstCharacter);
  }

  function closeSearch() {
    if (dialog.classList.contains("hidden")) return;
    searchToken++;
    clearTimeout(searchTimer);
    clearTimeout(thumbTimer);
    dialog.classList.add("hidden");
    backdrop.classList.add("hidden");
    input.value = "";
    results = [];
    selectedIndex = -1;
    input.removeAttribute("aria-activedescendant");
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  async function openResult(index) {
    const item = results[index];
    if (!item || opening) return;
    opening = true;
    try {
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find((tab) => {
        const unwrapped = globalThis.BSSessionLib?.unwrapSuspended?.(tab.url);
        return (unwrapped?.url || tab.url) === item.url;
      });
      if (existing?.id !== undefined) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url: item.url });
      }
      closeSearch();
    } catch (error) {
      toast(`Impossible d’ouvrir ce site : ${error?.message || error}`);
    } finally {
      opening = false;
    }
  }

  function isEditing(target) {
    return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
  }

  document.addEventListener("keydown", (event) => {
    if (event.isComposing || event.key === "Process") return;
    const shortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k";
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      if (dialog.classList.contains("hidden")) openSearch();
      else input.focus();
      return;
    }
    if (!dialog.classList.contains("hidden")) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSelection(selectedIndex + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter" && selectedIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        openResult(selectedIndex);
      } else if (event.key === "Tab") {
        const next = document.activeElement === input ? closeButton : input;
        event.preventDefault();
        next.focus();
      }
      return;
    }
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditing(event.target)) return;
    if (event.key.length !== 1 || !event.key.trim()) return;
    event.preventDefault();
    event.stopPropagation();
    openSearch(event.key);
  }, true);

  input.addEventListener("input", () => scheduleSearch());
  document.getElementById("btn-global-search")?.addEventListener("click", () => openSearch());
  closeButton.addEventListener("click", closeSearch);
  backdrop.addEventListener("click", closeSearch);
})();
