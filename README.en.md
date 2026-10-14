# PK Web Memory

![PK Web Memory banner — your browsing life, organized](store/assets/banner-1544x500.png)

<img src="icon.png" width="88" alt="PK Web Memory icon">

[🇫🇷 Français](README.md) · [🇬🇧 English](README.en.md)

Your browsing life, organized: **bookmarks, history, sessions and your useful links together in one workspace.** Chrome extension with no build step or dependencies. Version **2026.10.10**.

## Preview

![Global search — real interface with demonstration data](store/website/screenshots/02-recherche.png)

![Session timeline — real interface in a disposable Chrome profile](store/website/screenshots/06-sessions.png)

The [bilingual landing page](store/website/index.html) detects the browser’s preferred language (English or French) and includes a manual language switch. It features eight expandable real screenshots and a full-width playground recreating the dashboard with fictional data: ⌘K search, inventory, gallery, duplicates, sessions, history and snapshots. The simulation and screenshots show the extension’s original French interface; thumbnails and favicons load via mshots and Google S2, just like the extension. The playground is not an embedded extension.

Preview: run `python3 -m http.server 4174 --bind 127.0.0.1`, then open `http://127.0.0.1:4174/store/website/`.

Regenerate screenshots with `node store/website/tools/capture.mjs` (Node 22+ and Chrome for Testing; override the binary with `CHROME_BIN`). The script loads `extension/` into a disposable headless profile, seeds demo bookmarks, visits and sessions through Chrome APIs, and captures the interface without altering its DOM, styles or images. The gallery uses favicon-only mode; the dead-link screen is shown before scanning, without invented results. Backup exports stay inside the temporary profile, which is removed on exit. The [provenance report](store/website/tools/capture-report.json) records dimensions, version and source/PNG hashes.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon in the toolbar → the dashboard opens

## Features

| Tab | What it does |
|---|---|
| **Dashboard** | Your useful links, sorted by category: a flat view onto a Chrome bookmark folder (“Category — Title”: the prefix makes the category, without one the link stays in “Sans catégorie”; bookmarks = links with favicons, hover page preview, confirmed dead links struck through). Add the current tab or a link by hand, rename in place (double-click or a visible pencil button), reorder and move between categories by drag and drop, cards that share the width by default according to their number, widen by their grip and move by dragging their title, filter as you type — legacy subfolders are flattened in one pass (the folder name becomes the prefix); the very same list as in Chrome’s bookmark manager, and deletions go to the app’s trash |
| **Global search** | ⌘K or any keystroke: Spotlight-like palette searching bookmarks, history and open tabs; ↵ opens the site or jumps to its tab |
| **Browsing history** | Timeline and visited pages, searchable by day and time range. Optional local archive (on by default): imports what Chrome still retains and keeps future visits beyond Chrome's window; a setting stops recording and a button clears the archive. Shortcuts: ⌥⇧D dashboard, ⌥⇧B bookmarks, ⌥⇧H history |
| **Inventory** | Totals, folder path and domain rankings, frequency bars and favicons |
| **Gallery** | mshots thumbnails or a compact list inspired by Chrome’s bookmark manager, with search, folder filter, shown/total count, column control and a 30-day local cache |
| **Duplicates** | 3 levels: 1 · exact URL · 2 · without tracking (utm, fbclid…) · 3 · without http/https, www and params |
| **Dead links** | Parallel scan; only confirmed HTTP 404/410 responses are dead, temporary failures stay under review |
| **Sessions** | Tablerone-style merged timeline: live session always expanded, a cross per row (close the tab or remove the link, undoable), hover page preview, click-to-widen view, save & close, save-only-the-selected-tabs, open-tab dedup (undoable), tab-zero “Resume” card, URL/titles/Markdown/HTML/CSV/JSON export (copy or file), 5-min auto backup, idle-tab sleeping (original URL always kept, Zzz badge, recap and one-click wake), scheduled daily session at the hour of your choice — **on by default at 07:00** — with optional JSON file export to the downloads folder (`PK Web Memory/`, Google Drive syncable) and a schedule reminder at the top of the tab, one click away from its settings |
| **Backup** | JSON/HTML downloads, local snapshot history with parent links, quarantine management |
| **Resources** | Live per-tab JS heap + network downloaded since load: adjustable interval (1 s / 2 s / 5 s / pause), weight bar, ↗/↘/→ trend on hover (JS heap ≈ ⅓ of Chrome’s memory footprint), scroll position preserved, click to activate the tab; same monitor in the Chrome side panel (right-click the icon), extension’s own heap included |
| **Icon badge** | Open-tab or duplicate-open-tab count shown on the toolbar icon (choose in settings) |
| **Home page** | Ctrl+T opens the extension on the section of your choice (dashboard, sessions, gallery, history…) |

## Safety

Gallery screenshots are requested from WordPress.com mshots, which receives the site URL. Retrieved images are cached in extension storage for 30 days (up to 60 entries), then refreshed on demand. Some fallback favicons use Google S2; link scans contact the checked websites without sending their cookies.

The Dashboard creates no parallel link storage: it reads and edits the Chrome bookmark folder you point it at, and only saves that folder choice. Nothing is sent anywhere. Deleting a link from the page follows the same path as every other cleanup: local snapshot, entry in the app’s trash, then removal of the bookmark.

Sessions and settings are stored locally. See the [privacy policy](store/privacy-policy.html) and [Chrome Web Store listing brief](store2/description-store.md) for data and permission details.

Links are eligible for quarantine only after 30 days with a confirmed 404/410 status. A rescan that finds them alive or fails temporarily resets the timer. Cleanup moves bookmarks to `Quarantaine — Bookmarks Sorter` with a reason and status. Confirmed dead links are removed automatically after 30 days in quarantine; if they respond again during that window, they are flagged for restoration. Duplicate bookmarks remain restorable until manually purged.

Each export, cleanup, restore, or purge stores a local snapshot (up to 30 versions), linked to its parent. Restoring a snapshot brings back missing bookmarks without deleting newer ones. JSON/HTML exports are downloaded by Chrome and are separate files from this history.

Duplicates always keep the oldest bookmark. `chrome://` pages and local files are never scanned.

## Layout

```
extension/    ← the Chrome extension (manifest.json, index.html, style.css, app.js, sw.js)
store/        ← Chrome Web Store listing, promo assets and privacy policy
store2/       ← earlier web kit and landing page
store3/       ← earlier premium visual direction
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
