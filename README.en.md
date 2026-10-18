# PK Web Memory

![PK Web Memory banner — your browsing life, organized](store/v4/assets/banner-1544x500.png)

<img src="icon.png" width="88" alt="PK Web Memory icon">

[🇫🇷 Français](README.md) · [🇬🇧 English](README.en.md)

Your browsing life, organized: **bookmarks, history, sessions and your useful links together in one workspace.** Chrome extension with no build step or remote dependencies to install. Version **2026.10.26**.

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
| **Browsing history** | Timeline and visited pages, searchable by day and time range. Optional local archive (on by default): imports what Chrome still retains and keeps future visits beyond Chrome's window; a setting stops recording and a button clears the archive. Shortcuts configurable for every rail tab — defaults ⌥⇧D dashboard, ⌥⇧B bookmarks, ⌥⇧H history, with Sessions/Resources/Settings free to assign; each tab's tooltip shows the live combo |
| **Inventory** | Totals, folder path and domain rankings, frequency bars and favicons |
| **Gallery** | mshots thumbnails or a compact list inspired by Chrome’s bookmark manager, with search, folder filter, shown/total count, column control and a 30-day local cache |
| **Duplicates** | 3 levels: 1 · exact URL · 2 · without tracking (utm, fbclid…) · 3 · without http/https, www and params |
| **Dead links** | Parallel scan; only confirmed HTTP 404/410 responses are dead, temporary failures stay under review |
| **Sessions** | Tablerone-style merged timeline: live session always expanded, a cross per row (close the tab or remove the link, undoable), hover page preview, click-to-widen view, save & close, selected-tab saving, open-tab dedup, tab-zero “Resume” card, URL/titles/Markdown/HTML/CSV/JSON export, 5-min auto backup, idle-tab sleeping, daily session at 07:00 by default, and recovery of recently closed windows/tabs. The local SQLite database keeps archived visits, pages and sessions in one user-chosen file under Application Support; reconnect it after reinstall to restore sessions. |
| **Backup** | JSON/HTML downloads, local snapshot history with parent links, quarantine management |
| **Resources** | Live per-tab JS heap + network downloaded since load: adjustable interval (1 s / 2 s / 5 s / pause), weight bar, ↗/↘/→ trend on hover (JS heap ≈ ⅓ of Chrome’s memory footprint), scroll position preserved, click to activate the tab; same monitor in the Chrome side panel (right-click the icon), extension’s own heap included |
| **Icon badge** | Open-tab or duplicate-open-tab count shown on the toolbar icon (choose in settings) |
| **Home page** | Ctrl+T opens the extension on the section of your choice (dashboard, sessions, gallery, history…) |

## Respiration: 10 open tabs means 10 open tabs

![Respiration — real version 2026.10.26 with fictional pages](store/respiration/screenshots/respiration-desktop.png)

![Every page of the tour — favicons, titles, URLs and states](store/respiration/screenshots/respiration-pages.png)

In **Sessions → Activer Respiration**, choose a window and a target number of web tabs (10 by default, from 1 to 30). **Only the last N tabs of the window stay open; everything else is saved, then closed.** The single exception: **media currently playing (video or audio)**, kept on top of the target and closed once it stops. With 100 pages, you keep 91 through 100: closing 100 brings back 90 on the left, then closing 99 brings back 89, without taking focus. The queue follows tab order, not recently visited order.

The panel shows three unambiguous counters: **Onglets ouverts** (open tabs — x / target, ongoing playback on top), **Fermés, à revenir** — saved then closed, each one returns on the next ⌘W — and **Fermés par vous** — pages you closed yourself, with no automatic return. “Voir toutes les pages” opens a large panel: favicon, title and full URL per row, color-coded state (solid border = open, dashed = queued, double = closed by you), per-state filter and search, updated live; clicking an open page focuses its tab, clicking a closed page reopens it.

Chrome groups become **capsules** (with a speaking favicon mosaic: solid = open, dimmed = closed by you), while consecutive ungrouped tabs retain their order. Append saved sessions, move capsules up/down or skip to the next capsule. A manually opened page belongs to the same budget: it is saved into a “Pages ajoutées à la fenêtre” capsule and the oldest of the last N tabs leaves. The target is rechecked on every page load and every 30 seconds. **Pause** stops refilling; **Terminer** stops the tour without closing open pages or deleting saved sessions.

**Save your drafts before activating**: modified forms, filled editors, active and pinned tabs are closed like any others when outside the last N — backups keep links and metadata, not what you typed. Chrome internal pages (chrome://, new tab…) stay open and outside the budget.

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
- Chrome requires a numeric version without a leading zero, so `version` uses `YYYY.M.N` (for example `2026.9.4`); `version_name` keeps the readable `YYYY.MM.N` (for example `2026.09.4`) shown in the extension header. See `CHANGELOG.md` for the history.
- See [CHANGELOG](CHANGELOG.md) for the full history.
- Tests: `node --test "extension/tests/*.test.mjs"`. The Dashboard test loads the real extension in a disposable Chrome profile (Chrome for Testing required, override with `CHROME_BIN`; skipped without it). Optional screenshots with `DASHBOARD_SHOTS=<folder>`.

## Support

A coffee helps keep the project going: [Ko-fi](https://ko-fi.com/pouark).

Project license: [MIT](LICENSE). The SQLite database is a local, unencrypted file; cloud backup depends on the folder you choose.
