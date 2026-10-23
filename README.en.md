# PK Web Memory

![PK Web Memory banner — your browsing life, organized](store/v4/assets/banner-1544x500.png)

<img src="icon.png" width="88" alt="PK Web Memory icon">

[🇫🇷 Français](README.md) · [🇬🇧 English](README.en.md)

Your browsing life, organized: **bookmarks, history, sessions and your useful links together in one workspace.** Chrome extension with no build step or remote dependencies to install. Version **2026.10.55**.

## Preview

![Global search — real interface with demonstration data](store/v4/screenshots/02-recherche.png)

![Session timeline — real interface in a disposable Chrome profile](store/v4/screenshots/06-sessions.png)

The [bilingual landing page](store/website/index.html) detects the browser’s preferred language (English or French) and includes a manual language switch. It features nine expandable real screenshots and a full-width playground recreating the dashboard with fictional data: ⌘K search, inventory, gallery, duplicates, sessions, history and snapshots. The simulation and screenshots show the extension’s original French interface; thumbnails and favicons load via mshots and Google S2, just like the extension. The playground is not an embedded extension.

Preview: run `python3 -m http.server 4174 --bind 127.0.0.1`, then open `http://127.0.0.1:4174/store/website/`.

Regenerate screenshots with `node store/website/tools/capture.mjs` (Node 22+ and Chrome for Testing; override the binary with `CHROME_BIN`). The script loads `extension/` into a disposable headless profile, seeds demo bookmarks, visits and sessions through Chrome APIs, and captures the interface without altering its DOM, styles or images. The gallery uses favicon-only mode; the dead-link screen is shown before scanning, without invented results. Backup exports stay inside the temporary profile, which is removed on exit. The [provenance report](store/website/tools/capture-report.json) records dimensions, version and source/PNG hashes.

The v4 media kit (`store/v4/`) is the current showcase: five 1280×800 captures for the Chrome Web Store listing, nine 1440×1000 scenes for the landing, the tile, marquee, banner and social card, a large + compact GIF and a demo MP4. Regenerate with `node store/v4/tools/capture-v4.mjs` then `bash store/v4/tools/build-media.sh` — method, sources and limits in the [kit README](store/v4/media-kit/README.md).

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon in the toolbar → the dashboard opens

## Features

