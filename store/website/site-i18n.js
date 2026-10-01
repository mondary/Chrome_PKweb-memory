/* Localisation de la landing : FR sans JavaScript, EN détecté ou choisi manuellement. */
(() => {
  "use strict";

  const en = {
    "[aria-label='Navigation principale']": { attr: { "aria-label": "Main navigation" } },
    ".skip": { text: "Skip to content" },
    ".nav-links a[href='#fonctions']": { text: "Features" },
    ".nav-links a[href='#sessions']": { text: "Sessions" },
    ".nav-links a[href='#playground']": { text: "Demo" },
    ".nav-links a[href='#installation']": { text: "Install" },
    ".nav-links a[href='#faq']": { text: "FAQ" },
    ".nav-links a[href='#privee']": { text: "Privacy" },
    ".nav-kofi": { text: "Ko-fi ♥" },
    ".nav > .btn-pill": { html: 'Install <span aria-hidden="true">→</span>' },
    ".hero h1": { html: "Your web,<br>organized." },
    ".hero-lede": { html: "Bookmarks, history and sessions in one place.<br>Explore, clean up and rediscover — all locally, in Chrome." },
    ".hero-cta .btn-lg:first-child": { html: 'Install the extension <span aria-hidden="true">→</span>' },
    ".hero-cta .btn-ghost-sky": { text: "Try the demo" },
    ".hero-src": { text: "View the source code" },
    ".hero-quote p": { text: "“Your browser remembers everything. PK Web Memory helps you make sense of it.”" },
    ".hero-shot .shot": { attr: { "aria-label": "Enlarge screenshot: global search palette", "data-caption": "Global search palette — real interface screenshot with fictional demo data." } },
    ".hero-shot img": { attr: { alt: "The extension’s global search palette, with a search field and favicon results from bookmarks, browsing history and open tabs" } },
    ".hero-shot figcaption": { text: "Real extension interface · fictional data — click to enlarge" },
    ".manifesto .eyebrow": { text: "The problem" },
    ".manifesto h2": { html: "Three parts of your browsing life<br>that never talk to each other." },
    ".pillar:nth-child(1) h3": { text: "Saved bookmarks" },
    ".pillar:nth-child(1) p": { text: "Thousands of accumulated links, filed away in folders you no longer open." },
    ".pillar:nth-child(2) h3": { text: "Pages you’ve visited" },
    ".pillar:nth-child(2) p": { text: "A noisy history where finding a page from three days ago feels like luck." },
    ".pillar:nth-child(3) h3": { text: "Open tabs" },
    ".pillar:nth-child(3) p": { text: "Thirty tabs left open because you’re afraid to lose your place." },
    ".manifesto-close": { html: "<em>PK Web Memory brings all three together</em> — and makes sense of what Chrome quietly collects." },
    ".features > .wrap > .eyebrow": { text: "Explore the full toolkit" },
    ".features h2": { html: "One extension.<br>Your entire web memory." },
    ".section-note": { text: "Screenshots show the real extension interface with a fictional set of 19 bookmarks. Click any image to enlarge it." },
    ".card-wide h3": { text: "Global search ⌘K" },
    ".keys": { attr: { "aria-label": "Global search shortcuts" } },
    ".keys li:nth-child(1)": { html: '<span class="kbd-mini">⌘K</span> open the palette' },
    ".keys li:nth-child(2)": { html: '<span class="kbd-mini">↵</span> open the site' },
    ".keys li:nth-child(3)": { html: '<span class="kbd-mini">⇥</span> switch to its open tab' },
    ".keys li:nth-child(4)": { html: '<span class="kbd-mini">Esc</span> close' },
    ".card-wide .card-txt:nth-child(2) p": { html: 'A Spotlight-style palette, opened with a shortcut or as soon as you start typing. It searches <b>all at once</b> across your bookmarks, Chrome history and open tabs, ranks results by relevance, and displays them as visual dock-like tiles. One field to open a site, pick up where you left off, or find the window that already has the page.' },
    ".card:nth-of-type(2) h3": { text: "Inventory" },
    ".card:nth-of-type(2) .card-txt p": { text: "Totals, folder paths and most-visited domains, with progress bars and favicons. Turn your collection into a clear landscape — and every chart into a starting point for search." },
    ".card:nth-of-type(3) h3": { text: "Gallery" },
    ".card:nth-of-type(3) .card-txt p": { text: "Browse bookmarks as visual cards, search, filter by folder and adjust columns. Thumbnails come from WordPress.com mshots and stay in a local cache for 30 days (up to 60 items). Favicon-only mode displays everything without making a thumbnail request." },
    ".card:nth-of-type(3) figcaption": { text: "Captured in favicon-only mode — no remote thumbnails." },
    ".card:nth-of-type(4) h3": { text: "Duplicates, 3 levels" },
    ".card:nth-of-type(4) .card-txt p": { text: "1 · Exact URL. 2 · Tracking removed (utm, fbclid…). 3 · Ignore http/https, www and parameters. The oldest bookmark is kept; the rest go to a quarantine where they can be restored until you empty it." },
    ".card:nth-of-type(5) h3": { text: "Broken links & quarantine" },
    ".card:nth-of-type(5) .card-txt p": { text: "Adjustable parallel scan (speed, per-site delay and recheck). Only confirmed HTTP 404/410 responses are marked broken; temporary errors stay “to check”. chrome:// pages and local files are never scanned. Quarantined links can be restored and are automatically purged after the chosen period (30 days by default)." },
    ".card:nth-of-type(5) figcaption": { text: "Before any scan: statuses are unknown; nothing is marked broken." },
    ".card:nth-of-type(6) h3": { text: "History by day" },
    ".card:nth-of-type(6) .card-txt p": { text: "Browse your past activity in a daily tree, search it and choose how far back to scan (unlimited, up to one year). Click a row’s star to bookmark a page without hunting through folders." },
    ".card:nth-of-type(7) h3": { text: "Backups & snapshots" },
    ".card:nth-of-type(7) .card-txt p": { text: "Export active bookmarks as JSON or HTML, and keep a local history of linked snapshots (up to 30 versions), created after each export, cleanup or restore. Restoring brings back missing bookmarks without deleting newer ones. Downloads are ordinary files, separate from this history." },
    ".bento .card:nth-of-type(2) .shot": { attr: { "aria-label": "Enlarge screenshot: bookmark inventory", "data-caption": "Inventory — real interface screenshot with fictional data." } },
    ".bento .card:nth-of-type(2) img": { attr: { alt: "Bookmark inventory with totals, folder and domain rankings, progress bars and favicons" } },
    ".bento .card:nth-of-type(3) .shot": { attr: { "aria-label": "Enlarge screenshot: bookmark gallery in favicon-only mode", "data-caption": "Gallery in favicon-only mode — real interface with fictional data; no remote thumbnails." } },
    ".bento .card:nth-of-type(3) img": { attr: { alt: "Bookmark gallery in favicon-only mode, with search, folder filter and site-icon cards" } },
    ".bento .card:nth-of-type(4) .shot": { attr: { "aria-label": "Enlarge screenshot: duplicate groups", "data-caption": "Duplicates — real interface screenshot with fictional data." } },
    ".bento .card:nth-of-type(4) img": { attr: { alt: "Duplicate groups detected at different similarity levels, with checkboxes to choose which bookmarks to keep" } },
    ".bento .card:nth-of-type(5) .shot": { attr: { "aria-label": "Enlarge screenshot: link checker before scanning", "data-caption": "Link checker before scanning — real interface with fictional data; no statuses confirmed yet." } },
    ".bento .card:nth-of-type(5) img": { attr: { alt: "Link checker before scanning, with URLs awaiting review and unknown statuses" } },
    ".bento .card:nth-of-type(6) .shot": { attr: { "aria-label": "Enlarge screenshot: browsing history by day", "data-caption": "History by day — real interface screenshot with fictional data." } },
    ".bento .card:nth-of-type(6) img": { attr: { alt: "Browsing history explored day by day in a tree view with times, titles and bookmark stars" } },
    ".bento .card:nth-of-type(7) .shot": { attr: { "aria-label": "Enlarge screenshot: backups and snapshots", "data-caption": "Backups — real interface with fictional data generated from real exports." } },
    ".bento .card:nth-of-type(7) img": { attr: { alt: "Backup section with downloadable JSON and HTML exports and a linked local snapshot history" } },
    ".spotlight .eyebrow": { text: "The centerpiece" },
    ".spotlight h2": { html: "Sessions,<br>your working memory." },
    ".spotlight-txt > p.reveal:not(.eyebrow)": { text: "A merged timeline: the current window stays expanded at the top, while previous days unfold in place. Each row shows a title, domain and page preview; close a tab or remove a link, with undo." },
    ".spot-list li:nth-child(1)": { html: "<b>Save &amp; close</b> — turn the window into a named session with tags and a note; optionally keep only checked tabs." },
    ".spot-list li:nth-child(2)": { html: "<b>Automatic snapshots</b> — every 5 minutes, save the live window as a snapshot (up to 20 distinct versions), without closing any tabs." },
    ".spot-list li:nth-child(3)": { html: "<b>Deduplicate</b> — close duplicate open tabs in one click, with undo." },
    ".spot-list li:nth-child(4)": { html: "<b>Native tab discard</b> — after 15, 30 or 60 minutes (or disabled), inactive tabs are discarded by Chrome to free memory. <b>The original URL stays intact</b>, with a Zzz badge and one-click wake-up. Active, pinned and audio-playing tabs are never discarded." },
    ".spot-list li:nth-child(5)": { html: "<b>Export in 6 formats</b> — URLs, titles, Markdown, HTML, CSV and JSON. Copy or download, including tab notes." },
    ".spot-list li:nth-child(6)": { html: "<b>Resume card</b> — when no tabs are open, the latest session from a previous day reappears. <b>Daily session</b> — at your chosen time (07:00 by default), save each day as a dated session, with an option to start fresh." },
    ".chips": { attr: { "aria-label": "Export formats" } },
    ".chips .chip:nth-child(2)": { text: "Titles" },
    ".spotlight-shot .shot": { attr: { "aria-label": "Enlarge screenshot: session timeline", "data-caption": "Session timeline — real interface screenshot with fictional data: three saved sessions and the current window in a demo profile." } },
    ".spotlight-shot img": { attr: { alt: "Real session timeline showing the current window, tab titles, favicons and actions, followed by sessions saved on previous days" } },
    ".spotlight-shot figcaption": { text: "Real interface · fictional data: three saved sessions and the current window in a demo profile." },
    ".playground-section .eyebrow": { text: "Interactive demo — a simulation" },
    ".playground-section h2": { html: "Try the dashboard,<br>without installing anything." },
    ".playground-section > .wrap > p:not(.eyebrow)": { text: "A recreation of the real dashboard — sidebar, tabs, ⌘K palette and session timeline — powered by fictional data. Search, browse the inventory and gallery, save a session and quarantine duplicates. Nothing is read from your browser, and the demo resets itself." },
    ".playground-section noscript p": { text: "Enable JavaScript to interact with the demo. Real screenshots and installation instructions remain available without JavaScript." },
    ".trio .eyebrow": { text: "Also in the toolbar" },
    ".trio h2": { html: "Three small touches,<br>the rest is automatic." },
    ".trio-card:nth-child(1) h3": { text: "Icon badge" },
    ".trio-card:nth-child(1) p": { text: "Show the number of open tabs or duplicate tabs (the same page opened twice). Choose the count, live updates or no badge in settings." },
    ".trio-card:nth-child(2) h3": { text: "New tab page" },
    ".trio-card:nth-child(2) p": { text: "Ctrl+T opens the extension directly in your chosen section: sessions, gallery, inventory, history or tab groups. Disable it in settings." },
    ".trio-card:nth-child(3) h3": { text: "Tab sleep & wake" },
    ".trio-card:nth-child(3) p": { text: "The service worker discards inactive tabs after 15, 30 or 60 minutes — never the active, pinned or audio-playing tabs." },
    ".install .eyebrow": { text: "Installation" },
    ".install h2": { html: "Two minutes,<br>in developer mode." },
    ".install-grid > div > p:not(.eyebrow)": { text: "Install from source in developer mode. No build step or dependencies required." },
    ".install .btn-lg": { html: 'Open the GitHub repository <span aria-hidden="true">↗</span>' },
    ".steps li:nth-child(1)": { html: "<b>Get the repository.</b> On GitHub, choose “Code” → “Download ZIP” (then unzip it), or run <code>git clone</code>." },
    ".steps li:nth-child(2)": { html: "<b>Open <code>chrome://extensions</code>.</b> Paste the address into Chrome’s address bar." },
    ".steps li:nth-child(3)": { html: "<b>Turn on Developer mode</b> — the switch at the top right of the page." },
    ".steps li:nth-child(4)": { html: "<b>Click “Load unpacked”</b> and select the repository’s <code>extension/</code> folder." },
    ".steps li:nth-child(5)": { html: "<b>Pin the PK Web Memory icon.</b> Click it to open the dashboard — or use Ctrl+T to open your chosen section." },
    ".install-note": { text: "To update: replace the files in the loaded folder with the new version, then click ↻ “Reload” on the extension card. The dated version appears under About." },
    ".faq .eyebrow": { text: "Frequently asked questions" },
    ".faq h2": { html: "Clear answers,<br>no fine print." },
    ".faq details:nth-child(1) summary": { text: "Where is my data stored?" },
    ".faq details:nth-child(1) p": { html: "Sessions, settings, caches and snapshots are kept in the extension’s local storage (<code>chrome.storage.local</code>). Bookmarks and history remain in Chrome; any syncing depends on your Chrome settings. The extension adds no account or separate sync service. Uninstalling removes its local storage, so export anything you want to keep. External thumbnail and link-check requests are explained below." },
    ".faq details:nth-child(2) summary": { text: "Why does it need so many permissions?" },
    ".faq details:nth-child(2) p": { html: "<b>Bookmarks, history, tabs and tab groups</b> let the extension read and organize your browsing. <b>Storage and unlimited storage</b> keep its data locally. <b>Favicon</b> displays site icons; <b>alarms</b> run scheduled tasks. Access to http/https sites enables thumbnails and link checks. These permissions apply to the installed extension, not this page’s playground." },
    ".faq details:nth-child(3) summary": { text: "Are my URLs sent when thumbnails load?" },
    ".faq details:nth-child(3) p": { html: "In mshots mode, the relevant URL is sent to <b>WordPress.com mshots</b> to generate a thumbnail, then cached locally for 30 days. Favicon-only mode avoids mshots requests; some fallback favicons may use Google S2 with the domain. Sessions can also show locally captured previews of visited pages, with mshots fallback allowed or not depending on your setting." },
    ".faq details:nth-child(4) summary": { text: "Does the broken-link scan visit my pages?" },
    ".faq details:nth-child(4) p": { html: "It sends a request to each URL you choose to check, without cookies or credentials. <code>chrome://</code> pages and local files are never scanned. For more than 300 URLs, the extension asks for confirmation first. Only confirmed 404/410 responses mark a link as broken; live links are checked again later, while broken links are rechecked daily until resolved." },
    ".faq details:nth-child(5) summary": { text: "Is this page’s demo the real extension?" },
    ".faq details:nth-child(5) p": { text: "No. It is a standalone educational simulation with fictional data and actions limited to this page. It does not use extension APIs or access your files. Its only external requests load thumbnails and favicons for demo sites via mshots and Google S2, just like the real gallery. The eight screenshots show the actual extension running in a disposable Chrome profile with a separate demo dataset. The interface in those screenshots has not been redrawn." },
    ".faq details:nth-child(6) summary": { text: "What about the Chrome Web Store?" },
    ".faq details:nth-child(6) p": { text: "This page links to GitHub for developer-mode installation, not to a Chrome Web Store listing. You can inspect the complete source code before loading the extension." },
    ".privacy .eyebrow": { text: "Privacy" },
    ".privacy h2": { html: "Your data stays local.<br>Exceptions are listed." },
    ".privacy-grid > div > p.reveal:not(.eyebrow)": { text: "Bookmarks, visits, sessions, settings and backups are handled in Chrome and kept in the extension’s local storage. No account, analytics or ads. Three actions make web requests — always explicit and explained here." },
    ".privacy-grid > div > .link-arrow": { html: 'Read the privacy policy <span aria-hidden="true">↗</span>', attr: { href: "https://github.com/mondary/pk-web-memory/blob/main/store/privacy-policy.html" } },
    ".privacy-note h3": { text: "External requests, only when you ask" },
    ".privacy-note li:nth-child(1)": { html: "Gallery thumbnails: <b>WordPress.com mshots</b>, with the relevant URL — except in favicon-only mode" },
    ".privacy-note li:nth-child(2)": { html: "Fallback favicons for tab groups: <b>Google S2</b>, with the domain" },
    ".privacy-note li:nth-child(3)": { html: "Broken-link scan: a request without cookies or credentials to the URLs <b>you</b> choose to check" },
    ".privacy-note > p": { text: "Session previews are captured locally and never leave your device. Link checks do not include session credentials." },
    ".support .eyebrow": { text: "Support" },
    ".support h2": { html: "The extension is free.<br>The coffee almost is, too." },
    ".support p.reveal:not(.eyebrow)": { text: "PK Web Memory is developed and maintained by mondary.design. If it saves you time, a coffee on Ko-fi helps keep it going." },
    ".support .btn": { html: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.4s-5-3-5-6.6A2.9 2.9 0 0 1 8 4.5a2.9 2.9 0 0 1 5 2.3c0 3.6-5 6.6-5 6.6Z" fill="currentColor"/></svg>Support on Ko-fi' },
    ".playground-language-note": { text: "The interactive dashboard and product screenshots show the extension’s original French interface." },
    ".finale h2": { html: "Keep track<br>of what you discover." },
    ".finale .btn-lg:first-child": { html: 'Install the extension <span aria-hidden="true">→</span>' },
    ".finale .btn-ghost-sky": { text: "Try the demo" },
    ".finale .hero-src": { text: "Source code on GitHub" },
    ".footer nav": { attr: { "aria-label": "Footer links" } },
    ".footer nav a[href='#playground']": { text: "Demo" },
    ".footer nav a[href$='privacy-policy.html']": { text: "Privacy", attr: { href: "https://github.com/mondary/pk-web-memory/blob/main/store/privacy-policy.html" } },
    ".language-switch": { attr: { "aria-label": "Choose language" } }
  };

  const setLanguage = (language, persist = false) => {
    const locale = language === "en" ? "en" : "fr";
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    document.title = locale === "en" ? "PK Web Memory — Your web, organized." : "PK Web Memory — Votre vie web, organisée.";
    const description = document.querySelector('meta[name="description"]');
    const ogLocale = document.querySelector('meta[property="og:locale"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (description) description.content = locale === "en"
      ? "PK Web Memory — bookmarks, browsing history and sessions in one place: global search, session timeline, native tab discard, gallery, duplicate cleanup and backups. Install in developer mode; try the interactive demo."
      : "PK Web Memory — favoris, historique et sessions réunis dans un seul espace : recherche ⌘K, timeline de sessions, veille native, galerie, doublons, liens morts et sauvegardes. À installer en mode développeur ; démo interactive sur cette page.";
    if (ogLocale) ogLocale.content = locale === "en" ? "en_US" : "fr_FR";
    if (ogTitle) ogTitle.content = locale === "en" ? "PK Web Memory — Your web, organized." : "PK Web Memory — Votre vie web, organisée.";
    if (ogDescription) ogDescription.content = locale === "en" ? "Bookmarks, history and sessions in one place. Explore, clean up and rediscover." : "Favoris, historique et sessions réunis dans un seul espace. Explorez, nettoyez, retrouvez.";
    for (const [selector, copy] of Object.entries(en)) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const value = locale === "en" ? copy : null;
      if (value) {
        if ("html" in value) node.innerHTML = value.html;
        else if ("text" in value) node.textContent = value.text;
        if (value.attr) for (const [name, translated] of Object.entries(value.attr)) node.setAttribute(name, translated);
      } else {
        const original = node.dataset.frText;
        if (original !== undefined && ("html" in copy || "text" in copy)) node.innerHTML = original;
        const attrs = node.dataset.frAttrs ? JSON.parse(node.dataset.frAttrs) : null;
        if (attrs) for (const [name, old] of Object.entries(attrs)) node.setAttribute(name, old);
      }
    }
    for (const [selector, copy] of Object.entries(en)) {
      const node = document.querySelector(selector);
      if (!node) continue;
      if (!node.dataset.frText) node.dataset.frText = node.textContent;
      const originalAttrs = {};
      for (const name of Object.keys(copy.attr || {})) originalAttrs[name] = node.getAttribute(name) || "";
      if (Object.keys(originalAttrs).length) node.dataset.frAttrs = JSON.stringify(originalAttrs);
    }
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.language === locale));
    });
    document.documentElement.dataset.i18nReady = "true";
    window.dispatchEvent(new CustomEvent("pk-web-memory-language-change", { detail: { language: locale } }));
    if (persist) {
      try { localStorage.setItem("pk-web-memory-language", locale); } catch { /* page-only fallback */ }
    }
  };

  // Store each source string once before any English copy is applied, so switching back is exact.
  const rememberFrench = () => {
    for (const [selector, copy] of Object.entries(en)) {
      const node = document.querySelector(selector);
      if (!node) continue;
      node.dataset.frText = node.innerHTML;
      const attrs = {};
      for (const name of Object.keys(copy.attr || {})) attrs[name] = node.getAttribute(name) || "";
      if (Object.keys(attrs).length) node.dataset.frAttrs = JSON.stringify(attrs);
    }
  };
  const detectLanguage = () => {
    try {
      const saved = localStorage.getItem("pk-web-memory-language");
      if (saved === "fr" || saved === "en") return saved;
    } catch { /* use browser preference */ }
    const preferences = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages : [navigator.language || "fr"];
    for (const item of preferences) {
      const code = String(item).toLowerCase().split(/[-_]/)[0];
      if (code === "fr" || code === "en") return code;
    }
    return "fr";
  };

  const init = () => {
    rememberFrench();
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.language, true));
    });
    setLanguage(detectLanguage());
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
