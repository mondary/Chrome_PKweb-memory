# Chrome Bookmarks Sorter

Clean, deduplicate, visualize and back up thousands of Chrome bookmarks accumulated over 15 years. **Chrome extension, no build step, no dependencies.**

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon in the toolbar → the dashboard opens

## Features

| Tab | What it does |
|---|---|
| **Inventory** | Totals, folders, domains, tree, top domains |
| **Gallery** | Thumbnail grid (screenshots) with search and folder filter |
| **Duplicates** | 3 levels: 1 · exact URL · 2 · without tracking (utm, fbclid…) · 3 · without http/https, www and params |
| **Dead links** | Parallel URL scan, persisted status, `down for N days`, trash for dead > 30 days |
| **Backup** | JSON export + HTML export re-importable into Chrome, trash management |

## Safety

**Nothing is ever deleted automatically.** Every cleanup moves bookmarks to a `Corbeille — Bookmarks Sorter` trash folder. Only the trash can be emptied, manually, with confirmation.

Duplicates always keep the oldest bookmark. `chrome://` pages and local files are never scanned.

## Layout

```
extension/    ← the Chrome extension (manifest.json, index.html, style.css, app.js, sw.js)
src/          ← companion Python pipeline (stdlib: stats + dedupe CLI)
data/         ← exports and working files
backups/      ← timestamped archives
```

## Conventions

- Zero dependencies: vanilla JS on the extension side, Python stdlib on the CLI side.
- Minimal root, no `node_modules`, no build.
- Version `YYYY.MM.PATCH` — see `CHANGELOG.md`.