| Tab | What it does |
|---|---|
| **Dashboard** | Your useful links, sorted by category: a flat view onto a Chrome bookmark folder (“Category — Title”: the prefix makes the category, without one the link stays in “Sans catégorie”; bookmarks = links with favicons, hover page preview, confirmed dead links struck through). Two displays in the toolbar: **List** (default, a dense typographic index — hairline-outlined boxes, underlined links darkening on hover) or **Cards** (sharing the width by number); widening grip and title-drag reordering work in both modes, with a discreet reminder in the footer. Add the current tab or a link by hand, rename in place (double-click or a visible pencil button), reorder and move between categories by drag and drop, filter as you type — legacy subfolders are flattened in one pass (the folder name becomes the prefix); the very same list as in Chrome’s bookmark manager, and deletions go to the app’s trash |
| **Global search** | ⌘K or any keystroke: Spotlight-like palette searching bookmarks, history and open tabs; ↵ opens the site or jumps to its tab |
| **Browsing history** | Timeline and visited pages, searchable by day and time range. Optional local archive (on by default): imports what Chrome still retains and keeps future visits beyond Chrome's window; a setting stops recording and a button clears the archive. Shortcuts configurable for every rail tab — defaults ⌥⇧D dashboard, ⌥⇧B bookmarks, ⌥⇧H history, with Sessions/Resources/Passwords/Settings free to assign; each tab's tooltip shows the live combo |
| **Inventory** | Totals, folder path and domain rankings, frequency bars and favicons |
| **Gallery** | mshots thumbnails or a compact list inspired by Chrome’s bookmark manager, with search, folder filter, shown/total count, column control and a 30-day local cache |
| **Duplicates** | 3 levels: 1 · exact URL · 2 · without tracking (utm, fbclid…) · 3 · without http/https, www and params |
| **Dead links** | Parallel scan; only confirmed HTTP 404/410 responses are dead, temporary failures stay under review |
| **Sessions** | Tablerone-style merged timeline: live session always expanded, a cross per row (close the tab or remove the link, undoable), hover page preview, click-to-widen view, save & close, selected-tab saving, open-tab dedup, tab-zero “Resume” card, URL/titles/Markdown/HTML/CSV/JSON export, 5-min auto backup, idle-tab sleeping, daily session at 07:00 by default, and recovery of recently closed windows/tabs. The local SQLite database keeps archived visits, pages and sessions in one user-chosen file under Application Support; reconnect it after reinstall to restore sessions. |
| **Backup** | JSON/HTML downloads, local snapshot history with parent links, quarantine management |
| **Resources** | Live per-tab JS heap + network downloaded since load: adjustable interval (1 s / 2 s / 5 s / pause), weight bar, ↗/↘/→ trend on hover (JS heap ≈ ⅓ of Chrome’s memory footprint), scroll position preserved, click to activate the tab; same monitor in the Chrome side panel (right-click the icon), extension’s own heap included |
| **Passwords** | Direct access to Chrome and Google’s password manager from the rail (key icon): a launch panel that opens the native manager in a new tab — this page stays open underneath — or the passwords.google.com web app; configurable section shortcut; the extension never sees your passwords (a Chrome rule) |
| **Icon badge** | Open **web**-tab or duplicate-open-tab count shown on the toolbar icon — **tour window** scope by default or all windows; extension pages, PWAs, popups and private windows excluded (choose in settings) |
| **Home page** | Ctrl+T opens the extension on the section of your choice (dashboard, sessions, gallery, history…) |

## Respiration: 10 open tabs means 10 open tabs

![Respiration — real version 2026.10.26 with fictional pages](store/respiration/screenshots/respiration-desktop.png)

![Every page of the tour — favicons, titles, URLs and states](store/respiration/screenshots/respiration-pages.png)

In **Sessions → Activer Respiration**, choose a window and a target number of web tabs (10 by default, from 1 to 30). **Only the last N tabs of the window stay open; everything else is saved, then closed.** The single exception: **media currently playing (video or audio)**, kept on top of the target and closed once it stops. With 100 pages, you keep 91 through 100: closing 100 brings back 90 on the left, then closing 99 brings back 89, without taking focus. The queue follows tab order, not recently visited order.

**Two modes:** **Close** (default) saves then closes pages for minimal memory. **Suspend** uses Chrome’s native mechanism (`chrome.tabs.discard`): every tab stays visible in Chrome’s tab strip with its real title and favicon, only the N most recent stay loaded, and the rest are suspended and reload on click. The active tab, pinned tabs and media can stay loaded beyond the target. Chrome keeps roughly 1–5 MB of metadata per suspended tab: Close mode remains the most memory-efficient. The **“Reopen as suspended”** button recreates the “À revenir” pages in Chrome and suspends them immediately; it is available in the Sessions Respiration card **and at the bottom of the side panel’s “À revenir” section** (“Reopen N pages as suspended”). Pages are appended after the open tabs, then suspended in batches of three after loading; the final message reports how many are actually suspended and how many remain loaded. If tabs already stayed blank, the panel offers **“Repair N blank suspended tabs”**: it restores the URL from the queue, reloads and suspends.

The panel shows three counters and three matching sections, readable at a glance: **Onglets ouverts** (open tabs — x / target, ongoing playback on top) with the grid of actually open tabs — click to activate; **Fermés, à revenir** — every page saved then closed, each one returns on the next ⌘W, click to reopen; **Fermés par vous** — pages you closed yourself, with no automatic return. Every page is a favicon (hover or keyboard focus: full title, URL and thumbnail) and **every page in the section is displayed**, not a sample. The preview uses the available local capture, then the thumbnail service when enabled; otherwise it reports that the thumbnail is unavailable. Hovering never reopens a tab. “Voir toutes les pages” additionally opens a large detailed panel: title, full URL, per-state filter and search, updated live.

