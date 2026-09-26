# Sessions · PK

<img src="icon.png" width="72" alt="PK icon">

[Français](README.md) · [English](README.en.md)

A small **Tablerone-inspired** extension for finding tabs and resuming browsing sessions. **Version 2026.09.1** · Chrome Manifest V3 · local-only · no dependencies or build step. The interface is in French.

![Sessions timeline — preview with fictional data](store/01-timeline.png)

## Installation

1. Open `chrome://extensions` in Chrome 120+ (or a compatible Chromium browser).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select **this `src2/` folder**.
4. Pin **Sessions · PK** to the toolbar and click its icon.

The interface opens in a regular tab. **⌘⇧Y / Ctrl⇧Y** also opens it; customize the shortcut at `chrome://extensions/shortcuts`. The extension does not replace the New Tab page. It can coexist with Favoris (`../extension/`) and has separate storage.

## Features

| Feature | Behavior |
|---|---|
| Timeline | Live browser windows, followed by collections organized by date |
| Saving | All windows, one window, or selected tabs in its detail view |
| Save & close | Writes locally before closing; pinned tabs and tabs that navigated stay open |
| Restoration | New windows, native groups, colors, pinned tabs and active tab |
| Collections | Create from links, edit titles, favorites, tags, collection and per-tab notes |
| Organization | Move selections to a collection, remove tabs and deduplicate exact URLs |
| Search | Titles, URLs, tags and notes within the current section; **⌘K / Ctrl K** focuses search |
| Archives | Reversible archiving; previous copies retained before tab changes/removals or deduplication |
| Auto backups | Every 5 minutes, up to 20 distinct versions; no closing; favoriting makes a permanent collection |
| Tab sleep | Manual, or after 15/30/60 idle minutes; active, pinned and audible tabs are protected |
| Import/export | Sessions JSON, additive import; copy selected URLs or Markdown |
| Interface | Light/dark/system themes, compact density, keyboard navigation and native dialogs |

To permanently keep an automatic backup, favorite it or edit its title. Reopened sessions remain saved and can be opened again.

![Collection detail and tab selection](store/02-detail.png)

## Data and limits

- Data lives in `chrome.storage.local`, isolated by profile. No account, server, tracking or thumbnail service requests. Favicons use Chrome’s internal mechanism; the development preview uses initials.
- Storage uses Chrome’s standard quota (10 MB). Failed writes display an error and never close tabs. **Regularly export JSON** to an external location: uninstalling the extension removes its local data.
- Automatic snapshots can miss changes between runs or while the browser is stopped. The 20 retained snapshots are not an exhaustive history or a crash-recovery guarantee. **Save & close** explicitly preserves tabs before closing them.
- Only HTTP(S) URLs are saved/restored. Private windows, internal pages and local files are excluded. HTTP(S) URLs inside suspended pages’ `url`/`uri` parameters are recovered where possible.
- Native tab sleep may lose unsaved form content. It is **disabled by default**; save your work before enabling it.
- Collections are independent from Chrome bookmarks. No Google Drive/mobile sync, hosted sharing, automatic page screenshots or proprietary Tablerone import in this V1.
- Import JSON: `pk-sessions` format, schema `1`, at most 10 MB / 2,000 sessions / 5,000 tabs per session. Full validation before writing. Reimports add copies with new IDs; the current installation’s settings are retained.

### Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Read titles/URLs, locate, save, reopen, explicitly close and discard tabs |
| `tabGroups` | Read and recreate native tab groups |
| `storage` | Local library and settings |
| `alarms` | Periodic backups and idle-tab checks |
| `favicon` | Icons through the browser’s internal mechanism |

No global website access permission and no scripts injected into websites.

## Checks and preview

From the repository root (Node 22+ for tests):

```sh
node --test src2/tests/sessions.test.mjs
python3 -m http.server 8768 --bind 127.0.0.1 --directory src2
```

Then open **http://127.0.0.1:8768/?demo**. This preview runs the same business operations with a simulated Chrome API and fictional in-memory data. Reloading resets it. It cannot access real tabs. In extension mode, `?demo` does not activate the simulation.

Tests cover malicious imports, saving before closing, storage failures, URL changes, group restoration, protected tabs, backup rotation and concurrent writes. Documentation screenshots come from the preview, not personal data.

### Manual check after installation

Open two test tabs, pin one, create a tab group, then test **Enregistrer & fermer** (save & close) and **Tout rouvrir** (reopen all). Next, verify export/import and persistence after reloading the extension. This exercises the real Chrome APIs alongside the simulated tests.

## Structure

```text
manifest.json   Directly installable extension
sw.js           Chrome API and serialized writes
core.mjs        Validation, search and data transformations
index.html      Interface
style.css       Themes and responsive layout
app.js          Interactions and rendering
tests/          Dependency-free tests and simulated preview API
store/          Fictional screenshots and FR/EN description
```

## References reviewed

- [Tablerone website](https://tabler.one/)
- [FAQ](https://tabler.one/help-and-support/tag/faq/)
- [Changelog](https://tabler.one/help-and-support/tag/changelog/), including versions 1.11.0 and 1.13.1
- [Interface & Glossary](https://tabler.one/help-and-support/interface-glossary/)
- [Organizing tabs and sessions](https://tabler.one/help-and-support/organise-tabs-and-sessions/)

Independent implementation: no proprietary Tablerone code or visual identity reused. History: [CHANGELOG](CHANGELOG.md).