Chrome groups and consecutive ungrouped tabs form **page lots**. They serve one purpose: the return order. One line announces the **next page that comes back on ⌘W**; the “Ordre de retour” fold only appears when there are several lots (a Chrome group, the window’s tabs…) and lets you move them up/down or skip to the next lot. Pages opened after launch join the window’s lot — no more duplicated “Pages ajoutées à la fenêtre” capsule; older queues are merged on extension reload. A manually opened page belongs to the same budget: it is saved, then the oldest of the last N tabs leaves on the next check (30 s) — never during a restore. **Pause** stops refilling; **Terminer** stops the tour without closing open pages or deleting saved sessions.

**Save your drafts before activating**: modified forms, filled editors, active and pinned tabs are closed like any others when outside the last N — backups keep links and metadata, not what you typed. Chrome internal pages (chrome://, new tab…) stay open and outside the budget.

**Quick access:** left-clicking the extension icon opens the side panel directly; right-click offers the panel, the full page and a new Sessions tab. ⌘T/Ctrl+T still uses the configured new-tab page (Sessions by default), and the “Gérer la tournée dans Sessions” link remains in the panel.

**Manual rotation:** open “Panneau latéral” in Respiration and pick an older page from the reserve (search by title or URL). It becomes active; when the target is full, the least recently used tab, excluding playing audio/video, is saved, closed and kept in “À revenir”. This also works in the icon grids and “Voir toutes les pages”. Swapping never marks a page as done; **⌘W means finished** and brings the next page back in the background. Manual selection also works while paused without resuming automatic refilling. The sidebar retains the “Ressources” monitor, which samples pages only while that view is shown. A failed tab creation leaves existing tabs intact; if the tour’s window is gone, resume it from Sessions first.

**Tab strip:** the favicon rail shows the entire reserve in a scrolling list; it is **off by default** and can be enabled in Settings → Sessions & tabs → “Rail favicon on the page edge”. The side panel offers two views: a detailed list or a **favicon mosaic** grouped by state. The panel’s sliders icon also gives access to the rail, Respiration mode and badge without leaving the panel. **⇄** moves it left or right, **⛶** toggles window fullscreen — Chrome does not allow hiding only its tab strip, so fullscreen removes the whole browser UI and leaves the rail in the page — and **☰** opens the detailed side panel. F11 or ⌃⌘F restores the browser chrome. The rail stays hidden in windows without Chrome tabs (installed PWAs, popups); the “Rail favicon in app windows” setting brings it back.

**⌘⌥W (Command + Option + W) means “come back later”**: from the tour’s active web page, close that tab without marking it done, put it behind the entire reserve, and recall another page in the background. Playing media stays open; while paused, the page is saved without refilling. With no other page in reserve, it is not reopened immediately; the window’s last tab stays open if no replacement exists. Closing happens only after saving, and a failed opening preserves the current tab.

The shortcut is detected within HTTP(S) pages, including their embedded frames: click inside the page if the address bar has focus. It does not apply to Chrome’s own interface, protected Store pages or local files. After an update, reload the extension with **↻**: the listener is reinstalled in already-open pages, without reinstalling the extension. Chrome rejects these modifiers in `commands`, not in page keyboard events; ⌘⌥W requires no setup in `chrome://extensions/shortcuts`. An optional browser shortcut can still be assigned there.

A tour belongs to **one window at a time**. Closing that window, moving a tab, using the extension’s bulk closing tools or restarting Chrome pauses refilling. After an extension reload, “Reprendre” finds the original window when its tabs are still identifiable, then closes surplus pages. No window is automatically recreated. The queue is persisted and read back before each closure; capsules remain ordinary exportable sessions. The existing SQLite backup also includes progress when a database file is connected. A dashboard left open on an older version shows a reload hint instead of the “Commande Respiration inconnue” error.

Verification: `node --test extension/tests/respiration.test.mjs extension/tests/respiration.browser.test.mjs`. The browser test uses Chrome for Testing, a disposable profile and local pages; `RESPIRATION_SHOTS=/tmp/respiration-shots` generates real desktop/mobile screenshots.

## Safety

Gallery screenshots are requested from WordPress.com mshots, which receives the site URL. Retrieved images are cached in extension storage for 30 days (up to 60 entries), then refreshed on demand. Some fallback favicons use Google S2; link scans contact the checked websites without sending their cookies.

The Dashboard creates no parallel link storage: it reads and edits the Chrome bookmark folder you point it at, and only saves that folder choice. Nothing is sent anywhere. Deleting a link from the page follows the same path as every other cleanup: local snapshot, entry in the app’s trash, then removal of the bookmark.

Sessions and settings are stored locally. See the [privacy policy](store/privacy-policy.html) and the [Chrome Web Store listing](https://chromewebstore.google.com/detail/pk-web-memory/bpbbglmebdopkbmgpehloggencjmfbcd) for data and permission details.

Links are eligible for quarantine only after 30 days with a confirmed 404/410 status. A rescan that finds them alive or fails temporarily resets the timer. Cleanup moves bookmarks to `Quarantaine — Bookmarks Sorter` with a reason and status. Confirmed dead links are removed automatically after 30 days in quarantine; if they respond again during that window, they are flagged for restoration. Duplicate bookmarks remain restorable until manually purged.

Each export, cleanup, restore, or purge stores a local snapshot (up to 30 versions), linked to its parent. Restoring a snapshot brings back missing bookmarks without deleting newer ones. JSON/HTML exports are downloaded by Chrome and are separate files from this history.

Duplicates always keep the oldest bookmark. `chrome://` pages and local files are never scanned.

## Layout

```
extension/    ← the Chrome extension (manifest.json, index.html, style.css, app.js, sw.js)
store/        ← Chrome Web Store listing, privacy policy and archived media kits
store/v1|v2|v3/ ← earlier media kits, landing pages and listing copy
store/v4/     ← current media kit: listing (1280×800) and landing captures, banners, GIF, video
store/website/ ← current bilingual landing, interactive playground and real screenshots
src/          ← companion Python pipeline (stdlib: stats + dedupe CLI)
archive/      ← old versions: src3 (sessions merge), first store website
data/         ← exports and working files
backups/      ← timestamped archives
```

## Conventions

- Zero dependencies: vanilla JS on the extension side, Python stdlib on the CLI side.
- Minimal root, no `node_modules`, no build.
- Every build meant to be tested gets a new `YYYY.MM.N` version, even for a small change. Run `python3 scripts/bump_version.py`, then reload the unpacked extension in `chrome://extensions`.
- Development: `bash scripts/dev.sh` syncs `extension/` to `~/dev/pk-web-memory-extension` — the stable folder to load once via `chrome://extensions` (“Load unpacked”). Then, after each change: run the script again and click **↻ Reload** on PK Web Memory, without quitting Chrome. Loading from this out-of-repo folder keeps Chrome from disabling the extension when project files move (git, tests, editors).
- Chrome requires a numeric version without a leading zero, so `version` uses `YYYY.M.N` (for example `2026.9.4`); `version_name` keeps the readable `YYYY.MM.N` (for example `2026.09.4`) shown in the extension header. See `CHANGELOG.md` for the history.
- See [CHANGELOG](CHANGELOG.md) for the full history.
- Tests: `node --test "extension/tests/*.test.mjs"`. The Dashboard test loads the real extension in a disposable Chrome profile (Chrome for Testing required, override with `CHROME_BIN`; skipped without it). Optional screenshots with `DASHBOARD_SHOTS=<folder>`.

## Support

A coffee helps keep the project going: [Ko-fi](https://ko-fi.com/pouark).

Project license: [MIT](LICENSE). The SQLite database is a local, unencrypted file; cloud backup depends on the folder you choose.
